"""Application configuration loaded from environment variables.

All provider selection is driven by env — swap providers with a config change,
no code change. Startup validation ensures required keys are present when a
paid provider is selected.
"""
import os
from functools import lru_cache


def _bool(env_val: str | None, default: bool = False) -> bool:
    if env_val is None:
        return default
    return env_val.strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    # ---- Core ----
    MONGO_URL: str = os.environ["MONGO_URL"]
    DB_NAME: str = os.environ["DB_NAME"]
    JWT_SECRET: str = os.environ["JWT_SECRET"]
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_MINUTES: int = int(os.environ.get("ACCESS_TOKEN_MINUTES", "480"))
    REFRESH_TOKEN_DAYS: int = int(os.environ.get("REFRESH_TOKEN_DAYS", "30"))
    OTP_EXPIRY_MINUTES: int = int(os.environ.get("OTP_EXPIRY_MINUTES", "10"))
    OTP_MAX_ATTEMPTS: int = int(os.environ.get("OTP_MAX_ATTEMPTS", "5"))
    OTP_RATE_LIMIT_PER_HOUR: int = int(os.environ.get("OTP_RATE_LIMIT_PER_HOUR", "10"))
    FRONTEND_URL: str = os.environ.get("FRONTEND_URL", "http://localhost:3000")
    # Public URL of THIS backend, used to build absolute URLs returned to clients
    # (e.g. filesystem file URLs). If empty, we fall back to request.base_url which
    # inside K8s may resolve to an internal hostname unreachable from outside.
    PUBLIC_BASE_URL: str = os.environ.get("PUBLIC_BASE_URL", "")
    DEV_MODE: bool = _bool(os.environ.get("DEV_MODE"), True)

    # ---- OTP delivery provider ----
    # OTP_DELIVERY_TYPE = console | sendgrid  (default: console)
    OTP_DELIVERY_TYPE: str = os.environ.get("OTP_DELIVERY_TYPE", "console").lower().strip()
    SENDGRID_API_KEY: str = os.environ.get("SENDGRID_API_KEY", "")
    SENDGRID_FROM_EMAIL: str = os.environ.get("SENDGRID_FROM_EMAIL", "")
    SENDGRID_FROM_NAME: str = os.environ.get("SENDGRID_FROM_NAME", "ConstructOS")

    # ---- File storage provider ----
    # STORAGE_TYPE = filesystem | s3  (default: filesystem)
    STORAGE_TYPE: str = os.environ.get("STORAGE_TYPE", "filesystem").lower().strip()
    UPLOAD_DIR: str = os.environ.get("UPLOAD_DIR", "/app/backend/uploads")
    AWS_ACCESS_KEY_ID: str = os.environ.get("AWS_ACCESS_KEY_ID", "")
    AWS_SECRET_ACCESS_KEY: str = os.environ.get("AWS_SECRET_ACCESS_KEY", "")
    AWS_S3_BUCKET: str = os.environ.get("AWS_S3_BUCKET", "")
    AWS_S3_REGION: str = os.environ.get("AWS_S3_REGION", "ap-south-1")
    AWS_S3_PUBLIC_URL_BASE: str = os.environ.get("AWS_S3_PUBLIC_URL_BASE", "")
    S3_PRESIGNED_TTL_SECONDS: int = int(os.environ.get("S3_PRESIGNED_TTL_SECONDS", str(7 * 24 * 3600)))


@lru_cache
def get_settings() -> Settings:
    return Settings()


def validate_startup_config() -> None:
    """Fail fast if a paid provider is selected but credentials are missing."""
    s = get_settings()

    if s.OTP_DELIVERY_TYPE not in {"console", "sendgrid"}:
        raise RuntimeError(
            f"Invalid OTP_DELIVERY_TYPE='{s.OTP_DELIVERY_TYPE}'. Must be 'console' or 'sendgrid'."
        )
    if s.OTP_DELIVERY_TYPE == "sendgrid":
        missing = [k for k, v in [
            ("SENDGRID_API_KEY", s.SENDGRID_API_KEY),
            ("SENDGRID_FROM_EMAIL", s.SENDGRID_FROM_EMAIL),
        ] if not v.strip()]
        if missing:
            raise RuntimeError(
                "OTP_DELIVERY_TYPE=sendgrid but the following env vars are missing or empty: "
                + ", ".join(missing)
                + ". Set them in backend/.env or switch OTP_DELIVERY_TYPE back to 'console'."
            )

    if s.STORAGE_TYPE not in {"filesystem", "s3"}:
        raise RuntimeError(
            f"Invalid STORAGE_TYPE='{s.STORAGE_TYPE}'. Must be 'filesystem' or 's3'."
        )
    if s.STORAGE_TYPE == "s3":
        missing = [k for k, v in [
            ("AWS_ACCESS_KEY_ID", s.AWS_ACCESS_KEY_ID),
            ("AWS_SECRET_ACCESS_KEY", s.AWS_SECRET_ACCESS_KEY),
            ("AWS_S3_BUCKET", s.AWS_S3_BUCKET),
            ("AWS_S3_REGION", s.AWS_S3_REGION),
        ] if not v.strip()]
        if missing:
            raise RuntimeError(
                "STORAGE_TYPE=s3 but the following env vars are missing or empty: "
                + ", ".join(missing)
                + ". Set them in backend/.env or switch STORAGE_TYPE back to 'filesystem'."
            )
