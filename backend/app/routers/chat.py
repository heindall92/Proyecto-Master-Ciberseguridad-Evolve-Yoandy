"""Endpoints del chat: historial, mensajes y vaciado por usuario."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.models import ChatClear, ChatMessage, User
from app.realtime import _dm_members, _require_chat_access, manager
from app.schemas import ChatMessageIn, ChatMessageOut
from app.services.chat_ai import _AI_CHAT_TRIGGER, _ai_chat_reply, _chat_rate_ok
from app.services.tasks import _spawn

router = APIRouter()


# CHAT PERSISTENCE
@router.get("/api/chat/{chat_id}", response_model=list[ChatMessageOut])
async def get_chat_history(chat_id: str, limit: int = Query(100, ge=1, le=200), db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    _require_chat_access(current, chat_id)
    q = select(ChatMessage).where(ChatMessage.chat_id == chat_id)
    cleared = (await db.execute(select(ChatClear.cleared_at).where(ChatClear.user_id == current.id, ChatClear.chat_id == chat_id))).scalar_one_or_none()
    if cleared:
        q = q.where(ChatMessage.timestamp > cleared)
    rows = (await db.execute(q.order_by(desc(ChatMessage.timestamp)).limit(limit))).scalars().all()
    # Return in chronological order
    return sorted(rows, key=lambda x: x.timestamp)


@router.post("/api/chat/{chat_id}/clear")
async def clear_chat_history(chat_id: str, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    """Vacía el chat para el usuario actual en todos sus dispositivos.

    Antes solo se vaciaba la pantalla y los mensajes volvían al recargar. No se borran de la
    base de datos: el resto de participantes conserva su historial.
    """
    _require_chat_access(current, chat_id)
    now = datetime.now(timezone.utc)
    row = (await db.execute(select(ChatClear).where(ChatClear.user_id == current.id, ChatClear.chat_id == chat_id))).scalar_one_or_none()
    if row:
        row.cleared_at = now
    else:
        db.add(ChatClear(user_id=current.id, chat_id=chat_id, cleared_at=now))
    await db.commit()
    return {"ok": True, "cleared_at": now.isoformat()}


@router.post("/api/chat", response_model=ChatMessageOut)
async def save_chat_message(msg: ChatMessageIn, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    chat_id = msg.chat_id
    if not _chat_rate_ok(current.id):
        raise HTTPException(429, "Demasiados mensajes seguidos; espera unos segundos")
    _require_chat_access(current, chat_id)
    members = _dm_members(chat_id)
    if members:
        partner = members[0] if members[1] == current.id else members[1]
        if not (await db.execute(select(User.id).where(User.id == partner))).scalar_one_or_none():
            raise HTTPException(404, "El destinatario no existe")
    msg_id = msg.id or uuid.uuid4().hex
    if (await db.execute(select(ChatMessage.id).where(ChatMessage.id == msg_id))).scalar_one_or_none():
        raise HTTPException(409, "Ya existe un mensaje con ese id")
    new_msg = ChatMessage(
        id=msg_id,
        user_id=current.id,
        username=current.username,
        text=msg.text,
        chat_id=chat_id,
        mentions=msg.mentions,
        attachment=msg.attachment.model_dump() if msg.attachment else None,
    )
    db.add(new_msg)
    await db.commit()
    await db.refresh(new_msg)
    
    # Solo a quien puede ver el chat (antes: a todas las conexiones)
    broadcast_data = ChatMessageOut.model_validate(new_msg).model_dump(by_alias=True, mode="json")
    await manager.send_chat(chat_id, broadcast_data)

    # Chatbot IA: si mencionan al asistente, responde en background.
    if _AI_CHAT_TRIGGER.search(msg.text or ""):
        _spawn(_ai_chat_reply(chat_id, current.id, msg.text or ""))

    return new_msg
