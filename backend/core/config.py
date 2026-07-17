"""Application configuration loaded from environment variables."""
import os
from functools import lru_cache


class Settings:
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
    UPLOAD_DIR: str = os.environ.get("UPLOAD_DIR", "/app/backend/uploads")
    DEV_MODE: bool = os.environ.get("DEV_MODE", "true").lower() == "true"


@lru_cache
def get_settings() -> Settings:
    return Settings()
