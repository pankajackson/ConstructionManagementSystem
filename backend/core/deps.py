"""FastAPI dependencies: current user, org membership, RBAC."""
from fastapi import Depends, Header, HTTPException, Request, status

from core.db import get_db
from core.security import decode_token

ROLES = {"admin", "project_manager", "site_engineer", "viewer"}
ROLE_LABELS = {
    "admin": "Admin",
    "project_manager": "Project Manager",
    "site_engineer": "Site Engineer",
    "viewer": "Viewer",
}


def _extract_token(request: Request) -> str | None:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    token = request.cookies.get("access_token")
    return token or None


async def get_current_user(request: Request) -> dict:
    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")

    db = get_db()
    user = await db.users.find_one({"id": payload["sub"], "is_active": True})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    user.pop("_id", None)
    return user


async def get_current_membership(
    user: dict = Depends(get_current_user),
    x_org_id: str | None = Header(default=None, alias="X-Org-Id"),
) -> dict:
    if not x_org_id:
        raise HTTPException(status_code=400, detail="Missing X-Org-Id header")
    db = get_db()
    membership = await db.memberships.find_one(
        {"user_id": user["id"], "organization_id": x_org_id, "is_active": True}
    )
    if not membership:
        raise HTTPException(status_code=403, detail="You are not a member of this organization")
    org = await db.organizations.find_one({"id": x_org_id, "deleted_at": None})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    membership.pop("_id", None)
    org.pop("_id", None)
    return {"user": user, "membership": membership, "organization": org}


def require_roles(*allowed_roles: str):
    """Dependency factory that ensures the caller has one of the allowed roles in the current org."""
    allowed = set(allowed_roles)

    async def _dep(ctx: dict = Depends(get_current_membership)) -> dict:
        role = ctx["membership"]["role"]
        if role not in allowed:
            raise HTTPException(
                status_code=403,
                detail=f"Requires one of roles: {', '.join(sorted(allowed))}",
            )
        return ctx

    return _dep


def can_write(role: str) -> bool:
    return role in {"admin", "project_manager", "site_engineer"}


def can_manage_project(role: str) -> bool:
    return role in {"admin", "project_manager"}


def can_close_issue(role: str) -> bool:
    return role in {"admin", "project_manager"}
