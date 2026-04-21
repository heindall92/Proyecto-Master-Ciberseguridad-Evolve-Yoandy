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

