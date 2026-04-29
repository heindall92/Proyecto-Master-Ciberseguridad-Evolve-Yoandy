from __future__ import annotations

from datetime import datetime

from sqlalchemy import Integer, BigInteger, DateTime, ForeignKey, Identity, Index, String, Text, func, JSON
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    email: Mapped[str | None] = mapped_column(String(128), nullable=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(String(32), default="analista", nullable=False)
    rank: Mapped[str] = mapped_column(String(64), default="L1 Analyst", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    assigned_tickets: Mapped[list["Ticket"]] = relationship(
        "Ticket", back_populates="assignee", foreign_keys="Ticket.assigned_to_id"
    )
    reported_tickets: Mapped[list["Ticket"]] = relationship(
        "Ticket", back_populates="reporter", foreign_keys="Ticket.reporter_id"
    )

    __table_args__ = (Index("idx_users_role", role),)


# ─────────────────────────────────────────────────────────────────────────────
# RUNBOOKS - Procedimientos operativos estándar
# ─────────────────────────────────────────────────────────────────────────────

class Runbook(Base):
    """Procedimientos operativos estándar del SOC."""
    __tablename__ = "runbooks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    
    # Pasos del runbook en JSON (soporta texto y comandos opcionales)
    identification_steps: Mapped[list] = mapped_column(JSON, default=list) # Fase de Verificación
    containment_steps: Mapped[list] = mapped_column(JSON, default=list)
    eradication_steps: Mapped[list] = mapped_column(JSON, default=list)
    recovery_steps: Mapped[list] = mapped_column(JSON, default=list)
    post_mortem_steps: Mapped[list] = mapped_column(JSON, default=list) # Lecciones aprendidas
    
    # Metadatos
    severity_applicable: Mapped[str] = mapped_column(String(32), default="all")
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    source_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    attack_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    raw_log: Mapped[dict] = mapped_column(JSON, nullable=False)

    alerts: Mapped[list["Alert"]] = relationship(back_populates="event")

    __table_args__ = (
        Index("idx_events_timestamp", timestamp.desc()),
        Index("idx_events_source_ip", source_ip),
        Index("idx_events_attack_type", attack_type),
    )


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("events.id", ondelete="SET NULL"), nullable=True)
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    rule_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    raw_alert: Mapped[dict] = mapped_column(JSON, nullable=False)

    event: Mapped[Event | None] = relationship(back_populates="alerts")
    analysis: Mapped["AIAnalysis | None"] = relationship(back_populates="alert", uselist=False)

    __table_args__ = (
        Index("idx_alerts_timestamp", timestamp.desc()),
        Index("idx_alerts_severity", severity),
        Index("idx_alerts_event_id", event_id),
    )


class AIAnalysis(Base):
    __tablename__ = "ai_analysis"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    alert_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("alerts.id", ondelete="CASCADE"), nullable=False, unique=True)

    attack_type: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    recommended_action: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    raw_response: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    alert: Mapped[Alert] = relationship(back_populates="analysis")

    __table_args__ = (Index("idx_ai_analysis_created_at", created_at.desc()),)


class Ticket(Base):
    """Incident management ticket."""
    __tablename__ = "tickets"

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Criticality / Status
    severity: Mapped[str] = mapped_column(String(16), default="medium", nullable=False)  # low/medium/high/critical
    status: Mapped[str] = mapped_column(String(32), default="open", nullable=False)       # open/in_progress/escalated/resolved/closed
    category: Mapped[str | None] = mapped_column(String(64), nullable=True)               # intrusion/malware/phishing/...

    # Assignment
    assigned_to_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reporter_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Wazuh correlation
    wazuh_alert_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    source_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    affected_asset: Mapped[str | None] = mapped_column(String(255), nullable=True)
    affected_user: Mapped[str | None] = mapped_column(String(128), nullable=True)
    mitre_technique: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # AI Analysis
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_recommendation: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timeline
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Resolution
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    analysis_notes: Mapped[str | None] = mapped_column(Text, nullable=True)   # operator analysis notes

    assignee: Mapped["User | None"] = relationship("User", back_populates="assigned_tickets", foreign_keys=[assigned_to_id])
    reporter: Mapped["User | None"] = relationship("User", back_populates="reported_tickets", foreign_keys=[reporter_id])
    evidence: Mapped[list["Evidence"]] = relationship("Evidence", back_populates="ticket", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_tickets_status", status),
        Index("idx_tickets_severity", severity),
        Index("idx_tickets_created_at", created_at.desc()),
    )


class IOCEntry(Base):
    """Persistent IOC watchlist — malicious indicators tracked by analysts."""
    __tablename__ = "ioc_entries"

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    ioc_type: Mapped[str] = mapped_column(String(16), nullable=False)       # ip / hash / domain / url
    value: Mapped[str] = mapped_column(String(512), nullable=False, index=True)
    malicious_score: Mapped[int] = mapped_column(Integer, default=0)
    total_engines: Mapped[int] = mapped_column(Integer, default=0)
    country: Mapped[str | None] = mapped_column(String(8), nullable=True)
    asn: Mapped[str | None] = mapped_column(String(128), nullable=True)
    as_owner: Mapped[str | None] = mapped_column(String(256), nullable=True)
    tags: Mapped[str | None] = mapped_column(Text, nullable=True)          # JSON list as string
    status: Mapped[str] = mapped_column(String(32), default="watchlist")   # watchlist / blocked / resolved
    analyst_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    related_ticket_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("tickets.id", ondelete="SET NULL"), nullable=True)
    added_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    vt_report: Mapped[dict | None] = mapped_column(JSON, nullable=True)    # Full VT response snapshot
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("idx_ioc_type", ioc_type),
        Index("idx_ioc_status", status),
        Index("idx_ioc_created_at", created_at.desc()),
    )


class Evidence(Base):
    """File attachments for tickets (logs, screenshots, etc.)"""
    __tablename__ = "evidence"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(Integer, ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    ticket: Mapped["Ticket"] = relationship("Ticket", back_populates="evidence")

