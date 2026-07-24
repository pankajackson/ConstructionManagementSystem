"""FastAPI dependencies: current user, org membership, RBAC, project access."""
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
# Higher index = more privilege
ROLE_HIERARCHY = ["viewer", "site_engineer", "project_manager", "admin"]


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


def _highest_role(roles: list[str]) -> str | None:
    best = None
    for r in roles:
        if r not in ROLE_HIERARCHY:
            continue
        if best is None or ROLE_HIERARCHY.index(r) > ROLE_HIERARCHY.index(best):
            best = r
    return best


async def get_accessible_project_ids(db, user_id: str, org_id: str, org_role: str) -> list[str] | None:
    """Return list of project_ids user can see, or None to indicate 'all projects' (org admin)."""
    if org_role == "admin":
        return None
    pm_docs = await db.project_members.find(
        {"organization_id": org_id, "user_id": user_id}
    ).to_list(length=1000)
    ids = {d["project_id"] for d in pm_docs}
    # Also include projects where user is the project_manager (implicit membership)
    own_pm = await db.projects.find(
        {"organization_id": org_id, "project_manager_id": user_id, "deleted_at": None},
        {"id": 1},
    ).to_list(length=1000)
    ids.update({p["id"] for p in own_pm})
    return list(ids)


async def resolve_project_access(
    db, user_id: str, org_id: str, project_id: str, org_role: str
) -> tuple[dict, str, list[str]]:
    """Ensure user can access project; return (project, effective_role, project_roles).

    Access rules:
    - org admin: full access with effective role "admin"
    - project_manager of this project: implicit "project_manager" role
    - project_members entry: uses its roles list
    - otherwise: 403
    """
    project = await db.projects.find_one(
        {"id": project_id, "organization_id": org_id, "deleted_at": None}
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    project.pop("_id", None)

    if org_role == "admin":
        return project, "admin", ["admin"]

    roles: list[str] = []
    if project.get("project_manager_id") == user_id:
        roles.append("project_manager")
    pm_doc = await db.project_members.find_one({"project_id": project_id, "user_id": user_id})
    if pm_doc:
        roles.extend(pm_doc.get("roles", []))
    roles = list(dict.fromkeys(r for r in roles if r in ROLES))

    if not roles:
        raise HTTPException(status_code=403, detail="You do not have access to this project.")

    return project, _highest_role(roles) or "viewer", roles


async def project_ctx(project_id: str, ctx: dict = Depends(get_current_membership)) -> dict:
    """Project-scoped context: enforces access, returns ctx augmented with project + effective role(s)."""
    db = get_db()
    project, eff_role, roles = await resolve_project_access(
        db,
        ctx["user"]["id"],
        ctx["organization"]["id"],
        project_id,
        ctx["membership"]["role"],
    )
    return {
        **ctx,
        "project": project,
        "effective_role": eff_role,
        "effective_roles": roles,
    }


def require_project_roles(*allowed_roles: str):
    """Enforces the caller has at least one of the allowed roles for this project."""
    allowed = set(allowed_roles)

    async def _dep(ctx: dict = Depends(project_ctx)) -> dict:
        if not (set(ctx["effective_roles"]) & allowed) and ctx["effective_role"] not in allowed:
            raise HTTPException(
                status_code=403,
                detail=f"Requires project role: {', '.join(sorted(allowed))}",
            )
        return ctx

    return _dep


def can_write(role: str) -> bool:
    return role in {"admin", "project_manager", "site_engineer"}


def can_manage_project(role: str) -> bool:
    return role in {"admin", "project_manager"}


def can_close_issue(role: str) -> bool:
    return role in {"admin", "project_manager"}
