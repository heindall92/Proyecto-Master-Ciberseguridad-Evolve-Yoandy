// Configuración común de Vitest: desmonta lo que cada prueba haya pintado.
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);
