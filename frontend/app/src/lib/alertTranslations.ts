/** Traducciones de descripciones Wazuh frecuentes (inglés → español). */
const ALERT_ES: Record<string, string> = {
  "wazuh server started": "Servidor Wazuh iniciado",
  "wazuh server stopped": "Servidor Wazuh detenido",
  "wazuh server restarted": "Servidor Wazuh reiniciado",
  "host-based anomaly detection (rootcheck)": "Detección de anomalías en host (rootcheck)",
  "agent started": "Agente iniciado",
  "agent stopped": "Agente detenido",
  "agent disconnected": "Agente desconectado",
  "agent connected": "Agente conectado",
  "sshd: authentication failed": "SSH: autenticación fallida",
  "sshd: brute force trying to get access to the system": "SSH: fuerza bruta intentando acceder al sistema",
  "sshd: insecure connection attempt (scan)": "SSH: intento de conexión insegura (escaneo)",
  "cowrie login attempt": "Cowrie: intento de inicio de sesión",
  "cowrie command input": "Cowrie: comando introducido",
  "cowrie session connect": "Cowrie: sesión conectada",
  "cowrie session closed": "Cowrie: sesión cerrada",
  "web server 400 error code": "Servidor web: error 400",
  "web server 500 error code": "Servidor web: error 500",
  "sql injection attempt": "Intento de inyección SQL",
  "multiple authentication failures": "Múltiples fallos de autenticación",
  "privilege escalation attempt": "Intento de escalada de privilegios",
  "file added to the system": "Archivo añadido al sistema",
  "file deleted": "Archivo eliminado",
  "file modified": "Archivo modificado",
};

export function translateAlertDescription(description: string | null | undefined, lang: "es" | "en"): string {
  if (!description || lang === "en") return description || "";
  const key = description.trim().toLowerCase();
  if (ALERT_ES[key]) return ALERT_ES[key];
  for (const [en, es] of Object.entries(ALERT_ES)) {
    if (key.includes(en)) return description.replace(new RegExp(en, "i"), es);
  }
  return description;
}
