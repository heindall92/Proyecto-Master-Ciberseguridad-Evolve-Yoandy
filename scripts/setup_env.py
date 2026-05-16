#!/usr/bin/env python3
"""
Configuración inicial de Valhalla SOC — genera .env con secretos únicos.

Ejecutar antes del primer `docker compose up` o desde Valhalla-Runner.bat.
No sobrescribe un .env ya válido salvo --force.
"""
from __future__ import annotations

import argparse
import getpass
import re
import secrets
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"
EXAMPLE_PATH = ROOT / ".env.example"
BACKUP_PATH = ROOT / ".env.setup-backup"

PLACEHOLDER_RE = re.compile(
    r"change-me|replace-with-real|dev-only|example|your[-_]?secret",
    re.I,
)

MIN_LENGTHS = {
    "SECRET_KEY": 32,
    "WEBHOOK_SECRET": 24,
    "ADMIN_PASSWORD": 12,
}

INTEGRATION_KEYS = ("OPENSEARCH_PASSWORD", "WAZUH_API_PASSWORD")


def _parse_env(path: Path) -> dict[str, str]:
    data: dict[str, str] = {}
    if not path.exists():
        return data
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        data[key.strip()] = val.strip()
    return data


def _is_placeholder(value: str) -> bool:
    v = (value or "").strip()
    if not v:
        return True
    return bool(PLACEHOLDER_RE.search(v))


def env_needs_setup(path: Path = ENV_PATH) -> bool:
    if not path.exists():
        return True
    values = _parse_env(path)
    for key, min_len in MIN_LENGTHS.items():
        val = values.get(key, "")
        if len(val) < min_len or _is_placeholder(val):
            return True
    for key in INTEGRATION_KEYS:
        val = values.get(key, "")
        if _is_placeholder(val):
            return True
    return False


def patch_integration_credentials(path: Path = ENV_PATH) -> bool:
    """Corrige placeholders de Wazuh/OpenSearch sin regenerar secretos SOC."""
    if not path.exists():
        return False
    values = _parse_env(path)
    patches = {
        "OPENSEARCH_USER": "admin",
        "OPENSEARCH_PASSWORD": "admin",
        "WAZUH_API_USER": "wazuh-wui",
        "WAZUH_API_PASSWORD": "wazuh-wui",
    }
    changed = False
    lines: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.strip().startswith("#"):
            key, _, val = line.partition("=")
            k = key.strip()
            if k in patches and _is_placeholder(val.strip()):
                lines.append(f"{k}={patches[k]}")
                changed = True
                continue
        lines.append(line)
    if changed:
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return changed


def _validate_admin_password(password: str) -> str:
    sys.path.insert(0, str(ROOT / "backend"))
    try:
        from app.security import InputValidator

        return InputValidator.validate_password(password)
    except Exception:
        if len(password) < 12:
            raise ValueError("La contraseña debe tener al menos 12 caracteres")
        if not (any(c.isupper() for c in password) and any(c.islower() for c in password) and any(c.isdigit() for c in password)):
            raise ValueError("Use mayúsculas, minúsculas y números")
        return password


def _generate_secret_key() -> str:
    return secrets.token_urlsafe(48)


def _generate_webhook_secret() -> str:
    return secrets.token_urlsafe(32)


def _prompt_admin_password(non_interactive: bool, provided: str | None) -> str:
    if provided:
        return _validate_admin_password(provided)
    if non_interactive:
        return _validate_admin_password("Valhalla2026!")
    print()
    print("Contraseña del usuario admin del SOC (mín. 12 caracteres).")
    print("Los analistas pueden cambiarla después desde el panel o con scripts/reset_admin.py")
    print("Enter = usar Valhalla2026! (solo laboratorio / primera instalación)")
    print()
    while True:
        raw = getpass.getpass("ADMIN_PASSWORD: ").strip()
        if not raw:
            raw = "Valhalla2026!"
            print("  → Usando contraseña por defecto de laboratorio.")
        try:
            return _validate_admin_password(raw)
        except ValueError as e:
            print(f"  ✗ {e}")


def _merge_env(
    secret_key: str,
    admin_password: str,
    webhook_secret: str,
) -> str:
    if not EXAMPLE_PATH.exists():
        raise FileNotFoundError(f"No se encuentra {EXAMPLE_PATH}")

    overrides = {
        "SECRET_KEY": secret_key,
        "ADMIN_PASSWORD": admin_password,
        "WEBHOOK_SECRET": webhook_secret,
        "ENV": "development",
        "SESSION_COOKIE_SECURE": "false",
        "SESSION_COOKIE_SAMESITE": "lax",
        "VITE_ALLOW_OFFLINE_DEMO": "false",
        # Credenciales por defecto del stack Wazuh 4.9 en Docker (laboratorio)
        "OPENSEARCH_USER": "admin",
        "OPENSEARCH_PASSWORD": "admin",
        "WAZUH_API_USER": "wazuh-wui",
        "WAZUH_API_PASSWORD": "wazuh-wui",
        "TLS_VERIFY_SSL": "false",
        "AUTO_SYNC_WAZUH_TICKETS": "false",
        "AUTO_CREATE_WEBHOOK_TICKETS": "false",
    }

    lines: list[str] = []
    seen: set[str] = set()
    for line in EXAMPLE_PATH.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.strip().startswith("#"):
            key = line.split("=", 1)[0].strip()
            if key in overrides:
                lines.append(f"{key}={overrides[key]}")
                seen.add(key)
                continue
        lines.append(line)

    for key, val in overrides.items():
        if key not in seen:
            lines.append(f"{key}={val}")

    return "\n".join(lines) + "\n"


def _write_backup(secret_key: str, admin_password: str, webhook_secret: str) -> None:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    BACKUP_PATH.write_text(
        f"# Valhalla SOC — copia de secretos generados ({ts})\n"
        f"# Guarde este archivo en un gestor de contraseñas y bórrelo del disco si no lo necesita.\n"
        f"# NUNCA subir a Git.\n\n"
        f"SECRET_KEY={secret_key}\n"
        f"WEBHOOK_SECRET={webhook_secret}\n"
        f"ADMIN_PASSWORD={admin_password}\n",
        encoding="utf-8",
    )


def run_setup(
    *,
    force: bool = False,
    non_interactive: bool = False,
    admin_password: str | None = None,
    quiet: bool = False,
) -> int:
    if ENV_PATH.exists() and not force and not env_needs_setup():
        if not quiet:
            print(f"✓ {ENV_PATH} ya está configurado. Use --force para regenerar.")
        return 0

    if not quiet:
        print("=" * 60)
        print("  VALHALLA SOC — Configuración inicial de secretos")
        print("=" * 60)
        print("Se generarán SECRET_KEY y WEBHOOK_SECRET automáticamente.")
        print("Wazuh, el backend y el login usarán el mismo .env\n")

    admin = _prompt_admin_password(non_interactive, admin_password)
    secret_key = _generate_secret_key()
    webhook_secret = _generate_webhook_secret()

    if ENV_PATH.exists() and force:
        ENV_PATH.rename(ROOT / ".env.bak")

    content = _merge_env(secret_key, admin, webhook_secret)
    ENV_PATH.write_text(content, encoding="utf-8")
    patch_integration_credentials(ENV_PATH)
    _write_backup(secret_key, admin, webhook_secret)

    if not quiet:
        print()
        print("✓ Archivo creado:", ENV_PATH)
        print("✓ Copia de respaldo:", BACKUP_PATH)
        print()
        print("-" * 60)
        print("  GUARDE ESTOS VALORES EN UN LUGAR SEGURO (gestor de contraseñas)")
        print("-" * 60)
        print(f"  SECRET_KEY      = {secret_key}")
        print(f"  WEBHOOK_SECRET  = {webhook_secret}")
        print(f"  ADMIN_PASSWORD  = {admin}")
        print("-" * 60)
        print()
        print("Usuario de login del SOC: admin")
        print("Siguiente paso:")
        print("  docker compose --profile labs up -d --build")
        print("  o ejecute Valhalla-Runner.bat")
        print()
        if ENV_PATH.exists() and (ROOT / ".env.bak").exists():
            print("(Copia anterior guardada en .env.bak)")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Configuración inicial Valhalla SOC (.env)")
    parser.add_argument("--force", action="store_true", help="Regenerar aunque .env exista")
    parser.add_argument("--yes", "-y", action="store_true", help="Sin preguntas (admin = Valhalla2026!)")
    parser.add_argument("--admin-password", dest="admin_password", help="Contraseña admin (no interactivo)")
    parser.add_argument("--check", action="store_true", help="Solo comprobar si hace falta setup (exit 1 si sí)")
    parser.add_argument(
        "--fix-integrations",
        action="store_true",
        help="Solo corregir OPENSEARCH/WAZUH placeholders en .env existente",
    )
    parser.add_argument("--quiet", "-q", action="store_true", help="Menos salida")
    args = parser.parse_args()

    if args.check:
        return 1 if env_needs_setup() else 0

    if args.fix_integrations:
        if patch_integration_credentials():
            print("OK: credenciales Wazuh/OpenSearch actualizadas en .env (reinicie backend).")
        else:
            print("No habia placeholders que corregir.")
        return 0

    try:
        return run_setup(
            force=args.force,
            non_interactive=args.yes,
            admin_password=args.admin_password,
            quiet=args.quiet,
        )
    except (ValueError, FileNotFoundError) as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
