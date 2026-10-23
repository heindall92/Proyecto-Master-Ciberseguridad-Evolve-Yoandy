"""Centro de informes: almacenamiento con identificador, TLP y huella SHA-256."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import report_builder as rb
from app.models import Report, User

_REPORT_ID_RE = r"^VHL-\d{8}-\d{3,}$"


def _require_report_role(user: User) -> None:
    if user.role not in ("admin", "analyst", "analista"):
        raise HTTPException(403, "Solo admin o analista puede gestionar informes")


def _report_summary(r: Report) -> dict[str, Any]:
    risk = (r.data or {}).get("risk", {})
    return {
        "report_id": r.report_id, "kind": r.kind, "tlp": r.tlp,
        "period_start": r.period_start.isoformat(), "period_end": r.period_end.isoformat(),
        "created_by": r.created_by_username, "created_at": r.created_at.isoformat(),
        "sha256": r.sha256, "risk_level": risk.get("level"), "risk_score": risk.get("score"),
    }


async def _store_report(db: AsyncSession, data: dict, start: datetime, end: datetime, user: User, tlp: str, kind: str) -> Report:
    """Asigna el id VHL-AAAAMMDD-NNN, calcula la huella SHA-256 y guarda el informe."""
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    seq = (await db.execute(select(func.count(Report.id)).where(Report.report_id.like(f"VHL-{today}-%")))).scalar() or 0
    report_id = f"VHL-{today}-{seq + 1:03d}"
    data["meta"]["report_id"] = report_id
    row = Report(report_id=report_id, kind=kind, tlp=tlp, period_start=start, period_end=end,
                 created_by_id=user.id, created_by_username=user.username, sha256=rb.fingerprint(data), data=data)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row
