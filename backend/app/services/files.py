"""Ficheros subidos: extensiones permitidas, nombres seguros y huellas SHA-256."""
from __future__ import annotations

import hashlib
import os
import re as _re

ALLOWED_AVATAR_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def _safe_evidence_filename(raw: str) -> str:
    base = os.path.basename(raw or "file")
    base = _re.sub(r"[^\w.\-]", "_", base)
    return base[:200] or "evidence.bin"


ALLOWED_EVIDENCE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".pdf", ".txt", ".log", ".json", ".csv", ".pcap", ".zip"}


def _sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()
