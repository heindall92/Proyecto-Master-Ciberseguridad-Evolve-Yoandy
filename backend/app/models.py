from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Identity, Index, String, Text, func
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=False), primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    source_ip: Mapped[str | None] = mapped_column(INET, nullable=True)
    attack_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    raw_log: Mapped[dict] = mapped_column(JSONB, nullable=False)

    alerts: Mapped[list["Alert"]] = relationship(back_populates="event")

    __table_args__ = (
        Index("idx_events_timestamp", timestamp.desc()),
        Index("idx_events_source_ip", source_ip),
        Index("idx_events_attack_type", attack_type),
    )


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=False), primary_key=True)
    event_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("events.id", ondelete="SET NULL"), nullable=True)
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    rule_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    raw_alert: Mapped[dict] = mapped_column(JSONB, nullable=False)

    event: Mapped[Event | None] = relationship(back_populates="alerts")
    analysis: Mapped["AIAnalysis | None"] = relationship(back_populates="alert", uselist=False)

    __table_args__ = (
        Index("idx_alerts_timestamp", timestamp.desc()),
        Index("idx_alerts_severity", severity),
        Index("idx_alerts_event_id", event_id),
    )


class AIAnalysis(Base):
    __tablename__ = "ai_analysis"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=False), primary_key=True)
    alert_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("alerts.id", ondelete="CASCADE"), nullable=False, unique=True)

    attack_type: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    recommended_action: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    raw_response: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    alert: Mapped[Alert] = relationship(back_populates="analysis")

    __table_args__ = (Index("idx_ai_analysis_created_at", created_at.desc()),)

