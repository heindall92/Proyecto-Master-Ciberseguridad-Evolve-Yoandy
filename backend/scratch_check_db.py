import asyncio
import sys
import os

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

sys.path.append(os.getcwd())

from app.db import engine
from app.models import User, Ticket
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

async def check():
    async with AsyncSession(engine) as s:
        users = (await s.execute(select(User))).scalars().all()
        tickets = (await s.execute(select(Ticket))).scalars().all()
        print(f"Users: {[u.username for u in users]}")
        print(f"Tickets count: {len(tickets)}")

if __name__ == "__main__":
    asyncio.run(check())
