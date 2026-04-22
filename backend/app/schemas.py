from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


Severity = Literal["low", "medium", "high", "critical"]


class Page(BaseModel):
    limit: int = Field(ge=1, le=200, default=50)
    offset: int = Field(ge=0, default=0)


class EventIn(BaseModel):
    timestamp: datetime | None = None
    source_ip: str | None = None
    attack_type: str | None = None
    payload: dict[str, Any] | None = None
    raw_log: dict[str, Any]


class EventOut(BaseModel):
    id: int
    timestamp: datetime
    source_ip: str | None
    attack_type: str | None
    payload: dict[str, Any] | None
    raw_log: dict[str, Any]


class AlertIn(BaseModel):
    event_id: int | None = None
    severity: str = Field(default="medium")
    rule_id: str | None = None
    description: str | None = None
    timestamp: datetime | None = None
    raw_alert: dict[str, Any]


class AlertOut(BaseModel):
    id: int
    event_id: int | None
    severity: str
    rule_id: str | None
    description: str | None
    timestamp: datetime
    raw_alert: dict[str, Any]


class AnalysisOut(BaseModel):
    alert_id: int
    attack_type: str
    severity: Severity
    summary: str
    recommended_action: str
    created_at: datetime | None = None


# --- Auth & Users ---

class UserBase(BaseModel):
    username: str
    role: str = "analista"
    email: str | None = None

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    username: str | None = None
    email: str | None = None
    role: str | None = None
    password: str | None = None

class UserIn(UserBase):
    password: str

class UserOut(UserBase):
    id: int
    email: str | None = None
    created_at: datetime

class PasswordReset(BaseModel):
    new_password: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class LoginRequest(BaseModel):
    username: str
    password: str


# --- Agents (Wazuh Proxy) ---

class AgentEnrollIn(BaseModel):
    name: str
    os: Literal["linux", "windows"] = "linux"
    group: str = "default"

class AgentEnrollOut(BaseModel):
    ok: bool
    id: str | None = None
    key: str | None = None
    error: str | None = None

class AgentOut(BaseModel):
    id: str
    name: str
    ip: str | None
    os: str | None
    status: str
    type: str
    agent: str
    group: Any | None = None

