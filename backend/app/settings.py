"""
Valhalla SOC — Application Settings
All sensitive values MUST come from environment variables.
In production, missing critical secrets will raise RuntimeError at import time.
"""
from __future__ import annotations

import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Core ──────────────────────────────────────────────────────────────────
    database_url: str = "postgresql+psycopg://valhalla:valhalla@postgres:5432/valhalla"
    cors_origins: str = "http://localhost:3000"
    env: str = "development"
    log_level: str = "INFO"

    # ── Auth / JWT (NO default for secret_key in production) ─────────────────
    secret_key: str = "DEV-ONLY-valhalla-insecure-key-replace-in-prod"  # DEV ONLY
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 120
    refresh_token_expire_minutes: int = 10080  # 7 días
    admin_password: str = ""  # Obligatorio para crear usuario admin en primer arranque
    webhook_secret: str = ""  # Token compartido con integración Wazuh (header X-Valhalla-Webhook-Token)

    # ── Wazuh Manager API ────────────────────────────────────────────────────
    wazuh_api: str = "https://wazuh.manager:55000"
    wazuh_user: str = "wazuh-wui"
    wazuh_pass: str = "wazuh-wui"  # DEV ONLY

    # ── OpenSearch / Wazuh Indexer ───────────────────────────────────────────
    opensearch_url: str = "https://wazuh.indexer:9200"
    opensearch_user: str = "admin"
    opensearch_pass: str = "admin"  # DEV ONLY
    # TLS: false en dev (certificados autofirmados Wazuh); true + TLS_CA_BUNDLE en prod
    tls_verify_ssl: bool = False
    tls_ca_bundle: str = ""

    # ── Ollama (local AI) ────────────────────────────────────────────────────
    ollama_base_url: str = "http://ollama:11434"
    ollama_model: str = "qwen2.5-coder:7b"           # análisis pesado (triage, informes)
    ollama_light_model: str = "qwen2.5:1.5b"          # interactivo (chat, post CVE) — no sobrecarga
    ollama_temperature: float = 0.0
    ollama_timeout_seconds: float = 45.0

    # ── VirusTotal ───────────────────────────────────────────────────────────
    virustotal_api_key: str = ""

    # ── AbuseIPDB (Fase 2: enriquecimiento IOC) ──────────────────────────────
    abuseipdb_api_key: str = ""

    # ── Upload / Evidence ────────────────────────────────────────────────────
    evidence_dir: str = "uploads/evidence"
    max_upload_size_mb: int = 10

    # ── Rate Limiting ────────────────────────────────────────────────────────
    rate_limit_login: str = "5/minute"
    rate_limit_vt: str = "10/minute"
    rate_limit_threat_map: str = "6/minute"

    # ── Geo-cache ────────────────────────────────────────────────────────────
    geo_cache_ttl_days: int = 30

    # ── Session / Cookie security ────────────────────────────────────────────
    # False por defecto: http://localhost sin TLS. En prod: SESSION_COOKIE_SECURE=true
    session_cookie_secure: bool = False
    session_cookie_samesite: str = "lax"
    csrf_enabled: bool = True

    # Tickets desde Wazuh: desactivado por defecto (instalación limpia; activar en .env si se desea)
    auto_sync_wazuh_tickets: bool = False
    auto_create_webhook_tickets: bool = False

    # ── Co-piloto IA (Fase 3): respuesta autónoma CON barreras ───────────────
    # Tier 1: bloqueo automático de IP solo si la IA puntúa por encima del umbral,
    # baja probabilidad de falso positivo y la IP no está en whitelist. Reversible (timeout).
    auto_block_enabled: bool = False          # OFF por defecto (seguridad)
    auto_block_risk_threshold: int = 90       # risk_score mínimo para auto-bloqueo
    auto_block_timeout_seconds: int = 3600    # bloqueo reversible

    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


def _validate_production_secrets(s: Settings) -> None:
    """Fail fast if critical secrets are missing in production."""
    if s.env.lower() != "production":
        return

    weak_markers = ("dev-only", "change-me", "replace-in-prod", "valhalla:valhalla@")

    def _reject(name: str, value: str, *, min_len: int = 16) -> None:
        v = (value or "").strip()
        low = v.lower()
        if not v or len(v) < min_len or any(m in low for m in weak_markers):
            raise RuntimeError(
                f"CRITICAL: '{name}' is missing, too short (<{min_len}), or uses a dev default. "
                "Set strong values in .env before ENV=production."
            )

    _reject("secret_key", s.secret_key, min_len=32)
    _reject("webhook_secret", s.webhook_secret, min_len=24)
    _reject("database_url", s.database_url, min_len=20)

    if "valhalla:valhalla@" in s.database_url.lower():
        raise RuntimeError(
            "CRITICAL: DATABASE_URL must not use default postgres credentials in production."
        )

    if not s.session_cookie_secure:
        raise RuntimeError(
            "CRITICAL: SESSION_COOKIE_SECURE must be true when ENV=production."
        )


settings = Settings()  # type: ignore[call-arg]

if settings.env.lower() == "production" and not settings.session_cookie_secure:
    settings.session_cookie_secure = True

_validate_production_secrets(settings)
