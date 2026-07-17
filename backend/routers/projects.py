"""Projects router."""
from datetime import timedelta
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query

from core.db import get_db
from core.deps import can_manage_project, get_current_membership, require_roles
from core.response import envelope, paginate_meta
from core.security import now_utc
from core.utils import new_id
from models.schemas import ProjectCreate, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["projects"])


async def _log_activity(db, org_id: str, project_id: str, actor_id: str, action: str, entity_type: str, entity_id: str, details: dict | None = None):
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


@router.post("")
async def create_project(payload: ProjectCreate, ctx: dict = Depends(require_roles("admin", "project_manager"))):
    db = get_db()
    org_id = ctx["organization"]["id"]

    # Validate PM if provided
    if payload.project_manager_id:
        pm = await db.memberships.find_one(
            {"user_id": payload.project_manager_id, "organization_id": org_id, "is_active": True}
        )
        if not pm or pm["role"] not in ("admin", "project_manager"):
            raise HTTPException(status_code=400, detail="Assigned project manager must be an Admin or Project Manager in this org.")

    doc = {
        "id": new_id(),
        "organization_id": org_id,
        "name": payload.name.strip(),
        "description": payload.description,
        "location": payload.location,
        "start_date": payload.start_date,
        "expected_end_date": payload.expected_end_date,
        "project_manager_id": payload.project_manager_id or ctx["user"]["id"],
        "status": "on_track",
        "archived": False,
        "created_by": ctx["user"]["id"],
        "created_at": now_utc(),
        "updated_at": now_utc(),
        "deleted_at": None,
    }
    await db.projects.insert_one(doc)
    await _log_activity(db, org_id, doc["id"], ctx["user"]["id"], "project.created", "project", doc["id"], {"name": doc["name"]})
    doc.pop("_id", None)
    return envelope(doc)


@router.get("")
async def list_projects(
    ctx: dict = Depends(get_current_membership),
    q: str | None = Query(default=None),
    status: str | None = Query(default=None),
    archived: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    db = get_db()
    org_id = ctx["organization"]["id"]
    query: dict = {"organization_id": org_id, "deleted_at": None, "archived": archived}
    if status:
        query["status"] = status
    if q:
        query["name"] = {"$regex": q, "$options": "i"}

    total = await db.projects.count_documents(query)
    skip = (page - 1) * page_size
    docs = await db.projects.find(query).sort("created_at", -1).skip(skip).limit(page_size).to_list(length=page_size)

    # For each project attach basic counts
    project_ids = [d["id"] for d in docs]
    task_counts = {}
    open_issue_counts = {}
    log_counts = {}
    if project_ids:
        # Aggregate task counts
        agg = db.tasks.aggregate(
            [
                {"$match": {"project_id": {"$in": project_ids}, "deleted_at": None}},
                {"$group": {"_id": {"pid": "$project_id", "status": "$status"}, "count": {"$sum": 1}}},
            ]
        )
        async for row in agg:
            pid = row["_id"]["pid"]
            task_counts.setdefault(pid, {"total": 0, "done": 0})
            task_counts[pid]["total"] += row["count"]
            if row["_id"]["status"] == "done":
                task_counts[pid]["done"] += row["count"]

        iss = db.issues.aggregate(
            [
                {"$match": {"project_id": {"$in": project_ids}, "deleted_at": None, "status": {"$in": ["open", "in_progress"]}}},
                {"$group": {"_id": "$project_id", "count": {"$sum": 1}}},
            ]
        )
        async for row in iss:
            open_issue_counts[row["_id"]] = row["count"]

        week_ago = now_utc() - timedelta(days=7)
        lg = db.daily_logs.aggregate(
            [
                {"$match": {"project_id": {"$in": project_ids}, "deleted_at": None, "status": "submitted", "created_at": {"$gte": week_ago}}},
                {"$group": {"_id": "$project_id", "count": {"$sum": 1}}},
            ]
        )
        async for row in lg:
            log_counts[row["_id"]] = row["count"]

    out = []
    for d in docs:
        d.pop("_id", None)
        tc = task_counts.get(d["id"], {"total": 0, "done": 0})
        progress = int((tc["done"] / tc["total"]) * 100) if tc["total"] else 0
        d["stats"] = {
            "tasks_total": tc["total"],
            "tasks_done": tc["done"],
            "progress_pct": progress,
            "open_issues": open_issue_counts.get(d["id"], 0),
            "logs_this_week": log_counts.get(d["id"], 0),
        }
        out.append(d)

    return envelope(out, meta=paginate_meta(total, page, page_size))


@router.get("/{project_id}")
async def get_project(project_id: str, ctx: dict = Depends(get_current_membership)):
    db = get_db()
    org_id = ctx["organization"]["id"]
    p = await db.projects.find_one({"id": project_id, "organization_id": org_id, "deleted_at": None})
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    p.pop("_id", None)

    # Stats
    total_tasks = await db.tasks.count_documents({"project_id": project_id, "deleted_at": None})
    done_tasks = await db.tasks.count_documents({"project_id": project_id, "deleted_at": None, "status": "done"})
    open_issues = await db.issues.count_documents(
        {"project_id": project_id, "deleted_at": None, "status": {"$in": ["open", "in_progress"]}}
    )
    week_ago = now_utc() - timedelta(days=7)
    logs_this_week = await db.daily_logs.count_documents(
        {"project_id": project_id, "deleted_at": None, "status": "submitted", "created_at": {"$gte": week_ago}}
    )

    # Team member count: distinct users active in the org (simplification for MVP)
    team_count = await db.memberships.count_documents({"organization_id": org_id, "is_active": True})

    # Recent activity — last 10
    activity_cursor = db.activity_log.find({"project_id": project_id}).sort("created_at", -1).limit(10)
    activity = await activity_cursor.to_list(length=10)
    actor_ids = list({a["actor_id"] for a in activity if a.get("actor_id")})
    users = await db.users.find({"id": {"$in": actor_ids}}).to_list(length=100)
    user_by_id = {u["id"]: u for u in users}
    activity_out = []
    for a in activity:
        a.pop("_id", None)
        u = user_by_id.get(a["actor_id"], {})
        a["actor"] = {"id": u.get("id"), "name": u.get("name"), "email": u.get("email")}
        activity_out.append(a)

    # PM info
    pm = None
    if p.get("project_manager_id"):
        pm_user = await db.users.find_one({"id": p["project_manager_id"]})
        if pm_user:
            pm = {"id": pm_user["id"], "name": pm_user.get("name"), "email": pm_user["email"]}

    p["stats"] = {
        "tasks_total": total_tasks,
        "tasks_done": done_tasks,
        "progress_pct": int((done_tasks / total_tasks) * 100) if total_tasks else 0,
        "open_issues": open_issues,
        "logs_this_week": logs_this_week,
        "team_members": team_count,
    }
    p["project_manager"] = pm
    p["recent_activity"] = activity_out
    return envelope(p)


@router.patch("/{project_id}")
async def update_project(
    project_id: str,
    payload: ProjectUpdate,
    ctx: dict = Depends(require_roles("admin", "project_manager")),
):
    db = get_db()
    org_id = ctx["organization"]["id"]
    project = await db.projects.find_one({"id": project_id, "organization_id": org_id, "deleted_at": None})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    if "status" in updates and updates["status"] != project.get("status"):
        await _log_activity(
            db, org_id, project_id, ctx["user"]["id"], "project.status_changed", "project", project_id,
            {"from": project.get("status"), "to": updates["status"]},
        )
    else:
        await _log_activity(db, org_id, project_id, ctx["user"]["id"], "project.updated", "project", project_id, {"fields": list(updates.keys())})

    updates["updated_at"] = now_utc()
    await db.projects.update_one({"id": project_id}, {"$set": updates})
    updated = await db.projects.find_one({"id": project_id})
    updated.pop("_id", None)
    return envelope(updated)


@router.post("/{project_id}/archive")
async def archive_project(project_id: str, ctx: dict = Depends(require_roles("admin", "project_manager"))):
    db = get_db()
    org_id = ctx["organization"]["id"]
    project = await db.projects.find_one({"id": project_id, "organization_id": org_id, "deleted_at": None})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.projects.update_one({"id": project_id}, {"$set": {"archived": True, "updated_at": now_utc()}})
    await _log_activity(db, org_id, project_id, ctx["user"]["id"], "project.archived", "project", project_id, {})
    return envelope({"archived": True})


@router.post("/{project_id}/unarchive")
async def unarchive_project(project_id: str, ctx: dict = Depends(require_roles("admin", "project_manager"))):
    db = get_db()
    org_id = ctx["organization"]["id"]
    project = await db.projects.find_one({"id": project_id, "organization_id": org_id, "deleted_at": None})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.projects.update_one({"id": project_id}, {"$set": {"archived": False, "updated_at": now_utc()}})
    return envelope({"archived": False})


@router.get("/{project_id}/activity")
async def project_activity(
    project_id: str,
    ctx: dict = Depends(get_current_membership),
    limit: int = Query(default=50, ge=1, le=200),
):
    db = get_db()
    project = await db.projects.find_one({"id": project_id, "organization_id": ctx["organization"]["id"]})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    activity = await db.activity_log.find({"project_id": project_id}).sort("created_at", -1).limit(limit).to_list(length=limit)
    actor_ids = list({a["actor_id"] for a in activity if a.get("actor_id")})
    users = await db.users.find({"id": {"$in": actor_ids}}).to_list(length=200)
    user_by_id = {u["id"]: u for u in users}
    out = []
    for a in activity:
        a.pop("_id", None)
        u = user_by_id.get(a["actor_id"], {})
        a["actor"] = {"id": u.get("id"), "name": u.get("name"), "email": u.get("email")}
        out.append(a)
    return envelope(out)
