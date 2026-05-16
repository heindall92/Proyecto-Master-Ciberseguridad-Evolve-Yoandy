#!/usr/bin/env python3
"""
Reset de datos operativos del SOC para entrega / demo limpia.

Elimina: tickets, chat, IOCs, eventos, alertas, evidencias, audit log, tokens revocados.
Conserva: usuario admin, monitores por defecto, runbooks, ajustes de sistema.
Elimina usuarios que no sean admin (pruebas internas).

Uso:
  python scripts/factory_reset_soc.py
  python scripts/factory_reset_soc.py --yes
"""
from __future__ import annotations

import argparse
import asyncio
import selectors
import shutil
import sys
from pathlib import Path

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

def _backend_root() -> Path:
    """Raíz del paquete backend: repo en host o /app en Docker."""
    repo = Path(__file__).resolve().parents[1]
    if (repo / "backend" / "app").is_dir():
        return repo / "backend"
    if Path("/app/app").is_dir():
        return Path("/app")
    return repo / "backend"


BACKEND_ROOT = _backend_root()
sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import delete, select
from app.db import SessionLocal
from app.models import (
    AIAnalysis,
    Alert,
    AuditLog,
    ChatMessage,
    Event,
    Evidence,
    IOC,
    RevokedToken,
    Ticket,
    User,
)


async def factory_reset(*, keep_admin_only: bool = True) -> dict[str, int]:
    counts: dict[str, int] = {}
    evidence_dir = BACKEND_ROOT / "uploads" / "evidence"
    avatars_dir = BACKEND_ROOT / "uploads" / "avatars"

    async with SessionLocal() as db:
        for model, key in (
            (Evidence, "evidence"),
            (Ticket, "tickets"),
            (ChatMessage, "chat_messages"),
            (IOC, "iocs"),
            (AIAnalysis, "ai_analysis"),
            (Alert, "alerts"),
            (Event, "events"),
            (AuditLog, "audit_logs"),
            (RevokedToken, "revoked_tokens"),
        ):
            res = await db.execute(delete(model))
            counts[key] = res.rowcount or 0

        if keep_admin_only:
            res = await db.execute(delete(User).where(User.username != "admin"))
            counts["users_removed"] = res.rowcount or 0
            admin = (await db.execute(select(User).where(User.username == "admin"))).scalar_one_or_none()
            if admin:
                counts["users_kept"] = 1
            else:
                counts["users_kept"] = 0

        await db.commit()

    if evidence_dir.exists():
        shutil.rmtree(evidence_dir, ignore_errors=True)
    evidence_dir.mkdir(parents=True, exist_ok=True)

    # Avatares de prueba (no subir al repo; limpiar en reset local)
    if avatars_dir.exists():
        for f in avatars_dir.iterdir():
            if f.is_file():
                f.unlink(missing_ok=True)

    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description="Reset datos operativos Valhalla SOC")
    parser.add_argument("-y", "--yes", action="store_true", help="Sin confirmación")
    args = parser.parse_args()

    if not args.yes:
        print("Esto borrará tickets, chat, IOCs, notificaciones (datos) y usuarios excepto admin.")
        if input("Continuar? [s/N]: ").strip().lower() not in ("s", "si", "sí", "y", "yes"):
            print("Cancelado.")
            return 0

    counts = asyncio.run(factory_reset(keep_admin_only=True))
    print("Reset completado:")
    for k, v in sorted(counts.items()):
        print(f"  {k}: {v}")
    print("\nReinicie el backend: docker compose up -d backend")
    print("En el navegador: recargue con Ctrl+F5 (limpia caché de notificaciones en localStorage).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
