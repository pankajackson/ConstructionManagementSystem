"""Pydantic request/response schemas."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

Priority = Literal["low", "medium", "high", "critical"]
TaskStatus = Literal["todo", "in_progress", "done"]
IssueStatus = Literal["open", "in_progress", "resolved", "closed"]
IssueCategory = Literal["safety", "quality", "design", "material", "other"]
ProjectStatus = Literal["on_track", "delayed", "on_hold", "completed"]
Weather = Literal["sunny", "cloudy", "rainy", "stopped_work"]
Role = Literal["admin", "project_manager", "site_engineer", "viewer"]


# ============= Auth =============
class OtpRequest(BaseModel):
    email: EmailStr
    name: str | None = None


class OtpVerify(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


# ============= Organization =============
class OrgCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str | None = None


class OrgUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = None


# ============= Members =============
class InviteCreate(BaseModel):
    email: EmailStr
    name: str | None = None
    role: Role


class MembershipUpdate(BaseModel):
    role: Role | None = None
    is_active: bool | None = None


# ============= Project =============
class ProjectCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    description: str | None = None
    location: str | None = None
    start_date: datetime | None = None
    expected_end_date: datetime | None = None
    project_manager_id: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    description: str | None = None
    location: str | None = None
    start_date: datetime | None = None
    expected_end_date: datetime | None = None
    project_manager_id: str | None = None
    status: ProjectStatus | None = None


# ============= Task =============
class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    assignee_id: str | None = None
    due_date: datetime | None = None
    priority: Priority = "medium"
    attachments: list[str] = []


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    assignee_id: str | None = None
    due_date: datetime | None = None
    priority: Priority | None = None
    status: TaskStatus | None = None


class TaskCommentCreate(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


# ============= Daily Log =============
class DailyLogCreate(BaseModel):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    labour_count: int = Field(ge=0)
    work_summary: str = Field(max_length=2000)
    material_summary: str = Field(default="", max_length=1000)
    weather: Weather
    remarks: str | None = Field(default=None, max_length=1000)
    photos: list[str] = []
    status: Literal["draft", "submitted"] = "draft"

    @field_validator("photos")
    @classmethod
    def limit_photos(cls, v: list[str]) -> list[str]:
        if len(v) > 10:
            raise ValueError("Maximum 10 photos allowed")
        return v


class DailyLogUpdate(BaseModel):
    labour_count: int | None = Field(default=None, ge=0)
    work_summary: str | None = Field(default=None, max_length=2000)
    material_summary: str | None = Field(default=None, max_length=1000)
    weather: Weather | None = None
    remarks: str | None = Field(default=None, max_length=1000)
    photos: list[str] | None = None
    status: Literal["draft", "submitted"] | None = None


# ============= Issue =============
class IssueCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    category: IssueCategory
    priority: Priority = "medium"
    assignee_id: str | None = None
    due_date: datetime | None = None
    attachments: list[str] = []


class IssueUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    category: IssueCategory | None = None
    priority: Priority | None = None
    assignee_id: str | None = None
    due_date: datetime | None = None


class IssueStatusChange(BaseModel):
    status: IssueStatus
    resolution_note: str | None = None
    reopen_reason: str | None = None
