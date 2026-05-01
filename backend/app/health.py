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
        async with asyncio.timeout(3):
            async with httpx.AsyncClient(verify=False) as client:
                res = await client.get(
                    f"{settings.opensearch_url}/",
                    auth=(settings.opensearch_user, settings.opensearch_pass)
                )
                status = "ok" if res.status_code == 200 else "error"
                return {"status": status, "latency_ms": int((time.time() - start)*1000), "error": None}
    except Exception as e:
        return {"status": "error", "latency_ms": int((time.time() - start)*1000), "error": str(e)}

async def check_dashboard() -> dict:
    start = time.time()
    try:
        async with asyncio.timeout(3):
            async with httpx.AsyncClient(verify=False) as client:
                res = await client.get(f"https://{settings.opensearch_host}:5601/api/status")
                return {"status": "ok" if res.status_code == 200 else "warning", "latency_ms": int((time.time() - start)*1000), "error": None}
    except Exception as e:
        return {"status": "error", "latency_ms": int((time.time() - start)*1000), "error": str(e)}

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
             return {"status": "warning", "latency_ms": 0, "error": "Not configured"}
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
