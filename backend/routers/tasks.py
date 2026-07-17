"""Tasks router: CRUD, status change with history, comments, CSV export."""
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
from models.schemas import TaskCommentCreate, TaskCreate, TaskUpdate

router = APIRouter(prefix="/projects/{project_id}/tasks", tags=["tasks"])


async def _log_activity(db, org_id, project_id, actor_id, action, entity_type, entity_id, details=None):
    await db.activity_log.insert_one(
        {
            "id": new_id(),
            "organization_id": org_id,
            "project_id": project_id,
            "actor_id": actor_id,
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "details": details or {},
            "created_at": now_utc(),
        }
    )


async def _notify(db, org_id, user_id, ntype, title, message, entity_type, entity_id, project_id):
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
            "entity_type": entity_type,
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
async def create_task(
    project_id: str,
    payload: TaskCreate,
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

    task = {
        "id": new_id(),
        "organization_id": org_id,
        "project_id": project_id,
        "title": payload.title.strip(),
        "description": payload.description,
        "assignee_id": payload.assignee_id,
        "due_date": payload.due_date,
        "priority": payload.priority,
        "status": "todo",
        "created_by": ctx["user"]["id"],
        "created_at": now_utc(),
        "updated_at": now_utc(),
        "deleted_at": None,
    }
    await db.tasks.insert_one(task)

    for url in (payload.attachments or [])[:5]:
        await db.task_attachments.insert_one(
            {
                "id": new_id(),
                "task_id": task["id"],
                "url": url,
                "uploaded_by": ctx["user"]["id"],
                "created_at": now_utc(),
            }
        )

    await _log_activity(db, org_id, project_id, ctx["user"]["id"], "task.created", "task", task["id"], {"title": task["title"]})
    if task["assignee_id"] and task["assignee_id"] != ctx["user"]["id"]:
        await _notify(
            db, org_id, task["assignee_id"], "task.assigned",
            "Task assigned to you", task["title"], "task", task["id"], project_id,
        )
    task.pop("_id", None)
    return envelope(task)


@router.get("")
async def list_tasks(
    project_id: str,
    ctx: dict = Depends(get_current_membership),
    status: str | None = None,
    assignee_id: str | None = None,
    priority: str | None = None,
    due_from: datetime | None = None,
    due_to: datetime | None = None,
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
    if assignee_id:
        query["assignee_id"] = assignee_id
    if priority:
        query["priority"] = priority
    if due_from or due_to:
        rng = {}
        if due_from:
            rng["$gte"] = due_from
        if due_to:
            rng["$lte"] = due_to
        query["due_date"] = rng

    allowed_sort = {"created_at", "title", "assignee_id", "due_date", "priority", "status"}
    if sort_by not in allowed_sort:
        sort_by = "created_at"
    sort_dir = -1 if order.lower() == "desc" else 1

    total = await db.tasks.count_documents(query)
    skip = (page - 1) * page_size
    docs = await db.tasks.find(query).sort(sort_by, sort_dir).skip(skip).limit(page_size).to_list(length=page_size)

    # Enrich with assignee + creator names
    user_ids = list({d.get("assignee_id") for d in docs if d.get("assignee_id")} | {d["created_by"] for d in docs})
    users = await db.users.find({"id": {"$in": user_ids}}).to_list(length=500)
    user_by_id = {u["id"]: {"id": u["id"], "name": u.get("name"), "email": u["email"]} for u in users}

    out = []
    for d in docs:
        d.pop("_id", None)
        d["assignee"] = user_by_id.get(d.get("assignee_id")) if d.get("assignee_id") else None
        d["creator"] = user_by_id.get(d["created_by"])
        d["overdue"] = bool(d.get("due_date") and d["status"] != "done" and d["due_date"] < now_utc())
        out.append(d)

    return envelope(out, meta=paginate_meta(total, page, page_size))


@router.get("/export.csv")
async def export_tasks_csv(project_id: str, ctx: dict = Depends(get_current_membership)):
    db = get_db()
    org_id = ctx["organization"]["id"]
    await _project_or_404(db, project_id, org_id)
    tasks = await db.tasks.find({"project_id": project_id, "organization_id": org_id, "deleted_at": None}).sort("created_at", -1).to_list(length=10000)

    user_ids = list({t.get("assignee_id") for t in tasks if t.get("assignee_id")} | {t["created_by"] for t in tasks})
    users = await db.users.find({"id": {"$in": user_ids}}).to_list(length=1000)
    ub = {u["id"]: u for u in users}

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Title", "Status", "Priority", "Assignee", "Due Date", "Created By", "Created At"])
    for t in tasks:
        a = ub.get(t.get("assignee_id") or "", {})
        c = ub.get(t.get("created_by") or "", {})
        writer.writerow(
            [
                t.get("title", ""),
                t.get("status", ""),
                t.get("priority", ""),
                a.get("name") or a.get("email") or "",
                t["due_date"].strftime("%d/%m/%Y") if t.get("due_date") else "",
                c.get("name") or c.get("email") or "",
                t["created_at"].strftime("%d/%m/%Y %H:%M") if t.get("created_at") else "",
            ]
        )
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="tasks_{project_id[:8]}.csv"'},
    )


@router.get("/{task_id}")
async def get_task(project_id: str, task_id: str, ctx: dict = Depends(get_current_membership)):
    db = get_db()
    org_id = ctx["organization"]["id"]
    t = await db.tasks.find_one({"id": task_id, "project_id": project_id, "organization_id": org_id, "deleted_at": None})
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    t.pop("_id", None)

    history = await db.task_status_history.find({"task_id": task_id}).sort("changed_at", 1).to_list(length=500)
    comments = await db.task_comments.find({"task_id": task_id}).sort("created_at", 1).to_list(length=1000)
    attachments = await db.task_attachments.find({"task_id": task_id}).sort("created_at", 1).to_list(length=100)

    user_ids = list(
        {t.get("assignee_id"), t.get("created_by")}
        | {h["changed_by"] for h in history if h.get("changed_by")}
        | {c["author_id"] for c in comments}
    )
    user_ids = [u for u in user_ids if u]
    users = await db.users.find({"id": {"$in": user_ids}}).to_list(length=1000)
    ub = {u["id"]: {"id": u["id"], "name": u.get("name"), "email": u["email"]} for u in users}

    for h in history:
        h.pop("_id", None)
        h["changed_by_user"] = ub.get(h["changed_by"])
    for c in comments:
        c.pop("_id", None)
        c["author"] = ub.get(c["author_id"])
    for a in attachments:
        a.pop("_id", None)

    t["assignee"] = ub.get(t.get("assignee_id")) if t.get("assignee_id") else None
    t["creator"] = ub.get(t.get("created_by"))
    t["history"] = history
    t["comments"] = comments
    t["attachments"] = attachments
    t["overdue"] = bool(t.get("due_date") and t["status"] != "done" and t["due_date"] < now_utc())
    return envelope(t)


@router.patch("/{task_id}")
async def update_task(
    project_id: str,
    task_id: str,
    payload: TaskUpdate,
    ctx: dict = Depends(require_roles("admin", "project_manager", "site_engineer")),
):
    db = get_db()
    org_id = ctx["organization"]["id"]
    task = await db.tasks.find_one({"id": task_id, "project_id": project_id, "organization_id": org_id, "deleted_at": None})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    old_status = task["status"]
    new_status = updates.get("status")
    if new_status and new_status != old_status:
        # Linear default: todo -> in_progress -> done. Only admin/PM can move backwards.
        order = {"todo": 0, "in_progress": 1, "done": 2}
        if order[new_status] < order[old_status] and ctx["membership"]["role"] not in ("admin", "project_manager"):
            raise HTTPException(status_code=403, detail="Only Admin or PM can revert task status.")
        await db.task_status_history.insert_one(
            {
                "id": new_id(),
                "task_id": task_id,
                "from_status": old_status,
                "to_status": new_status,
                "changed_by": ctx["user"]["id"],
                "changed_at": now_utc(),
            }
        )
        await _log_activity(db, org_id, project_id, ctx["user"]["id"], "task.status_changed", "task", task_id,
                            {"title": task["title"], "from": old_status, "to": new_status})
        if task.get("created_by") and task["created_by"] != ctx["user"]["id"]:
            await _notify(db, org_id, task["created_by"], "task.status_changed",
                          f"Task status: {new_status.replace('_', ' ')}", task["title"], "task", task_id, project_id)
    else:
        await _log_activity(db, org_id, project_id, ctx["user"]["id"], "task.updated", "task", task_id, {"fields": list(updates.keys())})

    if "assignee_id" in updates and updates["assignee_id"] and updates["assignee_id"] != task.get("assignee_id"):
        await _notify(db, org_id, updates["assignee_id"], "task.assigned",
                      "Task assigned to you", task["title"], "task", task_id, project_id)

    updates["updated_at"] = now_utc()
    await db.tasks.update_one({"id": task_id}, {"$set": updates})
    updated = await db.tasks.find_one({"id": task_id})
    updated.pop("_id", None)
    return envelope(updated)


@router.post("/{task_id}/comments")
async def add_comment(
    project_id: str,
    task_id: str,
    payload: TaskCommentCreate,
    ctx: dict = Depends(require_roles("admin", "project_manager", "site_engineer", "viewer")),
):
    db = get_db()
    org_id = ctx["organization"]["id"]
    if ctx["membership"]["role"] == "viewer":
        raise HTTPException(status_code=403, detail="Viewers cannot comment.")
    task = await db.tasks.find_one({"id": task_id, "project_id": project_id, "organization_id": org_id, "deleted_at": None})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    c = {
        "id": new_id(),
        "task_id": task_id,
        "author_id": ctx["user"]["id"],
        "text": payload.text.strip(),
        "created_at": now_utc(),
    }
    await db.task_comments.insert_one(c)
    c.pop("_id", None)
    return envelope(c)
