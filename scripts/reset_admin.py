import asyncio
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.db import SessionLocal
from app.models import User
from app.auth import get_password_hash
from app.security import InputValidator
from sqlalchemy import select


async def reset_admin():
    if len(sys.argv) < 2:
        print("Uso: python scripts/reset_admin.py <nueva_contraseña>")
        sys.exit(1)
    new_pass = sys.argv[1]
    InputValidator.validate_password(new_pass)

    async with SessionLocal() as db:
        admin = (await db.execute(select(User).where(User.username == "admin"))).scalar_one_or_none()
        if admin:
            admin.password_hash = get_password_hash(new_pass)
            await db.commit()
            print("Contraseña de admin actualizada correctamente.")
        else:
            print("Usuario admin no encontrado.")


if __name__ == "__main__":
    asyncio.run(reset_admin())
