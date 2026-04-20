# Wazuh Active Response — Bloqueo de IPs via Lista CDB `blocked-ips`

**Fecha:** 2026-04-19  
**Propósito:** Hacer que el botón "BLOQUEAR IP" del dashboard Valhalla ejecute un bloqueo real en el host.

---

## Cómo funciona el flujo actual

1. El dashboard llama a `POST /api/cowrie/block` con la IP.
2. El backend añade la IP a la lista CDB `blocked-ips` en Wazuh via API REST.
3. **Sin la regla de Active Response configurada, el bloqueo no ocurre en el host.**

Para que el bloqueo sea efectivo necesitas los pasos siguientes.

---

## Paso 1 — Crear/verificar la lista CDB en el manager

La lista se crea automáticamente cuando el dashboard bloquea por primera vez.  
Para crearla manualmente:

```bash
# En el Wazuh Manager
touch /var/ossec/etc/lists/blocked-ips
chown root:wazuh /var/ossec/etc/lists/blocked-ips
# Formato: una IP por línea con el valor "drop"
# Ejemplo:
echo "185.220.101.47:drop" >> /var/ossec/etc/lists/blocked-ips
/var/ossec/bin/wazuh-logtest  # verificar que se recarga
```

---

## Paso 2 — Referenciar la lista en ossec.conf

Añadir en `/var/ossec/etc/ossec.conf` dentro del bloque `<ruleset>`:

```xml
<ruleset>
  <!-- ...reglas existentes... -->
  <list>etc/lists/blocked-ips</list>
</ruleset>
```

Reiniciar: `systemctl restart wazuh-manager`

---

## Paso 3 — Crear la regla que dispara el Active Response

Crear `/var/ossec/etc/rules/local_rules.xml` (o añadir al existente):

```xml
<!-- Regla 100500: dispara cuando la IP origen está en la lista CDB blocked-ips -->
<group name="local,syslog,valhalla_block">
  <rule id="100500" level="10">
    <if_group>syslog</if_group>
    <list field="srcip" lookup="match_key">etc/lists/blocked-ips</list>
    <description>IP bloqueada manualmente via Valhalla SOC Dashboard</description>
    <group>valhalla_blocked,pci_dss_10.6.1,gdpr_IV_35.7.d</group>
  </rule>
</group>
```

---

## Paso 4 — Configurar el script de Active Response

Wazuh incluye `firewall-drop` por defecto. Activarlo en `ossec.conf`:

```xml
<active-response>
  <command>firewall-drop</command>
  <location>local</location>
  <rules_id>100500</rules_id>
  <timeout>3600</timeout>   <!-- desbloquear después de 1h, 0 = permanente -->
</active-response>
```

El comando `firewall-drop` añade una regla `iptables` (Linux) o `netsh` (Windows):
- Linux: `iptables -I INPUT -s <IP> -j DROP`
- Timeout: elimina la regla después del tiempo configurado.

---

## Paso 5 — Verificar que funciona

```bash
# Añadir una IP de prueba a la lista
echo "1.2.3.4:drop" >> /var/ossec/etc/lists/blocked-ips

# Forzar recarga de listas
/var/ossec/bin/wazuh-control reload

# Buscar en logs si el AR se ejecutó
tail -f /var/ossec/logs/active-responses.log

# Verificar en iptables (en el agente/manager según location)
iptables -L INPUT | grep 1.2.3.4
```

---

## Alternativa: Bloqueo via iptables directo en el manager (sin AR)

Si el manager también actúa como sensor perimetral:

```bash
# Script wrapper para llamar desde el backend
#!/bin/bash
IP=$1
if [[ "$IP" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
  iptables -I INPUT -s "$IP" -j DROP
  iptables -I FORWARD -s "$IP" -j DROP
  echo "$(date) BLOCKED $IP" >> /var/log/valhalla-blocks.log
fi
```

---

## Estado en Valhalla Dashboard

- **`POST /api/cowrie/block`** → añade a CDB lista `blocked-ips` vía API Wazuh ✓
- **Active Response en host** → requiere configuración manual en `ossec.conf` (este doc)
- El dashboard muestra el resultado de la llamada CDB; si la AR no está configurada, muestra aviso al operador.

---

*Referencia: [Wazuh Active Response docs](https://documentation.wazuh.com/current/user-manual/capabilities/active-response/)*
