"""ConstructOS — Construction Management Platform backend (FastAPI + MongoDB).

All API routes are prefixed with /api/v1. RBAC is enforced in the service layer via
dependency injection (see core/deps.py). Multi-tenancy is enforced by requiring
X-Org-Id on all org-scoped endpoints, with membership + role verification per request.
"""
from dotenv import load_dotenv

load_dotenv()

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from core.config import get_settings, validate_startup_config
from core.db import ensure_indexes, get_db
from core.response import envelope, error_envelope
from core.security import now_utc
from core.utils import new_id
from routers import auth as auth_router
from routers import issues as issues_router
from routers import logs as logs_router
from routers import notifications as notifications_router
from routers import orgs as orgs_router
from routers import projects as projects_router
from routers import tasks as tasks_router
from routers import uploads as uploads_router

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("constructos")


async def seed_demo_data() -> None:
    """Seed a demo organization + demo users so the app is usable out-of-the-box.

    Idempotent — safe to run on every startup.
    """
    db = get_db()

    demo_org_id_marker = await db.organizations.find_one({"name": "Demo Constructions Pvt Ltd"})
    if demo_org_id_marker:
        return  # already seeded

    # Create demo users
    demo_users = [
        {"email": "admin@demo.com", "name": "Ravi Kumar", "role": "admin"},
        {"email": "pm@demo.com", "name": "Anita Sharma", "role": "project_manager"},
        {"email": "engineer@demo.com", "name": "Sunil Patel", "role": "site_engineer"},
        {"email": "viewer@demo.com", "name": "Owner Sethi", "role": "viewer"},
    ]

    user_ids: dict[str, str] = {}
    for u in demo_users:
        existing = await db.users.find_one({"email": u["email"]})
        if existing:
            user_ids[u["email"]] = existing["id"]
            continue
        uid = new_id()
        await db.users.insert_one(
            {
                "id": uid,
                "email": u["email"],
                "name": u["name"],
                "phone": None,
                "is_active": True,
                "last_login_at": None,
                "created_at": now_utc(),
                "updated_at": now_utc(),
            }
        )
        user_ids[u["email"]] = uid

    # Create org
    org_id = new_id()
    await db.organizations.insert_one(
        {
            "id": org_id,
            "name": "Demo Constructions Pvt Ltd",
            "description": "Demo organization pre-loaded for exploring ConstructOS.",
            "created_by": user_ids["admin@demo.com"],
            "created_at": now_utc(),
            "updated_at": now_utc(),
            "deleted_at": None,
        }
    )
    for u in demo_users:
        await db.memberships.insert_one(
            {
                "id": new_id(),
                "user_id": user_ids[u["email"]],
                "organization_id": org_id,
                "role": u["role"],
                "invited_by": user_ids["admin@demo.com"],
                "is_active": True,
                "created_at": now_utc(),
                "updated_at": now_utc(),
            }
        )

    # Seed 2 projects
    p1_id, p2_id = new_id(), new_id()
    await db.projects.insert_many(
        [
            {
                "id": p1_id,
                "organization_id": org_id,
                "name": "Skyline Residences — Tower B",
                "description": "42-storey residential tower, Mumbai. Slab work on floors 18-22.",
                "location": "Andheri West, Mumbai",
                "start_date": None,
                "expected_end_date": None,
                "project_manager_id": user_ids["pm@demo.com"],
                "status": "on_track",
                "archived": False,
                "created_by": user_ids["admin@demo.com"],
                "created_at": now_utc(),
                "updated_at": now_utc(),
                "deleted_at": None,
            },
            {
                "id": p2_id,
                "organization_id": org_id,
                "name": "Green Fields Warehousing",
                "description": "Pre-engineered steel warehouse cluster, 3 units.",
                "location": "Bhiwandi, Maharashtra",
                "start_date": None,
                "expected_end_date": None,
                "project_manager_id": user_ids["pm@demo.com"],
                "status": "delayed",
                "archived": False,
                "created_by": user_ids["admin@demo.com"],
                "created_at": now_utc(),
                "updated_at": now_utc(),
                "deleted_at": None,
            },
        ]
    )

    # Seed project members (per-project role assignments)
    project_member_seed = [
        # p1: PM + Site Engineer + Viewer (Owner Sethi)
        (p1_id, user_ids["pm@demo.com"], ["project_manager"]),
        (p1_id, user_ids["engineer@demo.com"], ["site_engineer"]),
        (p1_id, user_ids["viewer@demo.com"], ["viewer"]),
        # p2: PM + Site Engineer only (viewer explicitly NOT assigned to show filtering)
        (p2_id, user_ids["pm@demo.com"], ["project_manager"]),
        (p2_id, user_ids["engineer@demo.com"], ["site_engineer"]),
    ]
    for pid, uid, roles in project_member_seed:
        await db.project_members.insert_one(
            {
                "id": new_id(),
                "organization_id": org_id,
                "project_id": pid,
                "user_id": uid,
                "roles": roles,
                "added_by": user_ids["admin@demo.com"],
                "added_at": now_utc(),
                "updated_at": now_utc(),
            }
        )

    # Seed a few tasks
    task_seed = [
        (p1_id, "Slab reinforcement — 20th floor", "site_engineer", "high", "in_progress"),
        (p1_id, "MEP shaft inspection", "pm", "medium", "todo"),
        (p1_id, "Concrete cube tests submission", "site_engineer", "critical", "todo"),
        (p2_id, "Anchor bolt survey — Unit 2", "site_engineer", "high", "in_progress"),
        (p2_id, "Purlin welding QC", "pm", "medium", "done"),
    ]
    for pid, title, who, prio, st in task_seed:
        assignee = user_ids["engineer@demo.com"] if who == "site_engineer" else user_ids["pm@demo.com"]
        tid = new_id()
        await db.tasks.insert_one(
            {
                "id": tid,
                "organization_id": org_id,
                "project_id": pid,
                "title": title,
                "description": None,
                "assignee_id": assignee,
                "due_date": None,
                "priority": prio,
                "status": st,
                "created_by": user_ids["pm@demo.com"],
                "created_at": now_utc(),
                "updated_at": now_utc(),
                "deleted_at": None,
            }
        )

    # Seed a couple of issues
    await db.issues.insert_many(
        [
            {
                "id": new_id(),
                "organization_id": org_id,
                "project_id": p1_id,
                "title": "Missing edge protection at floor 19",
                "description": "Edge protection barrier missing on north face. Safety hazard.",
                "category": "safety",
                "priority": "critical",
                "assignee_id": user_ids["engineer@demo.com"],
                "due_date": None,
                "status": "open",
                "resolution_note": None,
                "resolved_by": None,
                "resolved_at": None,
                "closed_by": None,
                "closed_at": None,
                "reopen_reason": None,
                "created_by": user_ids["pm@demo.com"],
                "created_at": now_utc(),
                "updated_at": now_utc(),
                "deleted_at": None,
            },
            {
                "id": new_id(),
                "organization_id": org_id,
                "project_id": p2_id,
                "title": "Purlin cross-section mismatch with drawing",
                "description": "Site purlin gauge is 1.6mm vs 2.0mm on drawing. Confirm with designer.",
                "category": "design",
                "priority": "high",
                "assignee_id": user_ids["pm@demo.com"],
                "due_date": None,
                "status": "in_progress",
                "resolution_note": None,
                "resolved_by": None,
                "resolved_at": None,
                "closed_by": None,
                "closed_at": None,
                "reopen_reason": None,
                "created_by": user_ids["engineer@demo.com"],
                "created_at": now_utc(),
                "updated_at": now_utc(),
                "deleted_at": None,
            },
        ]
    )

    # Activity log entries
    for pid in (p1_id, p2_id):
        await db.activity_log.insert_one(
            {
                "id": new_id(),
                "organization_id": org_id,
                "project_id": pid,
                "actor_id": user_ids["admin@demo.com"],
                "action": "project.created",
                "entity_type": "project",
                "entity_id": pid,
                "details": {},
                "created_at": now_utc(),
            }
        )

    log.info("Seeded demo organization + 4 users + 2 projects + tasks + issues.")


async def migrate_project_members() -> None:
    """Idempotent migration: ensure every project's PM is recorded in project_members with project_manager role.

    Also backfills demo project_members entries for the seeded demo org (site engineer + viewer)
    for backward compatibility with older seeds.
    """
    db = get_db()
    projects_cursor = db.projects.find({"deleted_at": None})
    async for p in projects_cursor:
        pm_id = p.get("project_manager_id")
        if not pm_id:
            continue
        existing = await db.project_members.find_one({"project_id": p["id"], "user_id": pm_id})
        if existing:
            roles = existing.get("roles", [])
            if "project_manager" not in roles:
                roles = list(dict.fromkeys([*roles, "project_manager"]))
                await db.project_members.update_one(
                    {"id": existing["id"]},
                    {"$set": {"roles": roles, "updated_at": now_utc()}},
                )
            continue
        await db.project_members.insert_one(
            {
                "id": new_id(),
                "organization_id": p["organization_id"],
                "project_id": p["id"],
                "user_id": pm_id,
                "roles": ["project_manager"],
                "added_by": p.get("created_by"),
                "added_at": now_utc(),
                "updated_at": now_utc(),
            }
        )

    # Backfill demo assignments if demo org exists but has fewer than expected project_members
    demo_org = await db.organizations.find_one({"name": "Demo Constructions Pvt Ltd"})
    if not demo_org:
        return
    engineer = await db.users.find_one({"email": "engineer@demo.com"})
    viewer = await db.users.find_one({"email": "viewer@demo.com"})
    if not engineer or not viewer:
        return
    demo_projects = await db.projects.find({"organization_id": demo_org["id"], "deleted_at": None}).to_list(length=50)
    for p in demo_projects:
        for uid, roles in [(engineer["id"], ["site_engineer"]), (viewer["id"], ["viewer"])]:
            # only seed viewer on the first (Skyline) project — matches new seed intent
            if uid == viewer["id"] and "Skyline" not in p.get("name", ""):
                continue
            existing = await db.project_members.find_one({"project_id": p["id"], "user_id": uid})
            if existing:
                continue
            await db.project_members.insert_one(
                {
                    "id": new_id(),
                    "organization_id": demo_org["id"],
                    "project_id": p["id"],
                    "user_id": uid,
                    "roles": roles,
                    "added_by": None,
                    "added_at": now_utc(),
                    "updated_at": now_utc(),
                }
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()  # noqa
    await ensure_indexes()
    await seed_demo_data()
    await migrate_project_members()
    yield


app = FastAPI(
    title="ConstructOS API",
    description="Multi-organization Construction Management Platform API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/v1/docs",
    redoc_url="/api/v1/redoc",
    openapi_url="/api/v1/openapi.json",
)

# CORS — permissive for preview; frontend uses REACT_APP_BACKEND_URL directly
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exc_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content=error_envelope(
            code=f"HTTP_{exc.status_code}",
            message=exc.detail if isinstance(exc.detail, str) else "Request failed",
        ),
    )


@app.exception_handler(RequestValidationError)
async def validation_exc_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content=error_envelope(
            code="VALIDATION_ERROR",
            message="Invalid request payload.",
            meta={"errors": exc.errors()},
        ),
    )


@app.get("/api/v1/health")
async def health():
    return envelope({"status": "ok", "service": "constructos-api", "version": "1.0.0"})


@app.get("/api/health")
async def health_root():
    return envelope({"status": "ok"})


# Register routers under /api/v1
API_V1 = "/api/v1"
app.include_router(auth_router.router, prefix=API_V1)
app.include_router(orgs_router.router, prefix=API_V1)
app.include_router(projects_router.router, prefix=API_V1)
app.include_router(tasks_router.router, prefix=API_V1)
app.include_router(logs_router.router, prefix=API_V1)
app.include_router(issues_router.router, prefix=API_V1)
app.include_router(notifications_router.router, prefix=API_V1)
app.include_router(uploads_router.router, prefix=API_V1)


@app.get("/")
async def root():
    return envelope({"name": "ConstructOS API", "docs": "/api/v1/docs"})
