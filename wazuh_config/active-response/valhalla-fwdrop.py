#!/var/ossec/framework/python/bin/python3
# ═══════════════════════════════════════════════════════════
# Valhalla SOC — Active Response: valhalla-fwdrop
#
# AR propio porque el firewall-drop nativo de Wazuh solo lee el
# campo "srcip", mientras que Cowrie emite "src_ip". Este script
# acepta AMBOS y aplica/retira un iptables DROP. Compatible con el
# protocolo execd (mensaje JSON por stdin con command add/delete).
# ═══════════════════════════════════════════════════════════
import sys
import json
import ipaddress
import subprocess
from datetime import datetime

LOG = "/var/ossec/logs/active-responses.log"


def log(msg: str) -> None:
    try:
        with open(LOG, "a") as f:
            f.write(f"{datetime.now().strftime('%Y/%m/%d %H:%M:%S')} valhalla-fwdrop: {msg}\n")
    except Exception:
        pass


def run_iptables(action: str, ip: str) -> bool:
    ok = True
    for chain in ("INPUT", "FORWARD"):
        try:
            r = subprocess.run(
                ["iptables", action, chain, "-s", ip, "-j", "DROP"],
                capture_output=True, text=True, timeout=10,
            )
            if r.returncode != 0:
                ok = False
                log(f"iptables {action} {chain} {ip} rc={r.returncode} err={r.stderr.strip()}")
        except Exception as e:
            ok = False
            log(f"iptables {action} {chain} {ip} EXC={e}")
    return ok


def main() -> None:
    raw = sys.stdin.readline()
    if not raw:
        log("Sin entrada en stdin")
        sys.exit(0)
    try:
        msg = json.loads(raw)
    except json.JSONDecodeError:
        log("Entrada no es JSON válido")
        sys.exit(0)

    command = msg.get("command", "")
    params = msg.get("parameters", {}) or {}
    alert = params.get("alert", {}) or {}
    data = alert.get("data", {}) or {}
    ip = data.get("srcip") or data.get("src_ip") or alert.get("srcip")
    if not ip:
        log("No se pudo extraer srcip/src_ip de la alerta")
        sys.exit(0)
    try:
        ipaddress.ip_address(ip)
    except ValueError:
        log(f"IP inválida: {ip}")
        sys.exit(0)

    # add → insertar DROP; delete → retirarlo (timeout del AR)
    action = "-I" if command == "add" else "-D"
    applied = run_iptables(action, ip)
    log(f"{command} {ip} -> {'OK' if applied else 'FALLO'}")
    sys.exit(0)


if __name__ == "__main__":
    main()
