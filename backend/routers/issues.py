"""Issues router."""
import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from core.db import get_db
from core.deps import get_current_membership, require_roles
from core.response import envelope, paginate_meta
from core.security import now_utc
from core.utils import new_id
from models.schemas import IssueCreate, IssueStatusChange, IssueUpdate

router = APIRouter(prefix="/projects/{project_id}/issues", tags=["issues"])


async def _log_activity(db, org_id, project_id, actor_id, action, entity_id, details=None):
    await db.activity_log.insert_one(
        {
            "id": new_id(),
            "organization_id": org_id,
            "project_id": project_id,
            "actor_id": actor_id,
            "action": action,
            "entity_type": "issue",
            "entity_id": entity_id,
            "details": details or {},
            "created_at": now_utc(),
        }
    )


async def _notify(db, org_id, user_id, ntype, title, message, entity_id, project_id):
    if not user_id:
        return
    await db.notifications.insert_one(
        {
            "id": new_id(),
            "organization_id": org_id,
            "user_id": user_id,
            "type": ntype,
            "title": title,
            "message": message,
            "entity_type": "issue",
            "entity_id": entity_id,
            "project_id": project_id,
            "is_read": False,
            "created_at": now_utc(),
        }
    )


async def _project_or_404(db, project_id, org_id):
    p = await db.projects.find_one({"id": project_id, "organization_id": org_id, "deleted_at": None})
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


@router.post("")
async def create_issue(
    project_id: str,
    payload: IssueCreate,
    ctx: dict = Depends(require_roles("admin", "project_manager", "site_engineer")),
):
    db = get_db()
    org_id = ctx["organization"]["id"]
    await _project_or_404(db, project_id, org_id)

    if payload.assignee_id:
        m = await db.memberships.find_one(
            {"user_id": payload.assignee_id, "organization_id": org_id, "is_active": True}
        )
        if not m:
            raise HTTPException(status_code=400, detail="Assignee is not a member of this organization")

    doc = {
        "id": new_id(),
        "organization_id": org_id,
        "project_id": project_id,
        "title": payload.title.strip(),
        "description": payload.description,
        "category": payload.category,
        "priority": payload.priority,
        "assignee_id": payload.assignee_id,
        "due_date": payload.due_date,
        "status": "open",
        "resolution_note": None,
        "resolved_by": None,
        "resolved_at": None,
        "closed_by": None,
        "closed_at": None,
        "reopen_reason": None,
        "created_by": ctx["user"]["id"],
        "created_at": now_utc(),
        "updated_at": now_utc(),
        "deleted_at": None,
    }
    await db.issues.insert_one(doc)

    for url in (payload.attachments or [])[:5]:
        await db.issue_attachments.insert_one(
            {
                "id": new_id(),
                "issue_id": doc["id"],
                "url": url,
                "uploaded_by": ctx["user"]["id"],
                "created_at": now_utc(),
            }
        )

    await _log_activity(db, org_id, project_id, ctx["user"]["id"], "issue.created", doc["id"], {"title": doc["title"], "priority": doc["priority"]})
    if doc["assignee_id"] and doc["assignee_id"] != ctx["user"]["id"]:
        await _notify(db, org_id, doc["assignee_id"], "issue.assigned",
                      "Issue assigned to you", doc["title"], doc["id"], project_id)
    doc.pop("_id", None)
    return envelope(doc)


@router.get("")
async def list_issues(
    project_id: str,
    ctx: dict = Depends(get_current_membership),
    status: str | None = None,
    priority: str | None = None,
    category: str | None = None,
    assignee_id: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    sort_by: str = Query(default="created_at"),
    order: str = Query(default="desc"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=200),
):
    db = get_db()
    org_id = ctx["organization"]["id"]
    await _project_or_404(db, project_id, org_id)

    query: dict = {"project_id": project_id, "organization_id": org_id, "deleted_at": None}
    if status:
        query["status"] = status
    if priority:
        query["priority"] = priority
    if category:
        query["category"] = category
    if assignee_id:
        query["assignee_id"] = assignee_id
    if date_from or date_to:
        rng = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to
        query["created_at"] = rng

    allowed_sort = {"created_at", "priority", "due_date", "status"}
    if sort_by not in allowed_sort:
        sort_by = "created_at"
    sort_dir = -1 if order.lower() == "desc" else 1

    total = await db.issues.count_documents(query)
    skip = (page - 1) * page_size
    docs = await db.issues.find(query).sort(sort_by, sort_dir).skip(skip).limit(page_size).to_list(length=page_size)

    user_ids = list({d.get("assignee_id") for d in docs if d.get("assignee_id")} | {d["created_by"] for d in docs})
    users = await db.users.find({"id": {"$in": user_ids}}).to_list(length=500)
    ub = {u["id"]: {"id": u["id"], "name": u.get("name"), "email": u["email"]} for u in users}

    for d in docs:
        d.pop("_id", None)
        d["assignee"] = ub.get(d.get("assignee_id")) if d.get("assignee_id") else None
        d["creator"] = ub.get(d["created_by"])
        d["overdue"] = bool(d.get("due_date") and d["status"] in ("open", "in_progress") and d["due_date"] < now_utc())

    return envelope(docs, meta=paginate_meta(total, page, page_size))


@router.get("/export.csv")
async def export_issues_csv(project_id: str, ctx: dict = Depends(get_current_membership)):
    db = get_db()
    org_id = ctx["organization"]["id"]
    await _project_or_404(db, project_id, org_id)
    issues = await db.issues.find({"project_id": project_id, "organization_id": org_id, "deleted_at": None}).sort("created_at", -1).to_list(length=10000)
    user_ids = list({i.get("assignee_id") for i in issues if i.get("assignee_id")} | {i["created_by"] for i in issues})
    users = await db.users.find({"id": {"$in": user_ids}}).to_list(length=1000)
    ub = {u["id"]: u for u in users}

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Title", "Category", "Priority", "Status", "Assignee", "Due Date", "Created By", "Created At", "Resolution Note"])
    for i in issues:
        a = ub.get(i.get("assignee_id") or "", {})
        c = ub.get(i.get("created_by") or "", {})
        w.writerow(
            [
                i.get("title", ""),
                i.get("category", ""),
                i.get("priority", ""),
                i.get("status", ""),
                a.get("name") or a.get("email") or "",
                i["due_date"].strftime("%d/%m/%Y") if i.get("due_date") else "",
                c.get("name") or c.get("email") or "",
                i["created_at"].strftime("%d/%m/%Y %H:%M") if i.get("created_at") else "",
                i.get("resolution_note") or "",
            ]
        )
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="issues_{project_id[:8]}.csv"'},
    )


@router.get("/{issue_id}")
async def get_issue(project_id: str, issue_id: str, ctx: dict = Depends(get_current_membership)):
    db = get_db()
    org_id = ctx["organization"]["id"]
    i = await db.issues.find_one({"id": issue_id, "project_id": project_id, "organization_id": org_id, "deleted_at": None})
    if not i:
        raise HTTPException(status_code=404, detail="Issue not found")
    i.pop("_id", None)

    attachments = await db.issue_attachments.find({"issue_id": issue_id}).to_list(length=100)
    for a in attachments:
        a.pop("_id", None)
    i["attachments"] = attachments

    user_ids = [u for u in [i.get("assignee_id"), i.get("created_by"), i.get("resolved_by"), i.get("closed_by")] if u]
    users = await db.users.find({"id": {"$in": user_ids}}).to_list(length=100)
    ub = {u["id"]: {"id": u["id"], "name": u.get("name"), "email": u["email"]} for u in users}
    i["assignee"] = ub.get(i.get("assignee_id")) if i.get("assignee_id") else None
    i["creator"] = ub.get(i.get("created_by"))
    i["resolver"] = ub.get(i.get("resolved_by")) if i.get("resolved_by") else None
    i["closer"] = ub.get(i.get("closed_by")) if i.get("closed_by") else None
    i["overdue"] = bool(i.get("due_date") and i["status"] in ("open", "in_progress") and i["due_date"] < now_utc())
    return envelope(i)


@router.patch("/{issue_id}")
async def update_issue(
    project_id: str,
    issue_id: str,
    payload: IssueUpdate,
    ctx: dict = Depends(require_roles("admin", "project_manager", "site_engineer")),
):
    db = get_db()
    org_id = ctx["organization"]["id"]
    issue = await db.issues.find_one({"id": issue_id, "project_id": project_id, "organization_id": org_id, "deleted_at": None})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    if "assignee_id" in updates and updates["assignee_id"] and updates["assignee_id"] != issue.get("assignee_id"):
        await _notify(db, org_id, updates["assignee_id"], "issue.assigned",
                      "Issue assigned to you", issue["title"], issue_id, project_id)

    updates["updated_at"] = now_utc()
    await db.issues.update_one({"id": issue_id}, {"$set": updates})
    await _log_activity(db, org_id, project_id, ctx["user"]["id"], "issue.updated", issue_id, {"fields": list(updates.keys())})
    updated = await db.issues.find_one({"id": issue_id})
    updated.pop("_id", None)
    return envelope(updated)


@router.post("/{issue_id}/status")
async def change_issue_status(
    project_id: str,
    issue_id: str,
    payload: IssueStatusChange,
    ctx: dict = Depends(require_roles("admin", "project_manager", "site_engineer")),
):
    db = get_db()
    org_id = ctx["organization"]["id"]
    role = ctx["membership"]["role"]
    issue = await db.issues.find_one({"id": issue_id, "project_id": project_id, "organization_id": org_id, "deleted_at": None})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    old = issue["status"]
    new = payload.status

    if new == "closed" and role not in ("admin", "project_manager"):
        raise HTTPException(status_code=403, detail="Only Admin or Project Manager can close an issue.")

    updates: dict = {"status": new, "updated_at": now_utc()}

    if new == "resolved":
        if not payload.resolution_note or not payload.resolution_note.strip():
            raise HTTPException(status_code=400, detail="Resolution note is required to resolve an issue.")
        updates["resolution_note"] = payload.resolution_note.strip()
        updates["resolved_by"] = ctx["user"]["id"]
        updates["resolved_at"] = now_utc()
    if new == "closed":
        updates["closed_by"] = ctx["user"]["id"]
        updates["closed_at"] = now_utc()
    if new == "open" and old in ("resolved", "closed"):
        if not payload.reopen_reason or not payload.reopen_reason.strip():
            raise HTTPException(status_code=400, detail="Reopen reason is required.")
        updates["reopen_reason"] = payload.reopen_reason.strip()
        updates["resolved_by"] = None
        updates["resolved_at"] = None
        updates["closed_by"] = None
        updates["closed_at"] = None

    await db.issues.update_one({"id": issue_id}, {"$set": updates})
    await _log_activity(
        db, org_id, project_id, ctx["user"]["id"], "issue.status_changed", issue_id,
        {"from": old, "to": new, "resolution_note": updates.get("resolution_note"), "reopen_reason": updates.get("reopen_reason")},
    )
    if issue.get("created_by") and issue["created_by"] != ctx["user"]["id"]:
        await _notify(db, org_id, issue["created_by"], "issue.status_changed",
                      f"Issue {new.replace('_',' ')}", issue["title"], issue_id, project_id)

    updated = await db.issues.find_one({"id": issue_id})
    updated.pop("_id", None)
    return envelope(updated)
