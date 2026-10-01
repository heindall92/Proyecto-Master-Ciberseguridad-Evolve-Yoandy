import { describe, expect, it } from "vitest";
import { translateAlertDescription } from "./alertTranslations";

describe("traducción de alertas de Wazuh", () => {
  it("traduce descripciones conocidas sin importar mayúsculas ni espacios", () => {
    expect(translateAlertDescription("  sshd: Authentication Failed ", "es")).toBe("SSH: autenticación fallida");
  });

  it("traduce el fragmento conocido y conserva el resto", () => {
    expect(translateAlertDescription("Agent disconnected: web-01", "es")).toBe("Agente desconectado: web-01");
  });

  it("los caracteres especiales de la descripción se tratan como texto, no como regex", () => {
    expect(translateAlertDescription("Host-based anomaly detection (rootcheck) en srv-db", "es"))
      .toBe("Detección de anomalías en host (rootcheck) en srv-db");
  });

  it("en inglés devuelve el original y lo desconocido no se altera", () => {
    expect(translateAlertDescription("Agent started", "en")).toBe("Agent started");
    expect(translateAlertDescription("Regla personalizada 100200", "es")).toBe("Regla personalizada 100200");
  });

  it("tolera descripciones vacías", () => {
    expect(translateAlertDescription(null, "es")).toBe("");
    expect(translateAlertDescription(undefined, "en")).toBe("");
  });
});
