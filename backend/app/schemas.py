from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


Severity = Literal["low", "medium", "high", "critical"]
TicketStatus = Literal["open", "in_progress", "escalated", "resolved", "closed"]


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
    rank: str = "L1 Analyst"
    email: str | None = None

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    username: str | None = None
    email: str | None = None
    role: str | None = None
    rank: str | None = None
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


# --- Tickets (Incident Management) ---

class TicketCreate(BaseModel):
    title: str
    description: str | None = None
    severity: Severity = "medium"
    category: str | None = None
    source_ip: str | None = None
    affected_asset: str | None = None
    affected_user: str | None = None
    mitre_technique: str | None = None
    wazuh_alert_id: str | None = None
    assigned_to_id: int | None = None

class TicketUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    severity: Severity | None = None
    status: TicketStatus | None = None
    category: str | None = None
    source_ip: str | None = None
    affected_asset: str | None = None
    affected_user: str | None = None
    mitre_technique: str | None = None
    assigned_to_id: int | None = None
    analysis_notes: str | None = None
    resolution_notes: str | None = None

class TicketAssign(BaseModel):
    assigned_to_id: int

class TicketResolve(BaseModel):
    resolution_notes: str
    status: TicketStatus = "resolved"

class TicketAnalysis(BaseModel):
    analysis_notes: str

class TicketOut(BaseModel):
    id: int
    title: str
    description: str | None
    severity: str
    status: str
    category: str | None
    source_ip: str | None
    affected_asset: str | None
    affected_user: str | None = None
    mitre_technique: str | None = None
    wazuh_alert_id: str | None
    assigned_to_id: int | None
    reporter_id: int | None
    assignee_username: str | None = None
    reporter_username: str | None = None
    ai_summary: str | None
    ai_recommendation: str | None
    analysis_notes: str | None
    resolution_notes: str | None
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None
    evidence: list[EvidenceOut] = []

class EvidenceOut(BaseModel):
    id: int
    ticket_id: int
    filename: str
    file_size: int
    content_type: str | None
    created_at: datetime


# ─────────────────────────────────────────────────────────────────────────────
# RUNBOOKS - Procedimientos operativos estándar
# ─────────────────────────────────────────────────────────────────────────────

class RunbookIn(BaseModel):
    name: str
    category: str
    description: str
    identification_steps: list[Any] = []
    containment_steps: list[Any] = []
    eradication_steps: list[Any] = []
    recovery_steps: list[Any] = []
    post_mortem_steps: list[Any] = []
    severity_applicable: str = "all"


class RunbookOut(BaseModel):
    id: int
    name: str
    category: str
    description: str
    identification_steps: list[Any]
    containment_steps: list[Any]
    eradication_steps: list[Any]
    recovery_steps: list[Any]
    post_mortem_steps: list[Any]
    severity_applicable: str
    is_active: bool
    created_by_id: int | None = None
    created_at: datetime
    updated_at: datetime


# ─────────────────────────────────────────────────────────────────────────────
# GEOLOCATION - Datos geográficos para Threat Map
# ─────────────────────────────────────────────────────────────────────────────

class GeoLocation(BaseModel):
    ip: str
    country: str
    country_code: str
    city: str
    isp: str
    lat: float
    lon: float
    count: int = 1


class ThreatMapData(BaseModel):
    attacks: list[GeoLocation]
    countries: list[dict]
    total_attacks: int
