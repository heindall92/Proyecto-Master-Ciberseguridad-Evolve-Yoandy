from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
import re

from pydantic import BaseModel, Field, field_validator, ConfigDict, AliasChoices

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
    security_rank: str = "L1 Analyst"
    email: str | None = None
    avatar_url: str | None = None

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    username: str | None = None
    email: str | None = None
    role: str | None = None
    security_rank: str | None = None
    password: str | None = None
    # Obligatoria cuando un usuario cambia su propia contraseña.
    current_password: str | None = None
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
    expires_in: int = 0

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


# --- IOC / Threat Intel ---

IocType = Literal["ip", "domain", "hash", "url"]
IocStatus = Literal["watchlist", "blocked", "cleared", "investigating"]


class IocCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value: str = Field(..., min_length=1, max_length=512)
    ioc_type: IocType
    malicious_score: int = Field(default=0, ge=0, le=100)
    total_engines: int = Field(default=0, ge=0, le=200)
    country: str | None = Field(default=None, max_length=80)
    asn: str | None = Field(default=None, max_length=32)
    as_owner: str | None = Field(default=None, max_length=200)
    tags: list[str] = Field(default_factory=list, max_length=20)
    status: IocStatus = "watchlist"
    vt_report: dict[str, Any] | None = None

    @field_validator("value")
    @classmethod
    def strip_value(cls, v: str) -> str:
        return v.strip()


class IocUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: IocStatus | None = None
    analyst_notes: str | None = Field(default=None, max_length=5000)
    related_ticket_id: int | None = None
    tags: list[str] | None = None
    vt_report: dict[str, Any] | None = None
    malicious_score: int | None = Field(default=None, ge=0, le=100)


# --- Firewall / Active Response (Fase 1) ---


class FirewallBlockIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ip: str = Field(..., min_length=7, max_length=45)
    timeout: int | None = Field(default=None, ge=0, le=604800)  # 0 = permanente, máx 7 días
    reason: str | None = Field(default=None, max_length=255)


class FirewallUnblockIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ip: str = Field(..., min_length=7, max_length=45)


class TriageRequest(BaseModel):
    """Contexto de alerta para el triage IA estructurado (Fase 3)."""
    model_config = ConfigDict(extra="forbid")

    description: str = Field(..., min_length=1, max_length=2000)
    source_ip: str | None = Field(default=None, max_length=45)
    full_log: str | None = Field(default=None, max_length=8000)
    rule_id: int | None = None
    rule_level: int | None = Field(default=None, ge=0, le=16)


class SocialPostIn(BaseModel):
    """CVEs seleccionadas para que la IA redacte el post (Fase 5). Vacío = top recientes."""
    model_config = ConfigDict(extra="forbid")

    cve_ids: list[str] = Field(default_factory=list, max_length=20)


class PlaybookActionIn(BaseModel):
    """Acción ejecutable de un playbook/runbook (SOAR ligero, Fase 3).

    El humano aprueba la acción (un clic en la UI) y el backend la ejecuta de verdad,
    con auditoría. Solo acciones seguras y reversibles; nada irreversible automático.
    """
    model_config = ConfigDict(extra="forbid")

    action: Literal["block_ip", "unblock_ip", "create_ticket", "add_ioc", "enrich_ip"]
    ip: str | None = Field(default=None, max_length=45)
    title: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    severity: str | None = Field(default=None, max_length=20)
    runbook_id: int | None = None


class ChatMessageIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str | None = None
    text: str = Field(..., min_length=1, max_length=8000)
    chat_id: str = Field(default="global", alias="chatId", max_length=128)
    mentions: list[str] = Field(default_factory=list, max_length=50)
    attachment: dict[str, Any] | None = None

    @field_validator("text")
    @classmethod
    def sanitize_text(cls, v: str) -> str:
        return _sanitize_html(v) or ""


class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    user_id: int = Field(..., validation_alias=AliasChoices("userId", "user_id"), serialization_alias="userId")
    username: str
    text: str | None = None
    timestamp: datetime
    chat_id: str = Field(..., validation_alias=AliasChoices("chatId", "chat_id"), serialization_alias="chatId")
    mentions: list[str] = Field(default_factory=list)
    attachment: dict[str, Any] | None = None



class AiSettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ollama_model: str | None = Field(default=None, max_length=80)
    ollama_temperature: float | None = Field(default=None, ge=0.0, le=2.0)


class VtKeyIn(BaseModel):
    api_key: str = Field(..., min_length=32, max_length=256)
