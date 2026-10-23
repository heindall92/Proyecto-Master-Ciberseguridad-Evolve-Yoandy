"""Tiempo real: WebSocket del chat, presencia de usuarios y avisos de sesión a los administradores."""
from __future__ import annotations

import json
import re as _re
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app import tailscale as ts
from app.auth import get_current_user, get_user_from_token, validate_access_token
from app.client_info import device_of, network_of, real_ip
from app.db import SessionLocal
from app.logger import logger
from app.models import AuditLog, User
from app.settings import settings

router = APIRouter()


_DM_RE = _re.compile(r"^dm:(\d{1,10})-(\d{1,10})$")


def _dm_members(chat_id: str) -> tuple[int, int] | None:
    """Participantes de un chat privado `dm:<menor>-<mayor>`; None si el id no es válido."""
    m = _DM_RE.match(chat_id or "")
    if not m:
        return None
    a, b = int(m.group(1)), int(m.group(2))
    return (a, b) if a < b else None


def _can_access_chat(user: User, chat_id: str) -> bool:
    """global: cualquier usuario autenticado. DM: solo sus dos participantes.

    Antes un admin podía leer cualquier conversación privada y se aceptaban ids como
    `dm:1-2-3`; la privacidad de los mensajes directos es ahora estricta (RGPD).
    """
    if chat_id == "global":
        return True
    members = _dm_members(chat_id)
    return bool(members and user.id in members)


def _require_chat_access(user: User, chat_id: str) -> None:
    if not _can_access_chat(user, chat_id):
        raise HTTPException(403, "No tienes permiso para acceder a este chat")


class ConnectionManager:
    """Conexiones WebSocket por usuario.

    Antes todas las conexiones recibían todos los mensajes, incluidos los privados de
    otros usuarios (el filtrado lo hacía el navegador). Ahora el servidor decide quién
    recibe cada evento y mantiene la presencia (usuarios conectados y su rol).
    """

    def __init__(self):
        self.active_connections: dict[WebSocket, dict[str, Any]] = {}

    async def connect(self, websocket: WebSocket, user: User):
        await websocket.accept()
        ip = real_ip(websocket.client.host if websocket.client else None, websocket.headers)
        ts_id = await ts.whois(ip)
        self.active_connections[websocket] = {
            "id": user.id, "username": user.username, "role": user.role,
            "ip": ip, "network": network_of(ip), "device": device_of(websocket.headers.get("user-agent", "")),
            "since": datetime.now(timezone.utc).isoformat(),
            "ts": ts_id, "mismatch": _ts_mismatch(user, ts_id),
        }
        await self.broadcast_presence()

    async def disconnect(self, websocket: WebSocket):
        if self.active_connections.pop(websocket, None) is not None:
            await self.broadcast_presence()

    def online(self, with_ip_for: "User | None" = None) -> list[dict[str, Any]]:
        """Usuarios conectados con sus sesiones (dispositivo, red, desde cuándo).

        La IP solo se incluye para el administrador y para las sesiones del propio usuario.
        """
        seen: dict[int, dict[str, Any]] = {}
        for info in self.active_connections.values():
            u = seen.setdefault(info["id"], {"id": info["id"], "username": info["username"], "role": info["role"], "sessions": 0, "detail": []})
            u["sessions"] += 1
            show_ip = with_ip_for is not None and (with_ip_for.role == "admin" or with_ip_for.id == info["id"])
            u["detail"].append({"device": info["device"], "network": info["network"], "since": info["since"],
                                **({"ip": info["ip"], "ts": info.get("ts"), "mismatch": info.get("mismatch", False)} if show_ip else {})})
        return sorted(seen.values(), key=lambda u: u["username"].lower())

    async def _send(self, message: Any, allowed=lambda info: True):
        if not isinstance(message, str):
            message = json.dumps(message)
        for ws, info in list(self.active_connections.items()):
            if not allowed(info):
                continue
            try:
                await ws.send_text(message)
            except Exception:
                self.active_connections.pop(ws, None)

    async def broadcast(self, message: Any):
        """Eventos para todos los usuarios autenticados (alertas del SIEM, chat global)."""
        await self._send(message)

    async def send_chat(self, chat_id: str, message: Any):
        """Evento de un chat: global a todos; DM solo a sus dos participantes."""
        if chat_id == "global":
            await self._send(message)
            return
        members = _dm_members(chat_id)
        if members:
            await self._send(message, lambda info: info["id"] in members)

    async def send_admins(self, message: Any):
        await self._send(message, lambda info: info["role"] == "admin")

    async def broadcast_presence(self):
        await self._send({"type": "PRESENCE", "users": self.online()})


manager = ConnectionManager()


def _ts_mismatch(user: User, ts_id: dict | None) -> bool:
    """Entra por la VPN con una cuenta de Tailscale distinta de la vinculada a su usuario."""
    return bool(ts_id and ts_id.get("login") and user.tailscale_login
                and ts_id["login"].lower() != user.tailscale_login.lower())


async def _session_event(kind: str, user: User, ip: str, ua: str, db: AsyncSession) -> None:
    """Aviso en directo a los administradores: quién acaba de entrar, desde dónde y con qué cuenta de VPN.

    Primer acceso por VPN sin cuenta vinculada: se vincula (confianza en el primer uso).
    Si la cuenta de Tailscale no coincide con la vinculada, se audita y se marca como alerta.
    """
    try:
        ts_id = await ts.whois(ip)
        mismatch = _ts_mismatch(user, ts_id)
        if ts_id and ts_id.get("login") and not user.tailscale_login:
            user.tailscale_login = ts_id["login"][:128]
            await db.commit()
        if mismatch:
            logger.warning("Sesión de %s desde la cuenta de Tailscale %s (vinculada: %s)", user.username, ts_id.get("login"), user.tailscale_login)
            db.add(AuditLog(user_id=user.id, username=user.username, action="TS_MISMATCH", route=f"/api/auth/{kind}",
                            ip_address=ip or None, status_code=None))
            await db.commit()
        await manager.send_admins({
            "type": "SESSION_EVENT", "kind": kind, "username": user.username, "role": user.role,
            "device": device_of(ua), "network": network_of(ip), "ip": ip, "ts": ts_id,
            "mismatch": mismatch, "expected": user.tailscale_login if mismatch else None,
            "at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:  # noqa: BLE001 - el aviso nunca debe romper el login
        logger.error("Aviso de sesión fallido para %s: %s", user.username, e)


def _ws_origin_allowed(websocket: WebSocket) -> bool:
    """Evita el secuestro del WebSocket desde otra web (CSWSH): la cookie de sesión viaja sola.

    Sin cabecera Origin (clientes no navegador con Bearer) se permite; si la hay, debe
    estar en CORS_ORIGINS o coincidir con el Host de la petición.
    """
    origin = websocket.headers.get("origin")
    if not origin:
        return True
    host = websocket.headers.get("host", "")
    return origin in settings.cors_origins_list() or origin.split("://", 1)[-1] == host


@router.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):
    if not _ws_origin_allowed(websocket):
        logger.warning("WebSocket rechazado por origen: %s", websocket.headers.get("origin"))
        await websocket.close(code=1008)
        return
    token = websocket.cookies.get("access_token")
    if not token:
        auth_header = websocket.headers.get("authorization", "")
        if auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1].strip()
    async with SessionLocal() as db:
        try:
            await validate_access_token(token or "", db)
        except HTTPException:
            await websocket.close(code=1008)
            return
        user = await get_user_from_token(token, db)
        if not user:
            await websocket.close(code=1008)
            return
    await manager.connect(websocket, user)
    try:
        while True:
            await websocket.receive_text()  # Keep alive
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(websocket)


@router.get("/api/presence")
async def presence(current: User = Depends(get_current_user)):
    """Usuarios conectados ahora mismo: quién, desde qué dispositivo y por qué red (IP solo admin / propio)."""
    return manager.online(with_ip_for=current)
