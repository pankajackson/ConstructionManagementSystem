"""File upload router — thin wrapper over the pluggable storage provider."""
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from core.config import get_settings
from core.deps import get_current_membership
from core.response import envelope
from core.storage_provider import get_storage_provider

router = APIRouter(prefix="/uploads", tags=["uploads"])

ALLOWED_MIME = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
MAX_SIZE = 10 * 1024 * 1024  # 10 MB

_EXT_BY_MIME = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


def _is_valid_image_magic(body: bytes) -> bool:
    # JPEG
    if body[:3] == b"\xff\xd8\xff":
        return True
    # PNG
    if body[:8] == b"\x89PNG\r\n\x1a\n":
        return True
    # WebP: 'RIFF' .... 'WEBP'
    if body[:4] == b"RIFF" and len(body) >= 12 and body[8:12] == b"WEBP":
        return True
    return False


@router.post("/image")
async def upload_image(
    request: Request,
    file: UploadFile = File(...),
    ctx: dict = Depends(get_current_membership),
):
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, or WebP images allowed.")

    body = await file.read()
    if len(body) == 0:
        raise HTTPException(status_code=400, detail="Empty file.")
    if len(body) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB.")
    if not _is_valid_image_magic(body):
        raise HTTPException(status_code=400, detail="File does not appear to be a valid image.")

    ext = _EXT_BY_MIME[file.content_type]
    key = f"{ctx['organization']['id']}/{uuid.uuid4().hex}{ext}"

    storage = get_storage_provider()
    try:
        await storage.upload(data=body, key=key, content_type=file.content_type)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Storage upload failed: {e}")

    base = str(request.base_url).rstrip("/")
    url = await storage.get_file_url(key, request_base_url=base)

    return envelope({
        "url": url,
        "key": key,
        "provider": storage.provider_name,
        "mime_type": file.content_type,
        "size": len(body),
    })


@router.get("/file/{org_id}/{filename}")
async def get_file(org_id: str, filename: str):
    # Only used by the filesystem provider — S3 URLs are served directly by AWS.
    settings = get_settings()

    # Reject traversal attempts before touching the filesystem.
    if ".." in filename or "/" in filename or ".." in org_id or "/" in org_id:
        raise HTTPException(status_code=400, detail="Invalid path")

    fpath = Path(settings.UPLOAD_DIR) / org_id / filename
    if not fpath.exists() or not fpath.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(fpath)
