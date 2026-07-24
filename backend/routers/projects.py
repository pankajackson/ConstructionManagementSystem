"""Projects router."""
from datetime import timedelta
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query

from core.db import get_db
from core.deps import (
    get_accessible_project_ids,
    get_current_membership,
    project_ctx,
    require_project_roles,
    require_roles,
    resolve_project_access,
)
from core.response import envelope, paginate_meta
from core.security import now_utc
from core.utils import new_id
from models.schemas import ProjectCreate, ProjectMemberAssign, ProjectMemberUpdate, ProjectUpdate

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


async def _ensure_pm_membership(db, project_id: str, org_id: str, user_id: str, actor_id: str) -> None:
    """Idempotently record the PM as a project_member with project_manager role."""
    if not user_id:
        return
    existing = await db.project_members.find_one({"project_id": project_id, "user_id": user_id})
    if existing:
        roles = existing.get("roles", [])
        if "project_manager" not in roles:
            roles = list(dict.fromkeys([*roles, "project_manager"]))
            await db.project_members.update_one(
                {"id": existing["id"]},
                {"$set": {"roles": roles, "updated_at": now_utc()}},
            )
        return
    await db.project_members.insert_one(
        {
            "id": new_id(),
            "organization_id": org_id,
            "project_id": project_id,
            "user_id": user_id,
            "roles": ["project_manager"],
            "added_by": actor_id,
            "added_at": now_utc(),
            "updated_at": now_utc(),
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

    project_id = new_id()
    pm_user_id = payload.project_manager_id or ctx["user"]["id"]
    doc = {
        "id": project_id,
        "organization_id": org_id,
        "name": payload.name.strip(),
        "description": payload.description,
        "location": payload.location,
        "start_date": payload.start_date,
        "expected_end_date": payload.expected_end_date,
        "project_manager_id": pm_user_id,
        "status": "on_track",
        "archived": False,
        "created_by": ctx["user"]["id"],
        "created_at": now_utc(),
        "updated_at": now_utc(),
        "deleted_at": None,
    }
    await db.projects.insert_one(doc)
    # Auto-assign PM as project member; also add creator if different (as admin role for the project)
    await _ensure_pm_membership(db, project_id, org_id, pm_user_id, ctx["user"]["id"])
    if ctx["user"]["id"] != pm_user_id:
        # Creator (admin/PM) gets admin project role for convenience
        await db.project_members.insert_one(
            {
                "id": new_id(),
                "organization_id": org_id,
                "project_id": project_id,
                "user_id": ctx["user"]["id"],
                "roles": ["admin"] if ctx["membership"]["role"] == "admin" else ["project_manager"],
                "added_by": ctx["user"]["id"],
                "added_at": now_utc(),
                "updated_at": now_utc(),
            }
        )
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
    org_role = ctx["membership"]["role"]

    query: dict = {"organization_id": org_id, "deleted_at": None, "archived": archived}
    if status:
        query["status"] = status
    if q:
        query["name"] = {"$regex": q, "$options": "i"}

    # Restrict to accessible projects (org admins see all)
    accessible = await get_accessible_project_ids(db, ctx["user"]["id"], org_id, org_role)
    if accessible is not None:
        if not accessible:
            return envelope([], meta=paginate_meta(0, page, page_size))
        query["id"] = {"$in": accessible}

    total = await db.projects.count_documents(query)
    skip = (page - 1) * page_size
    docs = await db.projects.find(query).sort("created_at", -1).skip(skip).limit(page_size).to_list(length=page_size)

    # For each project attach basic counts
    project_ids = [d["id"] for d in docs]
    task_counts = {}
    open_issue_counts = {}
    log_counts = {}
    my_roles_by_project: dict[str, list[str]] = {}
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

        # Compute the caller's per-project roles for badges on cards
        my_pms = await db.project_members.find(
            {"organization_id": org_id, "user_id": ctx["user"]["id"], "project_id": {"$in": project_ids}}
        ).to_list(length=len(project_ids))
        for m in my_pms:
            my_roles_by_project[m["project_id"]] = list(m.get("roles", []))

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
        # Effective roles for the current user
        if org_role == "admin":
            d["my_roles"] = ["admin"]
        else:
            roles = list(my_roles_by_project.get(d["id"], []))
            if d.get("project_manager_id") == ctx["user"]["id"] and "project_manager" not in roles:
                roles.append("project_manager")
            d["my_roles"] = roles
        out.append(d)

    return envelope(out, meta=paginate_meta(total, page, page_size))


@router.get("/{project_id}")
async def get_project(project_id: str, ctx: dict = Depends(project_ctx)):
    db = get_db()
    org_id = ctx["organization"]["id"]
    p = ctx["project"]

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

    # Team member count for THIS project (project_members + implicit PM)
    pm_docs = await db.project_members.find({"project_id": project_id}).to_list(length=500)
    member_user_ids = {m["user_id"] for m in pm_docs}
    if p.get("project_manager_id"):
        member_user_ids.add(p["project_manager_id"])
    team_count = len(member_user_ids)

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
    p["my_role"] = ctx["effective_role"]
    p["my_roles"] = ctx["effective_roles"]
    return envelope(p)


@router.patch("/{project_id}")
async def update_project(
    project_id: str,
    payload: ProjectUpdate,
    ctx: dict = Depends(require_project_roles("admin", "project_manager")),
):
    db = get_db()
    org_id = ctx["organization"]["id"]
    project = ctx["project"]

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
    # If PM changed, ensure PM is a project member
    if "project_manager_id" in updates and updates["project_manager_id"]:
        await _ensure_pm_membership(db, project_id, org_id, updates["project_manager_id"], ctx["user"]["id"])
    updated = await db.projects.find_one({"id": project_id})
    updated.pop("_id", None)
    return envelope(updated)


@router.post("/{project_id}/archive")
async def archive_project(project_id: str, ctx: dict = Depends(require_project_roles("admin", "project_manager"))):
    db = get_db()
    org_id = ctx["organization"]["id"]
    await db.projects.update_one({"id": project_id}, {"$set": {"archived": True, "updated_at": now_utc()}})
    await _log_activity(db, org_id, project_id, ctx["user"]["id"], "project.archived", "project", project_id, {})
    return envelope({"archived": True})


@router.post("/{project_id}/unarchive")
async def unarchive_project(project_id: str, ctx: dict = Depends(require_project_roles("admin", "project_manager"))):
    db = get_db()
    org_id = ctx["organization"]["id"]
    await db.projects.update_one({"id": project_id}, {"$set": {"archived": False, "updated_at": now_utc()}})
    return envelope({"archived": False})


@router.get("/{project_id}/activity")
async def project_activity(
    project_id: str,
    ctx: dict = Depends(project_ctx),
    limit: int = Query(default=50, ge=1, le=200),
):
    db = get_db()
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


# ============= Project Members =============

@router.get("/{project_id}/members")
async def list_project_members(project_id: str, ctx: dict = Depends(project_ctx)):
    """List members assigned to this project, with per-project roles + org info."""
    db = get_db()
    org_id = ctx["organization"]["id"]
    project = ctx["project"]

    pm_docs = await db.project_members.find({"project_id": project_id}).to_list(length=500)
    # Include the PM as an implicit member if not present in project_members
    user_ids = {m["user_id"] for m in pm_docs}
    implicit_pm = None
    if project.get("project_manager_id") and project["project_manager_id"] not in user_ids:
        implicit_pm = project["project_manager_id"]
        user_ids.add(implicit_pm)

    users = await db.users.find({"id": {"$in": list(user_ids)}}).to_list(length=500)
    users_by_id = {u["id"]: u for u in users}

    memberships = await db.memberships.find(
        {"organization_id": org_id, "user_id": {"$in": list(user_ids)}}
    ).to_list(length=500)
    org_role_by_user = {m["user_id"]: m for m in memberships}

    out = []
    for m in pm_docs:
        u = users_by_id.get(m["user_id"])
        if not u:
            continue
        org_m = org_role_by_user.get(m["user_id"], {})
        out.append(
            {
                "id": m["id"],
                "user_id": u["id"],
                "email": u["email"],
                "name": u.get("name"),
                "roles": list(m.get("roles", [])),
                "org_role": org_m.get("role"),
                "is_active": org_m.get("is_active", True) and u.get("is_active", True),
                "added_at": m.get("added_at"),
                "added_by": m.get("added_by"),
                "is_project_manager": u["id"] == project.get("project_manager_id"),
            }
        )
    if implicit_pm:
        u = users_by_id.get(implicit_pm)
        if u:
            org_m = org_role_by_user.get(implicit_pm, {})
            out.append(
                {
                    "id": None,
                    "user_id": u["id"],
                    "email": u["email"],
                    "name": u.get("name"),
                    "roles": ["project_manager"],
                    "org_role": org_m.get("role"),
                    "is_active": org_m.get("is_active", True) and u.get("is_active", True),
                    "added_at": None,
                    "added_by": None,
                    "is_project_manager": True,
                }
            )
    out.sort(key=lambda x: (not x["is_project_manager"], (x["name"] or "").lower()))
    return envelope(out)


@router.post("/{project_id}/members")
async def assign_project_member(
    project_id: str,
    payload: ProjectMemberAssign,
    ctx: dict = Depends(require_project_roles("admin", "project_manager")),
):
    db = get_db()
    org_id = ctx["organization"]["id"]

    target = await db.memberships.find_one(
        {"user_id": payload.user_id, "organization_id": org_id, "is_active": True}
    )
    if not target:
        raise HTTPException(status_code=400, detail="User is not an active member of this organization.")

    existing = await db.project_members.find_one({"project_id": project_id, "user_id": payload.user_id})
    if existing:
        raise HTTPException(status_code=409, detail="User is already assigned to this project. Use update to change roles.")

    doc = {
        "id": new_id(),
        "organization_id": org_id,
        "project_id": project_id,
        "user_id": payload.user_id,
        "roles": payload.roles,
        "added_by": ctx["user"]["id"],
        "added_at": now_utc(),
        "updated_at": now_utc(),
    }
    await db.project_members.insert_one(doc)
    await _log_activity(
        db, org_id, project_id, ctx["user"]["id"], "project.member_assigned", "project_member", doc["id"],
        {"user_id": payload.user_id, "roles": payload.roles},
    )
    # Notify the assigned user
    await db.notifications.insert_one(
        {
            "id": new_id(),
            "organization_id": org_id,
            "user_id": payload.user_id,
            "type": "project.assigned",
            "title": "Assigned to a project",
            "message": f"You were assigned to {ctx['project']['name']} as {', '.join(payload.roles)}.",
            "entity_type": "project",
            "entity_id": project_id,
            "project_id": project_id,
            "is_read": False,
            "created_at": now_utc(),
        }
    )
    doc.pop("_id", None)
    return envelope(doc)


@router.patch("/{project_id}/members/{user_id}")
async def update_project_member(
    project_id: str,
    user_id: str,
    payload: ProjectMemberUpdate,
    ctx: dict = Depends(require_project_roles("admin", "project_manager")),
):
    db = get_db()
    org_id = ctx["organization"]["id"]
    m = await db.project_members.find_one({"project_id": project_id, "user_id": user_id})
    if not m:
        raise HTTPException(status_code=404, detail="Member not found on this project")
    await db.project_members.update_one(
        {"id": m["id"]},
        {"$set": {"roles": payload.roles, "updated_at": now_utc()}},
    )
    await _log_activity(
        db, org_id, project_id, ctx["user"]["id"], "project.member_roles_updated", "project_member", m["id"],
        {"user_id": user_id, "roles": payload.roles},
    )
    return envelope({"user_id": user_id, "roles": payload.roles})


@router.delete("/{project_id}/members/{user_id}")
async def remove_project_member(
    project_id: str,
    user_id: str,
    ctx: dict = Depends(require_project_roles("admin", "project_manager")),
):
    db = get_db()
    org_id = ctx["organization"]["id"]
    project = ctx["project"]
    if project.get("project_manager_id") == user_id:
        raise HTTPException(
            status_code=400,
            detail="Cannot remove the Project Manager. Reassign PM first.",
        )
    m = await db.project_members.find_one({"project_id": project_id, "user_id": user_id})
    if not m:
        raise HTTPException(status_code=404, detail="Member not found on this project")
    await db.project_members.delete_one({"id": m["id"]})
    await _log_activity(
        db, org_id, project_id, ctx["user"]["id"], "project.member_removed", "project_member", m["id"],
        {"user_id": user_id},
    )
    return envelope({"removed": True})
