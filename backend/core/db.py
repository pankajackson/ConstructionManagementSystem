"""MongoDB client and index management."""
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from core.config import get_settings

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        settings = get_settings()
        _client = AsyncIOMotorClient(settings.MONGO_URL, uuidRepresentation="standard", tz_aware=True)
    return _client


def get_db() -> AsyncIOMotorDatabase:
    global _db
    if _db is None:
        settings = get_settings()
        _db = get_client()[settings.DB_NAME]
    return _db


async def ensure_indexes() -> None:
    db = get_db()

    # Users
    await db.users.create_index("email", unique=True)
    await db.users.create_index("created_at")

    # OTP codes
    await db.otp_codes.create_index("email")
    await db.otp_codes.create_index("expires_at", expireAfterSeconds=0)

    # Refresh tokens
    await db.refresh_tokens.create_index("user_id")
    await db.refresh_tokens.create_index("token_hash", unique=True)
    await db.refresh_tokens.create_index("expires_at", expireAfterSeconds=0)

    # Memberships
    await db.memberships.create_index([("user_id", 1), ("organization_id", 1)], unique=True)
    await db.memberships.create_index("organization_id")

    # Organizations
    await db.organizations.create_index("created_by")
    await db.organizations.create_index("created_at")

    # Invites
    await db.invites.create_index("token", unique=True)
    await db.invites.create_index("email")
    await db.invites.create_index("expires_at", expireAfterSeconds=0)

    # Projects
    await db.projects.create_index("organization_id")
    await db.projects.create_index([("organization_id", 1), ("status", 1)])
    await db.projects.create_index([("organization_id", 1), ("created_at", -1)])
    await db.projects.create_index("project_manager_id")

    # Tasks
    await db.tasks.create_index([("organization_id", 1), ("project_id", 1)])
    await db.tasks.create_index("assignee_id")
    await db.tasks.create_index([("project_id", 1), ("status", 1)])
    await db.tasks.create_index([("project_id", 1), ("created_at", -1)])

    # Task extras
    await db.task_status_history.create_index("task_id")
    await db.task_comments.create_index("task_id")
    await db.task_attachments.create_index("task_id")

    # Daily logs — one per project/user/date
    await db.daily_logs.create_index(
        [("project_id", 1), ("submitted_by", 1), ("date", 1), ("status", 1)],
        unique=True,
        partialFilterExpression={"status": "submitted"},
    )
    await db.daily_logs.create_index([("organization_id", 1), ("project_id", 1), ("date", -1)])
    await db.daily_logs.create_index("submitted_by")

    # Issues
    await db.issues.create_index([("organization_id", 1), ("project_id", 1)])
    await db.issues.create_index([("project_id", 1), ("status", 1)])
    await db.issues.create_index("assignee_id")
    await db.issues.create_index([("project_id", 1), ("created_at", -1)])
    await db.issue_attachments.create_index("issue_id")

    # Notifications
    await db.notifications.create_index([("user_id", 1), ("is_read", 1)])
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])

    # Activity log
    await db.activity_log.create_index([("project_id", 1), ("created_at", -1)])
    await db.activity_log.create_index([("organization_id", 1), ("created_at", -1)])
