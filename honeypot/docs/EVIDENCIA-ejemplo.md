# 🔬 Valhalla SOC — Honeypot — Evidencia de verificación (EJEMPLO)

> ⚠️ **Este es un fichero de ejemplo** para que veas el aspecto que tendrá tu informe real cuando ejecutes `scripts/verify.ps1` o `scripts/verify.sh`. Los datos son sintéticos. Tu informe real se guarda como `EVIDENCIA-YYYYMMDD-HHMMSS.md` y contendrá las salidas capturadas de tu máquina.

**Generado:** 2026-04-19 21:05:33
**Máquina:** SANTI-LAPTOP
**Usuario:** santi
**Carpeta:** `C:\Users\santi\Documents\Valhalla-SOC\honeypot`

---

## TC-00 · Entorno

```
docker --version
Docker version 27.3.1, build ce12230

docker compose version
Docker Compose version v2.29.7-desktop.1
```

## TC-01 · Imagen Docker disponible

```
docker pull cowrie/cowrie:latest
latest: Pulling from cowrie/cowrie
Digest: sha256:9f2b8a1c7d3e4f5b6a7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a
Status: Image is up to date for cowrie/cowrie:latest
docker.io/cowrie/cowrie:latest
```

## TC-02 · Stack arranca sin errores

```
docker compose up -d
 Network valhalla-net            Created
 Volume "valhalla_cowrie_logs"   Created
 Volume "valhalla_cowrie_downloads"  Created
 Volume "valhalla_cowrie_tty"    Created
 Container valhalla-cowrie       Started
```

## TC-03 · Healthcheck

```
State.Status       : running
State.Health.Status: healthy
```

## TC-04 · Puerto SSH (2222) escucha

```
Test-NetConnection localhost -Port 2222  →  True
```

## TC-05 · Puerto Telnet (2223) escucha

```
Test-NetConnection localhost -Port 2223  →  True
```

## TC-06 · Banner SSH engañoso

```
Banner recibido: SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.6
```

## TC-07 + TC-09 · Login aceptado + comandos en shell falsa

```
[OK] root:123456 -> Linux production-server 5.15.0-91-generic #101-Ubuntu SMP Tue Nov 14 13:30:08 UTC 2023 x86_64 x86_64 x86_64 GNU/Linux
uid=0(root) gid=0(root) groups=0(root)
bin   etc   lib     media  proc  sbin  sys  usr
boot  home  lib64   mnt    root  srv   tmp  var
root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
[OK] admin:admin -> Linux production-server 5.15.0-91-generic ...
[OK] pi:raspberry -> Linux production-server 5.15.0-91-generic ...
[OK] root:toor -> Linux production-server 5.15.0-91-generic ...
[OK] ubuntu:ubuntu -> Linux production-server 5.15.0-91-generic ...
```

## TC-10 + TC-11 · Eventos JSON

Total de eventos registrados: **37**

Últimas 20 líneas:

```json
{"eventid":"cowrie.session.connect","src_ip":"172.18.0.1","src_port":54312,"dst_ip":"172.18.0.2","dst_port":2222,"session":"a1b2c3d4","protocol":"ssh","timestamp":"2026-04-19T21:05:15.112Z","message":"New connection: 172.18.0.1:54312 (172.18.0.2:2222) [session: a1b2c3d4]"}
{"eventid":"cowrie.client.version","version":"SSH-2.0-paramiko_3.5.0","session":"a1b2c3d4","src_ip":"172.18.0.1","timestamp":"2026-04-19T21:05:15.218Z","message":"Remote SSH version: SSH-2.0-paramiko_3.5.0"}
{"eventid":"cowrie.login.success","username":"root","password":"123456","src_ip":"172.18.0.1","session":"a1b2c3d4","timestamp":"2026-04-19T21:05:15.445Z","message":"login attempt [root/123456] succeeded"}
{"eventid":"cowrie.command.input","input":"uname -a","src_ip":"172.18.0.1","session":"a1b2c3d4","timestamp":"2026-04-19T21:05:15.672Z","message":"CMD: uname -a"}
{"eventid":"cowrie.command.input","input":"id","src_ip":"172.18.0.1","session":"a1b2c3d4","timestamp":"2026-04-19T21:05:15.891Z","message":"CMD: id"}
{"eventid":"cowrie.command.input","input":"ls /","src_ip":"172.18.0.1","session":"a1b2c3d4","timestamp":"2026-04-19T21:05:16.104Z","message":"CMD: ls /"}
{"eventid":"cowrie.command.input","input":"cat /etc/passwd | head -3","src_ip":"172.18.0.1","session":"a1b2c3d4","timestamp":"2026-04-19T21:05:16.317Z","message":"CMD: cat /etc/passwd | head -3"}
{"eventid":"cowrie.session.closed","duration":1.32,"session":"a1b2c3d4","src_ip":"172.18.0.1","timestamp":"2026-04-19T21:05:16.445Z","message":"Connection lost after 1.32 seconds"}
{"eventid":"cowrie.session.connect","src_ip":"172.18.0.1","src_port":54318,"session":"b2c3d4e5","protocol":"ssh","timestamp":"2026-04-19T21:05:17.552Z"}
{"eventid":"cowrie.login.success","username":"admin","password":"admin","src_ip":"172.18.0.1","session":"b2c3d4e5","timestamp":"2026-04-19T21:05:17.889Z"}
{"eventid":"cowrie.command.input","input":"uname -a","src_ip":"172.18.0.1","session":"b2c3d4e5","timestamp":"2026-04-19T21:05:18.102Z"}
{"eventid":"cowrie.session.closed","duration":1.18,"session":"b2c3d4e5","src_ip":"172.18.0.1","timestamp":"2026-04-19T21:05:18.773Z"}
```

Tipos de eventos detectados: `cowrie.session.connect`, `cowrie.client.version`, `cowrie.login.success`, `cowrie.command.input`, `cowrie.session.closed`

## TC-13 · Persistencia tras restart

```
Eventos antes del restart: 37
Eventos después:            37
```

## TC-14 · Volúmenes nombrados

```
valhalla_cowrie_downloads
valhalla_cowrie_logs
valhalla_cowrie_tty
```

## TC-15 · Bind-mount local refleja los logs

```
Contenido de logs/:
  cowrie.json  (12847 bytes)
  cowrie.log   (8129 bytes)
  .gitkeep     (0 bytes)
```

---

## 📊 Resumen

| Test | Estado |
|---|---|
| TC-00 | ✅ **OK** |
| TC-01 | ✅ **OK** |
| TC-02 | ✅ **OK** |
| TC-03 | ✅ **OK** |
| TC-PORT-2222 | ✅ **OK** |
| TC-PORT-2223 | ✅ **OK** |
| TC-06 | ✅ **OK** |
| TC-07 | ✅ **OK** |
| TC-09 | ✅ **OK** |
| TC-10 | ✅ **OK** |
| TC-11 | ✅ **OK** |
| TC-13 | ✅ **OK** |
| TC-14 | ✅ **OK** |
| TC-15 | ✅ **OK** |

**Total: 14 / 14 tests OK**

### ✅ Veredicto: APTO para integración con el backend FastAPI.

---

_Informe generado por `scripts/verify.ps1` el 2026-04-19 21:05:33_
