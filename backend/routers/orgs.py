"""Organization and membership routes."""
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException

from core.db import get_db
from core.deps import get_current_membership, get_current_user, require_roles
from core.response import envelope
from core.security import gen_url_token, now_utc
from core.utils import new_id
from models.schemas import InviteCreate, MembershipUpdate, OrgCreate, OrgUpdate

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.post("")
async def create_org(payload: OrgCreate, user: dict = Depends(get_current_user)):
    db = get_db()
    org_id = new_id()
    doc = {
        "id": org_id,
        "name": payload.name.strip(),
        "description": payload.description,
        "created_by": user["id"],
        "created_at": now_utc(),
        "updated_at": now_utc(),
        "deleted_at": None,
    }
    await db.organizations.insert_one(doc)
    # Creator becomes admin
    await db.memberships.insert_one(
        {
            "id": new_id(),
            "user_id": user["id"],
            "organization_id": org_id,
            "role": "admin",
            "invited_by": None,
            "is_active": True,
            "created_at": now_utc(),
            "updated_at": now_utc(),
        }
    )
    doc.pop("_id", None)
    return envelope({**doc, "role": "admin"})


@router.get("")
async def list_my_orgs(user: dict = Depends(get_current_user)):
    db = get_db()
    memberships = await db.memberships.find({"user_id": user["id"], "is_active": True}).to_list(length=100)
    ids = [m["organization_id"] for m in memberships]
    orgs = await db.organizations.find({"id": {"$in": ids}, "deleted_at": None}).to_list(length=100)
    by_id = {o["id"]: o for o in orgs}
    out = []
    for m in memberships:
        o = by_id.get(m["organization_id"])
        if not o:
            continue
        o.pop("_id", None)
        out.append({**o, "role": m["role"]})
    return envelope(out)


@router.get("/current")
async def get_current_org(ctx: dict = Depends(get_current_membership)):
    org = ctx["organization"]
    return envelope({**org, "role": ctx["membership"]["role"]})


@router.patch("/current")
async def update_current_org(payload: OrgUpdate, ctx: dict = Depends(require_roles("admin"))):
    db = get_db()
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    if updates:
        updates["updated_at"] = now_utc()
        await db.organizations.update_one({"id": ctx["organization"]["id"]}, {"$set": updates})
    org = await db.organizations.find_one({"id": ctx["organization"]["id"]})
    org.pop("_id", None)
    return envelope(org)


@router.get("/current/members")
async def list_members(ctx: dict = Depends(get_current_membership)):
    db = get_db()
    memberships = await db.memberships.find({"organization_id": ctx["organization"]["id"]}).to_list(length=500)
    user_ids = [m["user_id"] for m in memberships]
    users = await db.users.find({"id": {"$in": user_ids}}).to_list(length=500)
    by_id = {u["id"]: u for u in users}
    out = []
    for m in memberships:
        u = by_id.get(m["user_id"])
        if not u:
            continue
        out.append(
            {
                "membership_id": m["id"],
                "user_id": u["id"],
                "email": u["email"],
                "name": u.get("name"),
                "role": m["role"],
                "is_active": m.get("is_active", True) and u.get("is_active", True),
                "created_at": m["created_at"],
            }
        )
    out.sort(key=lambda x: (0 if x["role"] == "admin" else 1, x["name"] or ""))
    return envelope(out)


@router.post("/current/invites")
async def create_invite(payload: InviteCreate, ctx: dict = Depends(require_roles("admin"))):
    db = get_db()
    email = payload.email.lower().strip()

    # Auto-add if user already exists in system
    existing_user = await db.users.find_one({"email": email})
    if existing_user:
        existing_membership = await db.memberships.find_one(
            {"user_id": existing_user["id"], "organization_id": ctx["organization"]["id"]}
        )
        if existing_membership:
            if not existing_membership.get("is_active", True):
                await db.memberships.update_one(
                    {"id": existing_membership["id"]},
                    {"$set": {"is_active": True, "role": payload.role, "updated_at": now_utc()}},
                )
                return envelope({"status": "reactivated", "email": email, "role": payload.role})
            raise HTTPException(status_code=409, detail="User is already a member.")
        await db.memberships.insert_one(
            {
                "id": new_id(),
                "user_id": existing_user["id"],
                "organization_id": ctx["organization"]["id"],
                "role": payload.role,
                "invited_by": ctx["user"]["id"],
                "is_active": True,
                "created_at": now_utc(),
                "updated_at": now_utc(),
            }
        )
        return envelope({"status": "added", "email": email, "role": payload.role})

    # Otherwise create a user record + membership so they can log in via OTP later
    user_id = new_id()
    await db.users.insert_one(
        {
            "id": user_id,
            "email": email,
            "name": payload.name or email.split("@")[0].title(),
            "phone": None,
            "is_active": True,
            "last_login_at": None,
            "created_at": now_utc(),
            "updated_at": now_utc(),
        }
    )
    await db.memberships.insert_one(
        {
            "id": new_id(),
            "user_id": user_id,
            "organization_id": ctx["organization"]["id"],
            "role": payload.role,
            "invited_by": ctx["user"]["id"],
            "is_active": True,
            "created_at": now_utc(),
            "updated_at": now_utc(),
        }
    )
    # Also create an invite token record (informational — user just needs to login with OTP)
    token = gen_url_token(24)
    await db.invites.insert_one(
        {
            "id": new_id(),
            "organization_id": ctx["organization"]["id"],
            "email": email,
            "role": payload.role,
            "token": token,
            "expires_at": now_utc() + timedelta(days=7),
            "invited_by": ctx["user"]["id"],
            "accepted": True,
            "created_at": now_utc(),
        }
    )
    return envelope({"status": "invited", "email": email, "role": payload.role})


@router.patch("/current/members/{membership_id}")
async def update_member(
    membership_id: str,
    payload: MembershipUpdate,
    ctx: dict = Depends(require_roles("admin")),
):
    db = get_db()
    m = await db.memberships.find_one({"id": membership_id, "organization_id": ctx["organization"]["id"]})
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")

    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Prevent an admin from removing their own admin role if they are the last one
    if payload.role and payload.role != "admin" and m["user_id"] == ctx["user"]["id"]:
        admin_count = await db.memberships.count_documents(
            {"organization_id": ctx["organization"]["id"], "role": "admin", "is_active": True}
        )
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot demote the last admin.")
    if payload.is_active is False and m["user_id"] == ctx["user"]["id"]:
        raise HTTPException(status_code=400, detail="You cannot deactivate yourself.")

    updates["updated_at"] = now_utc()
    await db.memberships.update_one({"id": membership_id}, {"$set": updates})
    updated = await db.memberships.find_one({"id": membership_id})
    updated.pop("_id", None)
    return envelope(updated)
