"""Tareas en segundo plano con referencia fuerte y apagado ordenado."""
from __future__ import annotations

import asyncio
from typing import Any

# asyncio solo guarda una referencia débil a las tareas: sin esta, una tarea "fire and forget"
# (auditoría, respuesta de la IA en el chat...) podía ser recolectada a medio ejecutar.
# Además, al apagar el backend se cancelan de forma ordenada en lugar de quedar colgadas.
_background_tasks: set[asyncio.Task[Any]] = set()


_background_loops: set[asyncio.Task[Any]] = set()  # bucles sin fin: se cancelan sin esperar


def _spawn(coro, *, loop: bool = False) -> asyncio.Task[Any]:
    task = asyncio.create_task(coro)
    registry = _background_loops if loop else _background_tasks
    registry.add(task)
    task.add_done_callback(registry.discard)
    return task


async def _drain_background_tasks(grace: float = 5.0) -> None:
    """Apagado ordenado: cancela los bucles y da `grace` segundos al resto (p. ej. una
    escritura de auditoría a medias) antes de cancelarlo."""
    for task in list(_background_loops):
        task.cancel()
    pending = list(_background_tasks)
    if pending:
        _, still_running = await asyncio.wait(pending, timeout=grace)
        for task in still_running:
            task.cancel()
    await asyncio.gather(*_background_loops, *pending, return_exceptions=True)
