"""Migraciones ligeras de esquema que se aplican al arrancar (columnas añadidas o renombradas)."""
from __future__ import annotations

from sqlalchemy import inspect, text

from app.logger import logger


def _migrate_users_rank_column(sync_conn) -> None:
    """Renombra users.rank → security_rank en BDs creadas antes de la rama Rosa."""
    if "users" not in inspect(sync_conn).get_table_names():
        return
    cols = {c["name"] for c in inspect(sync_conn).get_columns("users")}
    if "rank" in cols and "security_rank" not in cols:
        sync_conn.execute(text("ALTER TABLE users RENAME COLUMN rank TO security_rank"))
        logger.info("Migración DB: users.rank → users.security_rank")


def _migrate_tickets_resolved_at(sync_conn) -> None:
    """Añade tickets.resolved_at (necesario para medir el tiempo de resolución / MTTR)."""
    if "tickets" not in inspect(sync_conn).get_table_names():
        return
    cols = {c["name"] for c in inspect(sync_conn).get_columns("tickets")}
    if "resolved_at" not in cols:
        sync_conn.execute(text("ALTER TABLE tickets ADD COLUMN resolved_at TIMESTAMP WITH TIME ZONE"))
        sync_conn.execute(text("UPDATE tickets SET resolved_at = updated_at WHERE status = 'resolved'"))
        logger.info("Migración DB: tickets.resolved_at")


# Columnas añadidas después de la primera versión (create_all no altera tablas existentes).
_ADDED_COLUMNS: dict[str, dict[str, str]] = {
    "audit_logs": {"status_code": "INTEGER"},
    "users": {"tailscale_login": "VARCHAR(128)"},
    "tickets": {"classification": "VARCHAR(32)"},
    "evidence": {
        "sha256": "VARCHAR(64)",
        "uploaded_by_id": "INTEGER REFERENCES users(id) ON DELETE SET NULL",
        "uploaded_by_username": "VARCHAR(64)",
    },
}


def _migrate_added_columns(sync_conn) -> None:
    insp = inspect(sync_conn)
    tables = set(insp.get_table_names())
    for table, cols in _ADDED_COLUMNS.items():
        if table not in tables:
            continue
        existing = {c["name"] for c in insp.get_columns(table)}
        for col, ddl in cols.items():
            if col not in existing:
                sync_conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))
                logger.info(f"Migración DB: {table}.{col}")
