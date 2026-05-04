import asyncio
import sys
import os

if sys.platform == 'win32':
    import asyncio
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

sys.path.append(r"e:\000Yoandy\Proyecto SOC\Valhalla-SOC\backend")

from app.db import engine
from app.models import Base, User, Monitor, Runbook
from app.auth import get_password_hash
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async with AsyncSession(engine) as session:
        # Create admin user
        admin = (await session.execute(select(User).where(User.username == "admin"))).scalar_one_or_none()
        if not admin:
            admin = User(
                username="admin",
                password_hash=get_password_hash("Valhalla2026!"),
                role="admin",
                rank="Commander"
            )
            session.add(admin)
            print("✅ Admin user created.")
        
        await session.commit()

if __name__ == "__main__":
    asyncio.run(init_db())
