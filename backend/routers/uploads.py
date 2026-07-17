"""File upload router (local storage)."""
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from core.config import get_settings
from core.deps import get_current_membership
from core.response import envelope

router = APIRouter(prefix="/uploads", tags=["uploads"])

ALLOWED_MIME = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
MAX_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("/image")
async def upload_image(
    request: Request,
    file: UploadFile = File(...),
    ctx: dict = Depends(get_current_membership),
):
    settings = get_settings()
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, or WebP images allowed.")

    body = await file.read()
    if len(body) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 10 MB.")
    if len(body) == 0:
        raise HTTPException(status_code=400, detail="Empty file.")

    # Basic magic-byte validation
    if not (body[:3] == b"\xff\xd8\xff" or body[:8] == b"\x89PNG\r\n\x1a\n" or body[:4] == b"RIFF"):
        raise HTTPException(status_code=400, detail="File does not appear to be a valid image.")

    ext = {"image/jpeg": ".jpg", "image/jpg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[file.content_type]
    folder = Path(settings.UPLOAD_DIR) / ctx["organization"]["id"]
    folder.mkdir(parents=True, exist_ok=True)
    fname = f"{uuid.uuid4().hex}{ext}"
    fpath = folder / fname
    with open(fpath, "wb") as f:
        f.write(body)

    base = str(request.base_url).rstrip("/")
    public_url = f"{base}/api/v1/uploads/file/{ctx['organization']['id']}/{fname}"
    return envelope({"url": public_url, "filename": fname, "mime_type": file.content_type, "size": len(body)})


@router.get("/file/{org_id}/{filename}")
async def get_file(org_id: str, filename: str):
    from fastapi.responses import FileResponse
    settings = get_settings()
    fpath = Path(settings.UPLOAD_DIR) / org_id / filename
    if not fpath.exists() or not fpath.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    # Restrict traversal
    if ".." in filename or "/" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    return FileResponse(fpath)
