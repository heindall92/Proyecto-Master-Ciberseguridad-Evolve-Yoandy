from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
import re

from pydantic import BaseModel, Field, field_validator, ConfigDict

def _sanitize_html(v: str | None) -> str | None:
    if v is None: return v
    return re.sub(r'<[^>]+>', '', v).strip()


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
    avatar_url: str | None = None

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    username: str | None = None
    email: str | None = None
    role: str | None = None
    rank: str | None = None
    password: str | None = None
    avatar_url: str | None = None

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
    title: str = Field(..., max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    severity: Severity = "medium"
    category: str | None = Field(default=None, max_length=100)
    source_ip: str | None = Field(default=None, max_length=45)
    affected_asset: str | None = Field(default=None, max_length=100)
    affected_user: str | None = Field(default=None, max_length=100)
    mitre_technique: str | None = Field(default=None, max_length=20)
    wazuh_alert_id: str | None = Field(default=None, max_length=100)
    assigned_to_id: int | None = None

    @field_validator("source_ip")
    @classmethod
    def validate_ip(cls, v: str | None):
        if not v: return v
        if not re.match(r"^(\d{1,3}\.){3}\d{1,3}$", v): raise ValueError("Invalid IPv4 format")
        if any(not (0 <= int(o) <= 255) for o in v.split(".")): raise ValueError("IPv4 octets out of range")
        return v

    @field_validator("mitre_technique")
    @classmethod
    def validate_mitre(cls, v: str | None):
        if not v: return v
        if not re.match(r"^T\d{4}(?:\.\d{3})?$", v): raise ValueError("Invalid MITRE technique")
        return v

    @field_validator("description", "title", "category", "affected_asset", "affected_user")
    @classmethod
    def sanitize_html(cls, v: str | None):
        return _sanitize_html(v)

class TicketUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    severity: Severity | None = None
    status: TicketStatus | None = None
    category: str | None = Field(default=None, max_length=100)
    source_ip: str | None = Field(default=None, max_length=45)
    affected_asset: str | None = Field(default=None, max_length=100)
    affected_user: str | None = Field(default=None, max_length=100)
    mitre_technique: str | None = Field(default=None, max_length=20)
    assigned_to_id: int | None = None
    analysis_notes: str | None = Field(default=None, max_length=5000)
    resolution_notes: str | None = Field(default=None, max_length=5000)

    @field_validator("source_ip")
    @classmethod
    def validate_ip(cls, v: str | None):
        if not v: return v
        if not re.match(r"^(\d{1,3}\.){3}\d{1,3}$", v): raise ValueError("Invalid IPv4 format")
        if any(not (0 <= int(o) <= 255) for o in v.split(".")): raise ValueError("IPv4 octets out of range")
        return v

    @field_validator("mitre_technique")
    @classmethod
    def validate_mitre(cls, v: str | None):
        if not v: return v
        if not re.match(r"^T\d{4}(?:\.\d{3})?$", v): raise ValueError("Invalid MITRE technique")
        return v

    @field_validator("description", "title", "category", "affected_asset", "affected_user", "analysis_notes", "resolution_notes")
    @classmethod
    def sanitize_html(cls, v: str | None):
        return _sanitize_html(v)

class TicketAssign(BaseModel):
    assigned_to_id: int

class TicketResolve(BaseModel):
    resolution_notes: str = Field(..., max_length=5000)
    status: TicketStatus = "resolved"

    @field_validator("resolution_notes")
    @classmethod
    def sanitize_html(cls, v: str):
        return _sanitize_html(v) or ""

class TicketAnalysis(BaseModel):
    analysis_notes: str = Field(..., max_length=5000)

    @field_validator("analysis_notes")
    @classmethod
    def sanitize_html(cls, v: str):
        return _sanitize_html(v) or ""

class TicketOut(BaseModel):
    id: int
    title: str
    description: str | None = None
    severity: str
    status: str
    category: str | None = None
    source_ip: str | None = None
    affected_asset: str | None = None
    affected_user: str | None = None
    mitre_technique: str | None = None
    wazuh_alert_id: str | None = None
    assigned_to_id: int | None = None
    reporter_id: int | None = None
    assignee_username: str | None = None
    reporter_username: str | None = None
    ai_summary: str | None = None
    ai_recommendation: str | None = None
    analysis_notes: str | None = None
    resolution_notes: str | None = None
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None = None
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

class AuditLogOut(BaseModel):
    id: int
    user_id: int | None
    username: str | None
    action: str
    route: str
    ip_address: str | None
    payload: dict | None = None
    timestamp: datetime

class SystemSettingIn(BaseModel):
    key: str
    value: str
    is_sensitive: bool = False

class SystemSettingOut(BaseModel):
    key: str
    value: str # Will be decrypted before sending
    is_sensitive: bool
    updated_at: datetime

class MonitorOut(BaseModel):
    id: int
    name: str
    description: str | None
    enabled: bool
    threshold: int
    severity_floor: str
    rule_id_pattern: str | None
    updated_at: datetime

class MonitorUpdate(BaseModel):
    enabled: bool | None = None
    threshold: int | None = None
    severity_floor: str | None = None
