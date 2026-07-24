"""Daily logs router — one submitted log per project per user per date."""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo.errors import DuplicateKeyError

from core.db import get_db
from core.deps import project_ctx, require_project_roles
from core.response import envelope, paginate_meta
from core.security import now_utc
from core.utils import new_id
from models.schemas import DailyLogCreate, DailyLogUpdate

router = APIRouter(prefix="/projects/{project_id}/logs", tags=["daily_logs"])


async def _log_activity(db, org_id, project_id, actor_id, action, entity_id, details=None):
    await db.activity_log.insert_one(
        {
            "id": new_id(),
            "organization_id": org_id,
            "project_id": project_id,
            "actor_id": actor_id,
            "action": action,
            "entity_type": "daily_log",
            "entity_id": entity_id,
            "details": details or {},
            "created_at": now_utc(),
        }
    )


async def _project_or_404(db, project_id, org_id):
    p = await db.projects.find_one({"id": project_id, "organization_id": org_id, "deleted_at": None})
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


@router.post("")
async def create_log(
    project_id: str,
    payload: DailyLogCreate,
    ctx: dict = Depends(require_project_roles("admin", "project_manager", "site_engineer")),
):
    db = get_db()
    org_id = ctx["organization"]["id"]
    project = await _project_or_404(db, project_id, org_id)

    doc = {
        "id": new_id(),
        "organization_id": org_id,
        "project_id": project_id,
        "date": payload.date,
        "submitted_by": ctx["user"]["id"],
        "labour_count": payload.labour_count,
        "work_summary": payload.work_summary,
        "material_summary": payload.material_summary,
        "weather": payload.weather,
        "remarks": payload.remarks,
        "photos": payload.photos,
        "status": payload.status,
        "submitted_at": now_utc() if payload.status == "submitted" else None,
        "unlocked_until": None,
        "created_at": now_utc(),
        "updated_at": now_utc(),
        "deleted_at": None,
    }
    try:
        await db.daily_logs.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="A submitted log already exists for this date.")

    await _log_activity(
        db, org_id, project_id, ctx["user"]["id"],
        "log.submitted" if payload.status == "submitted" else "log.drafted",
        doc["id"], {"date": payload.date, "weather": payload.weather},
    )

    # Notify PM & Admins when submitted
    if payload.status == "submitted":
        recipients = await db.memberships.find(
            {"organization_id": org_id, "role": {"$in": ["admin", "project_manager"]}, "is_active": True}
        ).to_list(length=100)
        for r in recipients:
            if r["user_id"] == ctx["user"]["id"]:
                continue
            await db.notifications.insert_one(
                {
                    "id": new_id(),
                    "organization_id": org_id,
                    "user_id": r["user_id"],
                    "type": "log.submitted",
                    "title": f"Daily log submitted — {project.get('name', '')}",
                    "message": f"By {ctx['user'].get('name') or ctx['user']['email']} for {payload.date}",
                    "entity_type": "daily_log",
                    "entity_id": doc["id"],
                    "project_id": project_id,
                    "is_read": False,
                    "created_at": now_utc(),
                }
            )
    doc.pop("_id", None)
    return envelope(doc)


@router.get("")
async def list_logs(
    project_id: str,
    ctx: dict = Depends(project_ctx),
    date_from: str | None = None,
    date_to: str | None = None,
    submitted_by: str | None = None,
    weather: str | None = None,
    status: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    db = get_db()
    org_id = ctx["organization"]["id"]
    await _project_or_404(db, project_id, org_id)

    query: dict = {"project_id": project_id, "organization_id": org_id, "deleted_at": None}

    # Site engineers see only their logs
    if ctx["effective_role"] == "site_engineer":
        query["submitted_by"] = ctx["user"]["id"]
    elif submitted_by:
        query["submitted_by"] = submitted_by

    if weather:
        query["weather"] = weather
    if status:
        query["status"] = status
    if date_from or date_to:
        rng = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to
        query["date"] = rng

    total = await db.daily_logs.count_documents(query)
    skip = (page - 1) * page_size
    docs = await db.daily_logs.find(query).sort([("date", -1), ("created_at", -1)]).skip(skip).limit(page_size).to_list(length=page_size)

    user_ids = list({d["submitted_by"] for d in docs})
    users = await db.users.find({"id": {"$in": user_ids}}).to_list(length=500)
    ub = {u["id"]: {"id": u["id"], "name": u.get("name"), "email": u["email"]} for u in users}
    for d in docs:
        d.pop("_id", None)
        d["submitter"] = ub.get(d["submitted_by"])

    return envelope(docs, meta=paginate_meta(total, page, page_size))


@router.get("/{log_id}")
async def get_log(project_id: str, log_id: str, ctx: dict = Depends(project_ctx)):
    db = get_db()
    org_id = ctx["organization"]["id"]
    doc = await db.daily_logs.find_one({"id": log_id, "project_id": project_id, "organization_id": org_id, "deleted_at": None})
    if not doc:
        raise HTTPException(status_code=404, detail="Log not found")
    if ctx["effective_role"] == "site_engineer" and doc["submitted_by"] != ctx["user"]["id"]:
        raise HTTPException(status_code=403, detail="You can only view your own logs.")
    doc.pop("_id", None)
    u = await db.users.find_one({"id": doc["submitted_by"]})
    if u:
        doc["submitter"] = {"id": u["id"], "name": u.get("name"), "email": u["email"]}
    return envelope(doc)


@router.patch("/{log_id}")
async def update_log(
    project_id: str,
    log_id: str,
    payload: DailyLogUpdate,
    ctx: dict = Depends(require_project_roles("admin", "project_manager", "site_engineer")),
):
    db = get_db()
    org_id = ctx["organization"]["id"]
    doc = await db.daily_logs.find_one({"id": log_id, "project_id": project_id, "organization_id": org_id, "deleted_at": None})
    if not doc:
        raise HTTPException(status_code=404, detail="Log not found")

    is_owner = doc["submitted_by"] == ctx["user"]["id"]
    if doc["status"] == "submitted":
        unlocked = doc.get("unlocked_until") and doc["unlocked_until"] > now_utc()
        if not unlocked:
            raise HTTPException(status_code=403, detail="Submitted logs are read-only. Ask an admin to unlock.")
        if not is_owner and ctx["effective_role"] not in ("admin", "project_manager"):
            raise HTTPException(status_code=403, detail="Only the author can edit an unlocked log.")
    else:
        # draft: only owner can edit
        if not is_owner and ctx["effective_role"] not in ("admin", "project_manager"):
            raise HTTPException(status_code=403, detail="Only the author can edit this draft.")

    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    if "photos" in updates and updates["photos"] is not None and len(updates["photos"]) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 photos allowed")

    old_status = doc["status"]
    new_status = updates.get("status")
    if new_status == "submitted" and old_status != "submitted":
        updates["submitted_at"] = now_utc()
        await _log_activity(db, org_id, project_id, ctx["user"]["id"], "log.submitted", log_id, {"date": doc["date"]})
    else:
        await _log_activity(db, org_id, project_id, ctx["user"]["id"], "log.updated", log_id, {"fields": list(updates.keys())})

    updates["updated_at"] = now_utc()
    try:
        await db.daily_logs.update_one({"id": log_id}, {"$set": updates})
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="A submitted log already exists for this date.")

    updated = await db.daily_logs.find_one({"id": log_id})
    updated.pop("_id", None)
    return envelope(updated)


@router.post("/{log_id}/unlock")
async def unlock_log(project_id: str, log_id: str, ctx: dict = Depends(require_project_roles("admin"))):
    db = get_db()
    org_id = ctx["organization"]["id"]
    doc = await db.daily_logs.find_one({"id": log_id, "project_id": project_id, "organization_id": org_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Log not found")
    if doc["status"] != "submitted":
        raise HTTPException(status_code=400, detail="Only submitted logs can be unlocked.")
    submitted_at = doc.get("submitted_at")
    if submitted_at and (now_utc() - submitted_at) > timedelta(hours=24):
        raise HTTPException(status_code=400, detail="Log can only be unlocked within 24 hours of submission.")
    until = now_utc() + timedelta(hours=2)
    await db.daily_logs.update_one({"id": log_id}, {"$set": {"unlocked_until": until, "updated_at": now_utc()}})
    await _log_activity(db, org_id, project_id, ctx["user"]["id"], "log.unlocked", log_id, {"until": until.isoformat()})
    return envelope({"unlocked_until": until})
