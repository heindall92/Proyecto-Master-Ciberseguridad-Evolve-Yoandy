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
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Core ──────────────────────────────────────────────────────────────────
    database_url: str
    cors_origins: str = "http://localhost:3000"
    env: str = "development"
    log_level: str = "INFO"

    # ── Auth / JWT (NO default for secret_key in production) ─────────────────
    secret_key: str = "DEV-ONLY-valhalla-insecure-key-replace-in-prod"  # DEV ONLY
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480

    # ── Wazuh Manager API ────────────────────────────────────────────────────
    wazuh_api: str = "https://wazuh.manager:55000"
    wazuh_user: str = "wazuh-wui"
    wazuh_pass: str = "wazuh-wui"  # DEV ONLY

    # ── OpenSearch / Wazuh Indexer ───────────────────────────────────────────
    opensearch_url: str = "https://wazuh.indexer:9200"
    opensearch_user: str = "admin"
    opensearch_pass: str = "admin"  # DEV ONLY

    # ── Ollama (local AI) ────────────────────────────────────────────────────
    ollama_base_url: str = "http://ollama:11434"
    ollama_model: str = "qwen2.5-coder:7b"
    ollama_temperature: float = 0.0
    ollama_timeout_seconds: float = 45.0

    # ── VirusTotal ───────────────────────────────────────────────────────────
    virustotal_api_key: str = ""

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
    session_cookie_secure: bool = True
    session_cookie_samesite: str = "strict"
    csrf_enabled: bool = True

    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


def _validate_production_secrets(s: Settings) -> None:
    """Fail fast if critical secrets are missing in production."""
    if s.env.lower() == "production":
        critical = {
            "secret_key": s.secret_key,
            "database_url": s.database_url,
        }
        for name, value in critical.items():
            if not value or "DEV-ONLY" in value or "change-me" in value.lower():
                raise RuntimeError(
                    f"CRITICAL: '{name}' is not set or uses a dev-only default. "
                    f"Set it in .env before running in production."
                )


settings = Settings()  # type: ignore[call-arg]
_validate_production_secrets(settings)
