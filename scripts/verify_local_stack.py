#!/usr/bin/env python3
"""Verificación rápida del stack local (health, login, refresh, frontend)."""
from __future__ import annotations

import re
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"
API = "http://localhost:8000"
FRONT = "http://localhost:3000"


def _read_env(key: str) -> str:
    if not ENV_PATH.exists():
        return ""
    for line in ENV_PATH.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.strip().startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        if k.strip() == key:
            return v.strip()
    return ""


def ok(msg: str) -> None:
    print(f"  OK  {msg}")


def fail(msg: str) -> None:
    print(f"  FAIL {msg}")
    sys.exit(1)


def main() -> int:
    print("=== Valhalla SOC — verificación local ===\n")
    admin_pass = _read_env("ADMIN_PASSWORD")
    if not admin_pass:
        fail("ADMIN_PASSWORD no encontrado en .env — ejecute scripts/setup_env.py")

    with httpx.Client(timeout=15.0, follow_redirects=True) as c:
        r = c.get(f"{API}/health")
        if r.status_code != 200:
            fail(f"GET /health -> {r.status_code}")
        ok(f"Backend /health -> {r.json()}")

        r = c.get(FRONT)
        if r.status_code not in (200, 304):
            fail(f"Frontend {FRONT} -> {r.status_code}")
        ok(f"Frontend responde ({r.status_code})")

        r = c.post(
            f"{API}/api/auth/login",
            json={"username": "admin", "password": admin_pass},
        )
        if r.status_code != 200:
            fail(f"Login admin -> {r.status_code}: {r.text[:200]}")
        ok("Login admin")

        cookies = r.cookies
        me = c.get(f"{API}/api/auth/me", cookies=cookies)
        if me.status_code != 200:
            fail(f"GET /api/auth/me -> {me.status_code}")
        ok(f"Sesión activa: {me.json().get('username')}")

        refresh = c.post(f"{API}/api/auth/refresh", cookies=cookies)
        if refresh.status_code != 200:
            fail(f"POST /api/auth/refresh -> {refresh.status_code}")
        ok("Refresh token")

        cookies = refresh.cookies
        wh = c.post(
            f"{API}/api/webhook/wazuh",
            json={"rule": {"level": 5, "description": "test", "id": "1"}, "data": {}},
            headers={"X-Valhalla-Webhook-Token": _read_env("WEBHOOK_SECRET")},
        )
        if wh.status_code != 200:
            fail(f"Webhook -> {wh.status_code}")
        ok("Webhook Wazuh (token)")

        out = c.post(f"{API}/api/auth/logout", cookies=cookies)
        if out.status_code != 200:
            fail(f"Logout -> {out.status_code}")
        me2 = c.get(f"{API}/api/auth/me", cookies=cookies)
        if me2.status_code != 401:
            fail(f"Tras logout /me debería ser 401, fue {me2.status_code}")
        ok("Logout revoca sesión")

    print("\n=== Todo correcto en local ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
