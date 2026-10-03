// Fuente: docs/REQUISITOS.md y docs/TRAZABILIDAD.md (62/62 pruebas superadas el 01/10/2026).
export type Req = {id: string; nombre: string; pruebas: number; manual?: string};

export const REQUISITOS: Req[] = [
  {id: "RF-01", nombre: "Autenticación de usuarios", pruebas: 7},
  {id: "RF-02", nombre: "Control de acceso por roles", pruebas: 9},
  {id: "RF-03", nombre: "Gestión de usuarios", pruebas: 4},
  {id: "RF-04", nombre: "Invitaciones de un solo uso", pruebas: 6},
  {id: "RF-05", nombre: "Ingesta de alertas de Wazuh", pruebas: 2},
  {id: "RF-06", nombre: "Gestión de incidentes", pruebas: 2},
  {id: "RF-07", nombre: "Runbooks de respuesta", pruebas: 4},
  {id: "RF-08", nombre: "Chat de equipo", pruebas: 6},
  {id: "RF-09", nombre: "Presencia y sesiones", pruebas: 2},
  {id: "RF-10", nombre: "Informes con integridad", pruebas: 3},
  {id: "RF-11", nombre: "Threat hunting", pruebas: 1},
  {id: "RF-12", nombre: "Inteligencia de vulnerabilidades", pruebas: 1},
  {id: "RF-13", nombre: "Bloqueo de IPs", pruebas: 3},
  {id: "RF-14", nombre: "Métricas del SOC", pruebas: 3},
  {id: "RF-15", nombre: "Asistente de IA local", pruebas: 0, manual: "@ia en el chat"},
  {id: "RF-16", nombre: "Acceso remoto por VPN", pruebas: 4, manual: "acceso desde el móvil"},
  {id: "RNF-01", nombre: "Protección CSRF y de sesión", pruebas: 5},
  {id: "RNF-02", nombre: "IP real no falsificable", pruebas: 3},
  {id: "RNF-03", nombre: "Validación de entradas", pruebas: 8},
  {id: "RNF-04", nombre: "Auditoría", pruebas: 3},
  {id: "RNF-05", nombre: "Datos reales", pruebas: 3, manual: "revisión de paneles"},
  {id: "RNF-06", nombre: "Privacidad", pruebas: 3},
  {id: "RNF-07", nombre: "Instalación reproducible", pruebas: 2, manual: "instalación desde cero"},
  {id: "RNF-08", nombre: "Diseño adaptable", pruebas: 0, manual: "capturas 390/1280/1700 px"},
  {id: "RNF-09", nombre: "Rendimiento de la API", pruebas: 0, manual: "curl: 0,005–0,058 s"},
];

export const nombreReq = (id: string) => REQUISITOS.find((r) => r.id === id)?.nombre ?? id;
