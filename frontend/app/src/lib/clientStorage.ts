/** Versión de datos locales; al cambiar, se limpia estado de pruebas en el navegador. */
export const APP_DATA_VERSION = "2.0.0-delivery";

const PREFIXES = ["valhalla.", "valhalla_"];

export function clearValhallaClientStorage(): void {
  if (typeof localStorage === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (PREFIXES.some((p) => key.startsWith(p)) || key.includes("valhalla")) {
      keys.push(key);
    }
  }
  keys.forEach((k) => localStorage.removeItem(k));
}

export function ensureFreshClientStorage(): void {
  if (typeof localStorage === "undefined") return;
  const current = localStorage.getItem("valhalla_app_data_version");
  if (current === APP_DATA_VERSION) return;
  clearValhallaClientStorage();
  localStorage.setItem("valhalla_app_data_version", APP_DATA_VERSION);
}
