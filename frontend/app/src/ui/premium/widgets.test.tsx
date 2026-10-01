import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HoldButton, Toaster, toast } from "./widgets";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
});
afterEach(() => vi.useRealTimers());

/** Botón de «mantener pulsado» que protege las acciones destructivas (bloquear IP, regenerar invitación...). */
describe("HoldButton", () => {
  const setup = (props: Partial<Parameters<typeof HoldButton>[0]> = {}) => {
    const onConfirm = vi.fn();
    render(<HoldButton onConfirm={onConfirm} holdMs={900} title="Regenerar invitación" {...props}>Regenerar</HoldButton>);
    return { onConfirm, button: screen.getByRole("button", { name: "Regenerar invitación" }) };
  };

  it("un clic normal no confirma la acción", () => {
    const { onConfirm, button } = setup();
    fireEvent.pointerDown(button);
    act(() => { vi.advanceTimersByTime(300); });
    fireEvent.pointerUp(button);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("mantenerlo el tiempo completo confirma exactamente una vez", () => {
    const { onConfirm, button } = setup();
    fireEvent.pointerDown(button);
    act(() => { vi.advanceTimersByTime(1000); });
    fireEvent.pointerUp(button);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("salir del botón con el puntero cancela la confirmación", () => {
    const { onConfirm, button } = setup();
    fireEvent.pointerDown(button);
    act(() => { vi.advanceTimersByTime(600); });
    fireEvent.pointerLeave(button);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("también funciona con teclado (Enter mantenido) por accesibilidad", () => {
    const { onConfirm, button } = setup();
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.keyDown(button, { key: "Enter", repeat: true }); // la autorrepetición no reinicia la cuenta
    act(() => { vi.advanceTimersByTime(1000); });
    fireEvent.keyUp(button, { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("deshabilitado no hace nada", () => {
    const { onConfirm, button } = setup({ disabled: true });
    fireEvent.pointerDown(button);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("avisos (toast)", () => {
  it("muestra el aviso y lo retira solo; los errores duran más", () => {
    render(<Toaster />);
    act(() => { toast("Runbook guardado.", "ok"); toast("No se pudo bloquear la IP.", "err"); });
    expect(screen.getByText("Runbook guardado.")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(4100); });
    expect(screen.queryByText("Runbook guardado.")).toBeNull();
    expect(screen.getByText("No se pudo bloquear la IP.")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.queryByText("No se pudo bloquear la IP.")).toBeNull();
  });

  it("no acumula más de cuatro avisos a la vez", () => {
    render(<Toaster />);
    act(() => { for (let i = 1; i <= 6; i++) toast(`aviso ${i}`); });
    expect(screen.getByRole("status").children).toHaveLength(4);
    expect(screen.queryByText("aviso 2")).toBeNull();
    expect(screen.getByText("aviso 6")).toBeTruthy();
  });

  it("se puede cerrar a mano", () => {
    render(<Toaster />);
    act(() => { toast("aviso manual"); });
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByText("aviso manual")).toBeNull();
  });
});
