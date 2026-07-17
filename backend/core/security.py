"""JWT & password hashing utilities."""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from core.config import get_settings


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def hash_secret(value: str) -> str:
    """Fast HMAC-style hash for OTP codes and refresh tokens (not user passwords)."""
    settings = get_settings()
    return hashlib.sha256(f"{settings.JWT_SECRET}:{value}".encode("utf-8")).hexdigest()


def gen_numeric_otp(length: int = 6) -> str:
    return "".join(str(secrets.randbelow(10)) for _ in range(length))


def gen_url_token(length: int = 32) -> str:
    return secrets.token_urlsafe(length)


def create_access_token(user_id: str, email: str) -> str:
    settings = get_settings()
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "iat": int(now_utc().timestamp()),
        "exp": now_utc() + timedelta(minutes=settings.ACCESS_TOKEN_MINUTES),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token_value() -> str:
    return secrets.token_urlsafe(48)


def decode_token(token: str) -> dict:
    settings = get_settings()
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])


def bcrypt_hash(value: str) -> str:
    return bcrypt.hashpw(value.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def bcrypt_verify(value: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(value.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False
