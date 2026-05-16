"""Configuración TLS compartida para clientes httpx (OpenSearch, Wazuh, etc.)."""
from __future__ import annotations

import ssl
from app.settings import settings


def httpx_verify() -> bool | str | ssl.SSLContext:
    """False en laboratorio; True o ruta a CA en producción."""
    if not settings.tls_verify_ssl:
        return False
    ca = (settings.tls_ca_bundle or "").strip()
    if ca:
        return ca
    return True
