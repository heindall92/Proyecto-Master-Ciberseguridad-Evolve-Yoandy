"""
Cowrie verification helper for Valhalla SOC.

Ejecuta un pequeno conjunto de probes contra el honeypot LOCAL (127.0.0.1:2222)
usando las credenciales senuelo declaradas en honeypot/cowrie/userdb.txt.

Esto NO es una herramienta ofensiva: Cowrie es un honeypot que acepta cualquier
intento como parte de su diseno. Este script solo comprueba que la shell falsa
responde y que los eventos JSON se generan correctamente (TC-07 + TC-09 de
scripts/verify.ps1).

Uso directo:
    python scripts/_attack.py
"""
from __future__ import annotations

import sys
import time
from pathlib import Path


TARGET_HOST = "127.0.0.1"
TARGET_PORT = 2222
PROBE_LIMIT = 5
PROBE_COMMAND = "uname -a; id; ls /"


def load_pairs(userdb_path: Path, limit: int = PROBE_LIMIT) -> list[tuple[str, str]]:
    """Lee honeypot/cowrie/userdb.txt y devuelve los primeros `limit` pares user:pass."""
    pairs: list[tuple[str, str]] = []
    for raw_line in userdb_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(":")
        if len(parts) < 3:
            continue
        user, _, secret = parts[0], parts[1], parts[2]
        if not user or not secret:
            continue
        if user == "*" or secret == "*":
            continue
        if secret.startswith("!"):
            continue
        pairs.append((user, secret))
        if len(pairs) >= limit:
            break
    return pairs


def probe(user: str, secret: str) -> str:
    """Un unico probe contra el honeypot local. Devuelve la salida de la shell falsa.

    Usa invoke_shell() en vez de exec_command: paramiko 4.0.0 cambio el
    comportamiento del canal tras exec y Cowrie lo cierra antes de que el
    cliente lea la salida ("Channel closed"). invoke_shell funciona igual en
    3.x y 4.x, y ademas es mas realista (un bot SSH entra a la shell, no
    lanza exec remoto).
    """
    import paramiko

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        TARGET_HOST,
        port=TARGET_PORT,
        username=user,
        password=secret,
        timeout=10,
        banner_timeout=10,
        auth_timeout=10,
        allow_agent=False,
        look_for_keys=False,
    )
    try:
        chan = client.invoke_shell()
        chan.settimeout(5)
        # Drenar banner / MOTD de la shell falsa
        time.sleep(0.8)
        try:
            while chan.recv_ready():
                chan.recv(4096)
        except Exception:
            pass
        # Mandar los comandos de probe y leer la respuesta fake de Cowrie
        chan.send(PROBE_COMMAND + "\n")
        time.sleep(1.2)
        data = b""
        deadline = time.time() + 3.0
        while time.time() < deadline:
            try:
                if chan.recv_ready():
                    data += chan.recv(4096)
                else:
                    time.sleep(0.2)
            except Exception:
                break
        return data.decode("utf-8", "ignore").replace("\r", " ").replace("\n", " ")[:250]
    finally:
        client.close()


def main() -> int:
    try:
        import paramiko  # noqa: F401  (comprobacion temprana)
    except ImportError:
        print("NO_PARAMIKO")
        return 0

    here = Path(__file__).resolve().parent
    userdb = here.parent / "cowrie" / "userdb.txt"
    if not userdb.exists():
        print(f"NO_USERDB: {userdb}")
        return 0

    pairs = load_pairs(userdb)
    if not pairs:
        print("NO_PAIRS")
        return 0

    ok = 0
    for user, secret in pairs:
        try:
            output = probe(user, secret)
            print(f"[OK] {user}:{secret} -> {output}")
            ok += 1
        except Exception as exc:
            print(f"[FAIL] {user}:{secret} -> {exc}")
        time.sleep(1)

    print(f"TOTAL_OK={ok}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
