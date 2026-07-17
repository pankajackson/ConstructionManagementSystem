"""In-app notifications router."""
from fastapi import APIRouter, Depends, HTTPException, Query

from core.db import get_db
from core.deps import get_current_membership
from core.response import envelope, paginate_meta
from core.security import now_utc

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(
    ctx: dict = Depends(get_current_membership),
    unread_only: bool = False,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
):
    db = get_db()
    query = {"user_id": ctx["user"]["id"], "organization_id": ctx["organization"]["id"]}
    if unread_only:
        query["is_read"] = False
    total = await db.notifications.count_documents(query)
    skip = (page - 1) * page_size
    docs = await db.notifications.find(query).sort("created_at", -1).skip(skip).limit(page_size).to_list(length=page_size)
    for d in docs:
        d.pop("_id", None)
    unread = await db.notifications.count_documents(
        {"user_id": ctx["user"]["id"], "organization_id": ctx["organization"]["id"], "is_read": False}
    )
    return envelope(docs, meta={**paginate_meta(total, page, page_size), "unread": unread})


@router.get("/unread-count")
async def unread_count(ctx: dict = Depends(get_current_membership)):
    db = get_db()
    n = await db.notifications.count_documents(
        {"user_id": ctx["user"]["id"], "organization_id": ctx["organization"]["id"], "is_read": False}
    )
    return envelope({"unread": n})


@router.post("/{notification_id}/read")
async def mark_read(notification_id: str, ctx: dict = Depends(get_current_membership)):
    db = get_db()
    res = await db.notifications.update_one(
        {"id": notification_id, "user_id": ctx["user"]["id"]},
        {"$set": {"is_read": True, "read_at": now_utc()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return envelope({"ok": True})


@router.post("/read-all")
async def read_all(ctx: dict = Depends(get_current_membership)):
    db = get_db()
    res = await db.notifications.update_many(
        {"user_id": ctx["user"]["id"], "organization_id": ctx["organization"]["id"], "is_read": False},
        {"$set": {"is_read": True, "read_at": now_utc()}},
    )
    return envelope({"marked": res.modified_count})
