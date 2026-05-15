import asyncio
from sqlalchemy import select
from app.db import SessionLocal
from app.models import User
from app.auth import get_password_hash

async def fix_admin():
    async with SessionLocal() as db:
        result = await db.execute(select(User).where(User.username == "admin"))
        admin = result.scalar_one_or_none()
        
        if admin:
            # Strong password according to security.py
            plain_pass = "Admin123!"
            admin.password_hash = get_password_hash(plain_pass)
            await db.commit()
            print(f"Admin password updated successfully to: {plain_pass}")
        else:
            print("Admin not found!")

if __name__ == "__main__":
    asyncio.run(fix_admin())
