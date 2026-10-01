import { beforeEach, describe, expect, it } from "vitest";
import { APP_DATA_VERSION, clearValhallaClientStorage, ensureFreshClientStorage } from "./clientStorage";

beforeEach(() => localStorage.clear());

describe("almacenamiento local de la consola", () => {
  it("al limpiar solo borra las claves de Valhalla", () => {
    localStorage.setItem("valhalla_theme", "light");
    localStorage.setItem("valhalla.layout", "{}");
    localStorage.setItem("mi_valhalla_widget", "1");
    localStorage.setItem("otra-app", "intacta");
    clearValhallaClientStorage();
    expect(Object.keys(localStorage)).toEqual(["otra-app"]);
  });

  it("con una versión de datos antigua se limpia y se guarda la actual", () => {
    localStorage.setItem("valhalla_app_data_version", "1.0.0-demo");
    localStorage.setItem("valhalla_chat_cache", "[datos de pruebas]");
    ensureFreshClientStorage();
    expect(localStorage.getItem("valhalla_chat_cache")).toBeNull();
    expect(localStorage.getItem("valhalla_app_data_version")).toBe(APP_DATA_VERSION);
  });

  it("con la versión actual no toca nada", () => {
    localStorage.setItem("valhalla_app_data_version", APP_DATA_VERSION);
    localStorage.setItem("valhalla_theme", "light");
    ensureFreshClientStorage();
    expect(localStorage.getItem("valhalla_theme")).toBe("light");
  });
});
