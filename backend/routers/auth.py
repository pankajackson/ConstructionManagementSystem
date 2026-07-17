"""Auth router: email OTP request/verify + JWT issuance + refresh + logout + me."""
import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request

from core.config import get_settings
from core.db import get_db
from core.deps import get_current_user
from core.email_provider import get_email_provider
from core.response import envelope
from core.security import (
    create_access_token,
    create_refresh_token_value,
    gen_numeric_otp,
    hash_secret,
    now_utc,
)
from core.utils import new_id
from models.schemas import OtpRequest, OtpVerify, RefreshRequest

router = APIRouter(prefix="/auth", tags=["auth"])
log = logging.getLogger("auth")


@router.post("/request-otp")
async def request_otp(payload: OtpRequest, request: Request):
    settings = get_settings()
    db = get_db()
    email = payload.email.lower().strip()

    # Rate limit: max N OTP requests per hour per email
    since = now_utc() - timedelta(hours=1)
    recent = await db.otp_codes.count_documents({"email": email, "created_at": {"$gte": since}})
    if recent >= settings.OTP_RATE_LIMIT_PER_HOUR:
        raise HTTPException(status_code=429, detail="Too many OTP requests. Try again later.")

    # Ensure a user record exists (auto-provision on first request)
    existing = await db.users.find_one({"email": email})
    if existing is None:
        await db.users.insert_one(
            {
                "id": new_id(),
                "email": email,
                "name": payload.name or email.split("@")[0].title(),
                "phone": None,
                "is_active": True,
                "last_login_at": None,
                "created_at": now_utc(),
                "updated_at": now_utc(),
            }
        )
    elif not existing.get("is_active", True):
        raise HTTPException(status_code=403, detail="This account has been deactivated.")
    elif payload.name and not existing.get("name"):
        await db.users.update_one({"email": email}, {"$set": {"name": payload.name, "updated_at": now_utc()}})

    # Invalidate any previous unused OTPs for this email
    await db.otp_codes.update_many({"email": email, "used": False}, {"$set": {"used": True}})

    code = gen_numeric_otp(6)
    code_hash = hash_secret(code)
    expires = now_utc() + timedelta(minutes=settings.OTP_EXPIRY_MINUTES)

    await db.otp_codes.insert_one(
        {
            "id": new_id(),
            "email": email,
            "code_hash": code_hash,
            "expires_at": expires,
            "used": False,
            "attempts": 0,
            "created_at": now_utc(),
        }
    )

    # Deliver via the configured provider (console logs; sendgrid emails).
    provider = get_email_provider()
    try:
        await provider.send_otp(to_email=email, code=code, expires_minutes=settings.OTP_EXPIRY_MINUTES)
    except Exception:
        # Do not leak provider errors to the client; log and return a friendly message.
        log.exception("OTP delivery failed for %s via %s", email, provider.provider_name)
        raise HTTPException(status_code=502, detail="We could not send your verification code. Please try again shortly.")

    payload_out = {
        "email": email,
        "expires_in": settings.OTP_EXPIRY_MINUTES * 60,
        "delivery": provider.provider_name,
        "dev_mode": settings.DEV_MODE,
    }
    # Only expose the OTP in the response when the provider says it's safe
    # (i.e. console provider + DEV_MODE). Real email providers never expose it.
    if provider.exposes_dev_otp:
        payload_out["dev_otp"] = code
    return envelope(payload_out)


@router.post("/verify-otp")
async def verify_otp(payload: OtpVerify):
    settings = get_settings()
    db = get_db()
    email = payload.email.lower().strip()

    otp_doc = await db.otp_codes.find_one(
        {"email": email, "used": False},
        sort=[("created_at", -1)],
    )
    if not otp_doc:
        raise HTTPException(status_code=400, detail="Request a new OTP.")

    if otp_doc["attempts"] >= settings.OTP_MAX_ATTEMPTS:
        await db.otp_codes.update_one({"id": otp_doc["id"]}, {"$set": {"used": True}})
        raise HTTPException(status_code=429, detail="Too many wrong attempts. Request a new OTP.")

    if otp_doc["expires_at"] < now_utc():
        await db.otp_codes.update_one({"id": otp_doc["id"]}, {"$set": {"used": True}})
        raise HTTPException(status_code=400, detail="OTP expired. Request a new one.")

    if hash_secret(payload.code) != otp_doc["code_hash"]:
        await db.otp_codes.update_one({"id": otp_doc["id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Invalid OTP.")

    # Mark used
    await db.otp_codes.update_one({"id": otp_doc["id"]}, {"$set": {"used": True}})

    user = await db.users.find_one({"email": email, "is_active": True})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    await db.users.update_one({"id": user["id"]}, {"$set": {"last_login_at": now_utc()}})

    access = create_access_token(user["id"], user["email"])
    refresh_val = create_refresh_token_value()
    await db.refresh_tokens.insert_one(
        {
            "id": new_id(),
            "user_id": user["id"],
            "token_hash": hash_secret(refresh_val),
            "expires_at": now_utc() + timedelta(days=settings.REFRESH_TOKEN_DAYS),
            "revoked": False,
            "created_at": now_utc(),
        }
    )

    memberships = await db.memberships.find({"user_id": user["id"], "is_active": True}).to_list(length=100)
    org_ids = [m["organization_id"] for m in memberships]
    orgs = []
    if org_ids:
        cursor = db.organizations.find({"id": {"$in": org_ids}, "deleted_at": None})
        orgs = await cursor.to_list(length=100)
        for o in orgs:
            o.pop("_id", None)
    org_by_id = {o["id"]: o for o in orgs}
    orgs_out = []
    for m in memberships:
        org = org_by_id.get(m["organization_id"])
        if org:
            orgs_out.append({"id": org["id"], "name": org["name"], "role": m["role"]})

    return envelope(
        {
            "access_token": access,
            "refresh_token": refresh_val,
            "token_type": "bearer",
            "user": {
                "id": user["id"],
                "email": user["email"],
                "name": user.get("name"),
                "phone": user.get("phone"),
            },
            "organizations": orgs_out,
        }
    )


@router.post("/refresh")
async def refresh_token(payload: RefreshRequest):
    db = get_db()
    token_hash = hash_secret(payload.refresh_token)
    doc = await db.refresh_tokens.find_one({"token_hash": token_hash, "revoked": False})
    if not doc:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    if doc["expires_at"] < now_utc():
        raise HTTPException(status_code=401, detail="Refresh token expired")
    user = await db.users.find_one({"id": doc["user_id"], "is_active": True})
    if not user:
        raise HTTPException(status_code=401, detail="User no longer active")
    access = create_access_token(user["id"], user["email"])
    return envelope({"access_token": access, "token_type": "bearer"})


@router.post("/logout")
async def logout(payload: RefreshRequest | None = None, user: dict = Depends(get_current_user)):
    db = get_db()
    if payload and payload.refresh_token:
        await db.refresh_tokens.update_one(
            {"token_hash": hash_secret(payload.refresh_token)},
            {"$set": {"revoked": True}},
        )
    else:
        # Revoke all refresh tokens for this user
        await db.refresh_tokens.update_many({"user_id": user["id"]}, {"$set": {"revoked": True}})
    return envelope({"logged_out": True})


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    db = get_db()
    memberships = await db.memberships.find({"user_id": user["id"], "is_active": True}).to_list(length=100)
    org_ids = [m["organization_id"] for m in memberships]
    orgs = []
    if org_ids:
        cursor = db.organizations.find({"id": {"$in": org_ids}, "deleted_at": None})
        orgs = await cursor.to_list(length=100)
        for o in orgs:
            o.pop("_id", None)
    org_by_id = {o["id"]: o for o in orgs}
    orgs_out = []
    for m in memberships:
        org = org_by_id.get(m["organization_id"])
        if org:
            orgs_out.append({"id": org["id"], "name": org["name"], "role": m["role"]})
    return envelope(
        {
            "user": {
                "id": user["id"],
                "email": user["email"],
                "name": user.get("name"),
                "phone": user.get("phone"),
                "last_login_at": user.get("last_login_at"),
            },
            "organizations": orgs_out,
        }
    )
