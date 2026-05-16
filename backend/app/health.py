import asyncio
import time
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.db import get_db
from app.auth import get_current_user
from app.models import User
import httpx

from app.settings import settings
from app.wazuh_client import wazuh
from app.http_tls import httpx_verify

router = APIRouter(prefix="/api/health/integrations", tags=["health"])

async def check_wazuh() -> dict:
    start = time.time()
    try:
        async with asyncio.timeout(3):
            # A simple wazuh check
            agents = await wazuh.get_agents()
            return {"status": "ok", "latency_ms": int((time.time() - start)*1000), "error": None}
    except Exception as e:
        return {"status": "error", "latency_ms": int((time.time() - start)*1000), "error": str(e)}

async def check_indexer() -> dict:
    start = time.time()
    try:
        async with asyncio.timeout(8):
            async with httpx.AsyncClient(verify=httpx_verify()) as client:
                res = await client.get(
                    f"{settings.opensearch_url.rstrip('/')}/",
                    auth=(settings.opensearch_user, settings.opensearch_pass),
                )
                latency = int((time.time() - start) * 1000)
                if res.status_code == 200:
                    return {"status": "ok", "latency_ms": latency, "error": None}
                hint = None
                if res.status_code == 401:
                    hint = (
                        "Credenciales OpenSearch incorrectas — en laboratorio use "
                        "OPENSEARCH_USER=admin y OPENSEARCH_PASSWORD=admin en .env"
                    )
                return {
                    "status": "error",
                    "latency_ms": latency,
                    "error": hint or f"HTTP {res.status_code}",
                }
    except Exception as e:
        return {"status": "error", "latency_ms": int((time.time() - start) * 1000), "error": str(e)}

async def check_dashboard() -> dict:
    start = time.time()
    urls = (
        "https://wazuh.dashboard:443/",
        "https://wazuh.dashboard:443/api/status",
        "https://wazuh.dashboard:443/app/login",
    )
    last_err: str | None = None
    for url in urls:
        try:
            async with asyncio.timeout(3):
                async with httpx.AsyncClient(verify=httpx_verify(), follow_redirects=True) as client:
                    res = await client.get(url)
                    latency = int((time.time() - start) * 1000)
                    if res.status_code < 500:
                        return {"status": "ok", "latency_ms": latency, "error": None}
                    last_err = f"HTTP {res.status_code}"
        except Exception as e:
            last_err = str(e)
    return {
        "status": "warning",
        "latency_ms": int((time.time() - start) * 1000),
        "error": last_err or "No responde — UI en https://localhost:443",
    }

async def check_postgres(db: AsyncSession) -> dict:
    start = time.time()
    try:
        async with asyncio.timeout(3):
            await db.execute(text("SELECT 1"))
            return {"status": "ok", "latency_ms": int((time.time() - start)*1000), "error": None}
    except Exception as e:
        return {"status": "error", "latency_ms": int((time.time() - start)*1000), "error": str(e)}

async def check_ollama() -> dict:
    start = time.time()
    try:
        async with asyncio.timeout(3):
            async with httpx.AsyncClient() as client:
                res = await client.get(f"{settings.ollama_base_url}/api/tags")
                return {"status": "ok" if res.status_code == 200 else "error", "latency_ms": int((time.time() - start)*1000), "error": None}
    except Exception as e:
        return {"status": "error", "latency_ms": int((time.time() - start)*1000), "error": str(e)}

async def check_vt() -> dict:
    start = time.time()
    try:
        if not settings.virustotal_api_key:
            return {
                "status": "info",
                "latency_ms": 0,
                "error": "Opcional — configure VIRUSTOTAL_API_KEY o Threat Intel",
            }
        return {"status": "ok", "latency_ms": 0, "error": None}
    except Exception as e:
        return {"status": "error", "latency_ms": int((time.time() - start)*1000), "error": str(e)}

@router.get("")
async def get_integrations_health(
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user)
):
    wazuh_res, idx_res, pg_res, ollama_res, vt_res, dash_res = await asyncio.gather(
        check_wazuh(), check_indexer(), check_postgres(db), check_ollama(), check_vt(), check_dashboard()
    )
    
    return {
        "wazuh": wazuh_res,
        "indexer": idx_res,
        "dashboard": dash_res,
        "postgres": pg_res,
        "ollama": ollama_res,
        "virustotal": vt_res,
    }
