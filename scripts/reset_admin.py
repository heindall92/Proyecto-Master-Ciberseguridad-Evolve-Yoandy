import asyncio
import sys
import os

# Add backend to path to import models
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.db import SessionLocal
from app.models import User
from app.auth import get_password_hash
from sqlalchemy import select

async def reset_admin():
    new_pass = "Valhalla2026!"
    if len(sys.argv) > 1:
        new_pass = sys.argv[1]
        
    async with SessionLocal() as db:
        admin = (await db.execute(select(User).where(User.username == "admin"))).scalar_one_or_none()
        if admin:
            admin.password_hash = get_password_hash(new_pass)
            await db.commit()
            print(f"✅ Admin password reset successfully to: {new_pass}")
        else:
            print("❌ Admin user not found.")

if __name__ == "__main__":
    asyncio.run(reset_admin())
