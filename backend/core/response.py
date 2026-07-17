"""Standard API response envelope."""
from typing import Any


def envelope(data: Any = None, meta: dict | None = None) -> dict:
    return {"success": True, "data": data, "error": None, "meta": meta}


def error_envelope(code: str, message: str, meta: dict | None = None) -> dict:
    return {"success": False, "data": None, "error": {"code": code, "message": message}, "meta": meta}


def paginate_meta(total: int, page: int, page_size: int) -> dict:
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size if page_size else 0,
    }
