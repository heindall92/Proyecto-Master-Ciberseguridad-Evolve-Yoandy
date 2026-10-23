"""Bloqueo de IPs en Wazuh: lista CDB y respuesta activa; la tabla IOC es la fuente de verdad."""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.logger import logger
from app.models import IOC, User
from app.wazuh_client import wazuh


def _can_block_ips(user: User) -> bool:
    return user.role.lower() in ("admin", "analyst", "analista")


async def _build_blocked_cdb(db: AsyncSession) -> str:
    """Contenido de la lista CDB 'blocked-ips' desde los IOC bloqueados (formato key:value).

    Incluye siempre una línea de cabecera para que el archivo nunca quede vacío: la API
    de Wazuh rechaza subir un cuerpo vacío (error 1912) cuando se desbloquea la última IP.
    """
    rows = (
        await db.execute(
            select(IOC.value).where(IOC.status == "blocked", IOC.ioc_type == "ip")
        )
    ).scalars().all()
    header = "valhalla-soc-managed:1\n"  # entrada centinela inocua (no es una IP)
    return header + "".join(f"{ip}:drop\n" for ip in sorted(set(rows)))


async def _push_blocked_cdb(db: AsyncSession) -> dict:
    return await wazuh.upload_cdb_list("blocked-ips", await _build_blocked_cdb(db))


async def _apply_ip_block(db: AsyncSession, ip: str) -> dict[str, Any]:
    """Núcleo de bloqueo reutilizable (endpoint manual y co-piloto IA).

    Upsert del IOC como blocked + proyección a la lista CDB + firewall-drop.
    NO hace commit/rollback (lo gestiona el llamante). Devuelve estado real.
    """
    existing = (await db.execute(select(IOC).where(IOC.value == ip))).scalar_one_or_none()
    if existing:
        existing.status = "blocked"
        existing.tags = list({*(existing.tags or []), "blocked-firewall"})
    else:
        db.add(IOC(value=ip, ioc_type="ip", status="blocked", tags=["blocked-firewall"], malicious_score=0))
    await db.flush()

    cdb_ok = ar_ok = ar_skipped = False
    detail: dict[str, Any] = {}
    try:
        cdb_res = await _push_blocked_cdb(db)
        cdb_ok = int(cdb_res.get("error", 1)) == 0
        detail["cdb"] = cdb_res
    except Exception as e:
        detail["cdb_error"] = str(e)
        logger.warning("Block — CDB upload falló para %s: %s", ip, e)
    try:
        ar_res = await wazuh.run_firewall_drop(ip)
        ar_skipped = bool(ar_res.get("skipped"))
        ar_ok = int(ar_res.get("error", 1)) == 0 and not ar_skipped
        detail["active_response"] = ar_res
    except Exception as e:
        detail["ar_error"] = str(e)
        logger.warning("Block — firewall-drop falló para %s: %s", ip, e)

    return {"cdb_ok": cdb_ok, "ar_ok": ar_ok, "ar_skipped": ar_skipped, "detail": detail}
