import os
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from app.settings import settings

def _get_aead() -> AESGCM:
    salt = b"valhalla-soc-salt-2026"  # Static salt for reproducible key derivation
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    key = kdf.derive(settings.secret_key.encode("utf-8"))
    return AESGCM(key)

def encrypt_secret(plaintext: str) -> str:
    if not plaintext:
        return ""
    aead = _get_aead()
    nonce = os.urandom(12)
    ciphertext = aead.encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.b64encode(nonce + ciphertext).decode("utf-8")

def decrypt_secret(encrypted: str) -> str:
    if not encrypted:
        return ""
    try:
        data = base64.b64decode(encrypted)
        nonce = data[:12]
        ciphertext = data[12:]
        aead = _get_aead()
        plaintext = aead.decrypt(nonce, ciphertext, None)
        return plaintext.decode("utf-8")
    except Exception:
        return ""
