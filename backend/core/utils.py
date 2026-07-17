"""Shared helpers."""
import uuid
from datetime import datetime, timezone


def new_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def strip_mongo(doc: dict | None) -> dict | None:
    if doc is None:
        return None
    doc.pop("_id", None)
    return doc


def strip_mongo_list(docs: list[dict]) -> list[dict]:
    for d in docs:
        d.pop("_id", None)
    return docs
