"""Endpoints de inteligencia: IOC, VirusTotal, AbuseIPDB, CVE y bloqueo de IPs."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request
from sqlalchemy import desc, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app import abuseipdb_client as abuse
from app import cve_feed
from app import virustotal_client as vt
from app.auth import get_current_user
from app.crypto import encrypt_secret
from app.db import get_db
from app.limits import limiter
from app.logger import logger
from app.models import IOC, SystemSetting, User
from app.ollama_client import draft_social_post
from app.schemas import FirewallBlockIn, FirewallUnblockIn, IocCreate, IocUpdate, SocialPostIn, VtKeyIn
from app.security import InputValidator
from app.services.firewall import _apply_ip_block, _can_block_ips, _push_blocked_cdb
from app.services.intel_keys import _resolve_abuseipdb_api_key, _resolve_vt_api_key

router = APIRouter()


@router.get("/api/users/me/vt-api-key")
async def get_my_vt_key_status(db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    row = (
        await db.execute(
            select(SystemSetting).where(SystemSetting.key == f"vt_api_key_user_{current.id}")
        )
    ).scalar_one_or_none()
    return {"configured": row is not None}


@router.put("/api/users/me/vt-api-key")
async def set_my_vt_key(data: VtKeyIn, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    key = data.api_key.strip()
    setting_key = f"vt_api_key_user_{current.id}"
    row = (await db.execute(select(SystemSetting).where(SystemSetting.key == setting_key))).scalar_one_or_none()
    enc = encrypt_secret(key)
    if row:
        row.value = enc
        row.is_sensitive = True
    else:
        db.add(SystemSetting(key=setting_key, value=enc, is_sensitive=True))
    await db.commit()
    test = await vt.check_ip("8.8.8.8", key)
    if "error" in test and ("401" in str(test["error"]) or "Forbidden" in str(test["error"])):
        raise HTTPException(401, "API Key inválida")
    return {"status": "ok", "configured": True}


@router.delete("/api/users/me/vt-api-key")
async def delete_my_vt_key(db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    setting_key = f"vt_api_key_user_{current.id}"
    row = (await db.execute(select(SystemSetting).where(SystemSetting.key == setting_key))).scalar_one_or_none()
    if row:
        await db.delete(row)
        await db.commit()
    return {"ok": True}


# VIRUSTOTAL
@router.get("/api/virustotal/check-key")
async def vt_check_key(request: Request, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    key = await _resolve_vt_api_key(request, db, current)
    res = await vt.check_ip("8.8.8.8", key)
    if "error" in res and ("401" in str(res["error"]) or "Forbidden" in str(res["error"])):
        raise HTTPException(401, "API Key inválida")
    return {"status": "ok", "message": "API Key válida"}


@router.get("/api/virustotal/ip/{ip}")
async def vt_scan_ip(ip: str, request: Request, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    ip = InputValidator.validate_ip(ip)  # la IP va en la URL hacia VirusTotal: validar antes
    key = await _resolve_vt_api_key(request, db, current)
    return await vt.check_ip(ip, key)


@router.get("/api/virustotal/hash/{file_hash}")
async def vt_scan_hash(file_hash: str, request: Request, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    key = await _resolve_vt_api_key(request, db, current)
    return await vt.check_hash(file_hash, key)


@router.get("/api/virustotal/domain/{domain}")
async def vt_scan_domain(domain: str, request: Request, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    key = await _resolve_vt_api_key(request, db, current)
    return await vt.check_domain(domain, key)


@router.put("/api/users/me/abuseipdb-api-key")
async def set_my_abuseipdb_key(data: VtKeyIn, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    key = data.api_key.strip()
    setting_key = f"abuseipdb_api_key_user_{current.id}"
    row = (await db.execute(select(SystemSetting).where(SystemSetting.key == setting_key))).scalar_one_or_none()
    enc = encrypt_secret(key)
    if row:
        row.value = enc
        row.is_sensitive = True
    else:
        db.add(SystemSetting(key=setting_key, value=enc, is_sensitive=True))
    await db.commit()
    test = await abuse.check_ip("8.8.8.8", key)
    if "error" in test and ("401" in str(test["error"]) or "403" in str(test["error"])):
        raise HTTPException(401, "API Key inválida")
    return {"status": "ok", "configured": True}


@router.get("/api/users/me/abuseipdb-api-key")
async def get_my_abuseipdb_key_status(db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    row = (
        await db.execute(
            select(SystemSetting).where(SystemSetting.key == f"abuseipdb_api_key_user_{current.id}")
        )
    ).scalar_one_or_none()
    return {"configured": row is not None}


@router.get("/api/abuseipdb/ip/{ip}")
async def abuseipdb_scan_ip(ip: str, request: Request, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    ip = InputValidator.validate_ip(ip)
    key = await _resolve_abuseipdb_api_key(request, db, current)
    return await abuse.check_ip(ip, key)


@router.get("/api/ioc")
async def list_iocs_ep(status: str = None, ioc_type: str = None, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    q = select(IOC).order_by(desc(IOC.created_at))
    if status: q = q.where(IOC.status == status)
    if ioc_type: q = q.where(IOC.ioc_type == ioc_type)
    return (await db.execute(q)).scalars().all()


@router.post("/api/ioc")
async def add_ioc_ep(req: IocCreate, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    existing = (await db.execute(select(IOC).where(IOC.value == req.value))).scalar_one_or_none()
    if existing:
        if req.status:
            existing.status = req.status
            if req.tags:
                existing.tags = list(set((existing.tags or []) + req.tags))
            if req.vt_report:
                existing.vt_report = req.vt_report
            existing.malicious_score = req.malicious_score
            await db.commit()
            await db.refresh(existing)
            return existing
        raise HTTPException(400, "IOC ya existe en la lista")

    ioc = IOC(
        value=req.value,
        ioc_type=req.ioc_type,
        malicious_score=req.malicious_score,
        total_engines=req.total_engines,
        country=req.country,
        asn=req.asn,
        as_owner=req.as_owner,
        tags=req.tags,
        status=req.status,
        vt_report=req.vt_report,
    )
    db.add(ioc)
    try:
        await db.commit()
        await db.refresh(ioc)
    except IntegrityError:
        raise HTTPException(400, "IOC ya existe")
    return ioc


@router.patch("/api/ioc/{id}")
async def update_ioc_ep(id: int, req: IocUpdate, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    ioc = (await db.execute(select(IOC).where(IOC.id == id))).scalar_one_or_none()
    if not ioc:
        raise HTTPException(404, "IOC no encontrado")
    for field, value in req.model_dump(exclude_unset=True).items():
        if field == "tags" and value is not None:
            ioc.tags = list(set((ioc.tags or []) + value))
        else:
            setattr(ioc, field, value)
    await db.commit()
    return ioc


@router.delete("/api/ioc/{id}")
async def delete_ioc_ep(id: int, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    ioc = (await db.execute(select(IOC).where(IOC.id == id))).scalar_one_or_none()
    if not ioc: raise HTTPException(404, "IOC no encontrado")
    await db.delete(ioc)
    await db.commit()
    return {"ok": True}


@router.get("/api/firewall/blocked")
async def list_blocked_ips(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    rows = (
        await db.execute(
            select(IOC)
            .where(IOC.status == "blocked", IOC.ioc_type == "ip")
            .order_by(desc(IOC.updated_at))
        )
    ).scalars().all()
    return [
        {
            "ip": r.value,
            "country": r.country,
            "as_owner": r.as_owner,
            "tags": r.tags,
            "since": r.updated_at,
        }
        for r in rows
    ]


@router.post("/api/firewall/block")
async def firewall_block(
    req: FirewallBlockIn,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if not _can_block_ips(current):
        raise HTTPException(403, "Solo admin o analista puede bloquear IPs")
    ip = InputValidator.validate_ip(req.ip.strip())

    existing = (await db.execute(select(IOC).where(IOC.value == ip))).scalar_one_or_none()
    if existing and any("whitelist" in (t or "").lower() for t in (existing.tags or [])):
        raise HTTPException(409, "La IP está en lista blanca; retírala antes de bloquear")

    r = await _apply_ip_block(db, ip)
    cdb_ok, ar_ok, ar_skipped, detail = r["cdb_ok"], r["ar_ok"], r["ar_skipped"], r["detail"]

    # Éxito = la IP quedó persistida en la lista CDB (regla 100500 la aplicará en el
    # manager al reaparecer; en agentes reales el AR-API la bloquea de inmediato).
    # Solo es fallo real si la CDB no se pudo actualizar Y el AR tampoco se ejecutó.
    if not cdb_ok and not ar_ok:
        await db.rollback()
        raise HTTPException(502, f"Wazuh no confirmó el bloqueo de {ip}. Detalle: {detail}")

    await db.commit()
    return {
        "ok": True,
        "ip": ip,
        "cdb_applied": cdb_ok,
        "active_response": ar_ok,
        "active_response_skipped": ar_skipped,
        "timeout": req.timeout,
        "detail": detail,
    }


@router.post("/api/cowrie/block")
async def cowrie_block_alias(
    req: FirewallBlockIn,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Alias de compatibilidad citado en docs/WAZUH_ACTIVE_RESPONSE.md."""
    return await firewall_block(req, db, current)


@router.post("/api/firewall/unblock")
async def firewall_unblock(
    req: FirewallUnblockIn,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if not _can_block_ips(current):
        raise HTTPException(403, "Solo admin o analista puede desbloquear IPs")
    ip = InputValidator.validate_ip(req.ip.strip())

    existing = (await db.execute(select(IOC).where(IOC.value == ip))).scalar_one_or_none()
    if existing:
        existing.status = "cleared"
        existing.tags = [t for t in (existing.tags or []) if t != "blocked-firewall"]
    await db.flush()

    cdb_ok = False
    detail: dict[str, Any] = {}
    try:
        cdb_res = await _push_blocked_cdb(db)
        cdb_ok = int(cdb_res.get("error", 1)) == 0
        detail["cdb"] = cdb_res
    except Exception as e:
        detail["cdb_error"] = str(e)
        logger.warning("Firewall unblock — CDB upload falló para %s: %s", ip, e)

    await db.commit()
    # iptables: el DROP activo expira por el <timeout> del active-response configurado en ossec.conf
    return {"ok": True, "ip": ip, "cdb_applied": cdb_ok, "detail": detail}


# ─────────────────────────────────────────────
# CVE INTEL — feed de vulnerabilidades + post IA para redes (Fase 5)
# La IA redacta un BORRADOR (no publica). Difusión la decide el analista.
# ─────────────────────────────────────────────
@router.get("/api/cve/latest")
async def cve_latest(limit: int = Query(15, ge=1, le=50), _=Depends(get_current_user)):
    return await cve_feed.get_latest_cves(limit)


@router.get("/api/cve/{cve_id}/enrich")
async def cve_enrich_one(cve_id: str = Path(..., pattern=r"^CVE-\d{4}-\d{4,7}$"), _=Depends(get_current_user)):
    """CVSS (NVD), PoC públicos (GitHub), Exploit-DB y prioridad de parcheo para una CVE."""
    from app import cve_enrich
    kev = next((c for c in cve_feed._CACHE.get("data", []) if c.get("id") == cve_id), None)
    return await cve_enrich.enrich(cve_id, kev)


@router.get("/api/cve/{cve_id}/exploits")
async def cve_exploits(cve_id: str, _=Depends(get_current_user)):
    """Exploits públicos (Exploit-DB / searchsploit en Kali) para una CVE."""
    from app import exploit_search
    return await exploit_search.search_exploits(cve_id)


@router.post("/api/cve/social-post")
@limiter.limit("10/minute")
async def cve_social_post(request: Request, req: SocialPostIn | None = None, current: User = Depends(get_current_user)):
    """La IA redacta un post de difusión. Si se indican cve_ids, sobre esas; si no, top recientes."""
    if current.role.lower() not in ("admin", "analyst", "analista"):
        raise HTTPException(403, "Solo admin o analista puede generar el post")
    cves = await cve_feed.get_latest_cves(50)
    ids = (req.cve_ids if req else []) or []
    if ids:
        idset = {i.upper() for i in ids}
        selected = [c for c in cves if c["id"].upper() in idset][:8]
        if not selected:
            raise HTTPException(404, "No se encontraron las CVE seleccionadas en el feed actual")
    else:
        selected = sorted(cves, key=lambda c: c.get("published", ""), reverse=True)[:5]
    post = await draft_social_post(selected)
    return {"post": post, "cves_used": [{"id": c["id"], "severity": c.get("severity")} for c in selected], "auto_published": False}
