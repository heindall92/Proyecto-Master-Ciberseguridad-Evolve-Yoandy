import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserOut } from "../lib/api";
import auth, { loginOffline, logout, setProfilePic, setToken, setUser } from "./authSlice";
import chat, { addDmUser, clearUnread, incrementUnread, upsertMessage, type ChatMessage } from "./chatSlice";
import dashboard, { patchStats, setStats } from "./dashboardSlice";
import ui, { navigateToIntel, navigateToWorkspace, setLang, setScanlines, setTheme } from "./uiSlice";

const init = <S>(reducer: (s: S | undefined, a: { type: string }) => S) => reducer(undefined, { type: "@@init" });

const USER: UserOut = {
  id: 7, username: "ana", email: "ana@valhalla.test", is_active: true, is_superuser: false,
  role: "analista", security_rank: "L2 Analyst",
};

const msg = (id: string, chatId = "global"): ChatMessage => ({
  id, chatId, userId: 7, username: "ana", rank: "L2", text: `mensaje ${id}`,
  timestamp: "2026-10-01T10:00:00Z", mentions: [],
});

beforeEach(() => localStorage.clear());

describe("authSlice", () => {
  it("el cierre de sesión borra usuario, sesión, foto y los datos locales de Valhalla", () => {
    localStorage.setItem("valhalla_chat_cache", "[]");
    localStorage.setItem("otra-app", "x");
    let s = init(auth);
    s = auth(s, setUser(USER));
    s = auth(s, setToken("session"));
    s = auth(s, setProfilePic("/api/avatars/7.png"));
    s = auth(s, logout());
    expect(s).toMatchObject({ user: null, token: null, profilePic: null, isOffline: false });
    expect(localStorage.getItem("valhalla_chat_cache")).toBeNull();
    expect(localStorage.getItem("otra-app")).toBe("x");
  });

  it("el modo sin conexión no se puede activar sin VITE_ALLOW_OFFLINE_DEMO=true", () => {
    const s = auth(init(auth), loginOffline());
    expect(s.user).toBeNull();
    expect(s.token).toBeNull();
  });

  it("en desarrollo con la demo permitida entra un admin local de tipo UserOut", () => {
    vi.stubEnv("VITE_ALLOW_OFFLINE_DEMO", "true");
    const s = auth(init(auth), loginOffline());
    expect(s).toMatchObject({ isOffline: true, token: "offline-mode-token", loading: false });
    expect(s.user).toMatchObject({ role: "admin", security_rank: "L3 Blue Team" });
  });

  it("el modo sin conexión nunca funciona en un build de producción", () => {
    vi.stubEnv("VITE_ALLOW_OFFLINE_DEMO", "true");
    vi.stubEnv("DEV", false);
    expect(auth(init(auth), loginOffline()).user).toBeNull();
  });
});

describe("chatSlice", () => {
  it("no duplica un mensaje que llega por WebSocket y por el historial", () => {
    let s = init(chat);
    s = chat(s, upsertMessage(msg("1")));
    s = chat(s, upsertMessage(msg("1")));
    s = chat(s, upsertMessage(msg("2", "dm:1-7")));
    expect(s.chatMsgsByChat.global).toHaveLength(1);
    expect(s.chatMsgsByChat["dm:1-7"]).toHaveLength(1);
  });

  it("conserva solo los 200 mensajes más recientes por chat", () => {
    let s = init(chat);
    for (let i = 0; i < 205; i++) s = chat(s, upsertMessage(msg(String(i))));
    expect(s.chatMsgsByChat.global).toHaveLength(200);
    expect(s.chatMsgsByChat.global[0].id).toBe("5");
    expect(s.chatMsgsByChat.global.at(-1)!.id).toBe("204");
  });

  it("cuenta y limpia los no leídos por chat, y no repite conversaciones privadas", () => {
    let s = init(chat);
    s = chat(s, incrementUnread("dm:1-7"));
    s = chat(s, incrementUnread("dm:1-7"));
    expect(s.unreadByChat["dm:1-7"]).toBe(2);
    s = chat(s, clearUnread("dm:1-7"));
    expect(s.unreadByChat["dm:1-7"]).toBe(0);
    s = chat(s, addDmUser(3));
    s = chat(s, addDmUser(3));
    expect(s.dmUserIds).toEqual([3]);
  });
});

describe("dashboardSlice", () => {
  it("una actualización parcial de métricas no borra las demás", () => {
    let s = init(dashboard);
    s = dashboard(s, setStats({ window: "24h", metrics: { alerts: 10, critical: 2 } }));
    s = dashboard(s, patchStats({ metrics: { critical: 3 } }));
    expect(s.stats).toEqual({ window: "24h", metrics: { alerts: 10, critical: 3 } });
  });

  it("acepta una actualización parcial antes de la primera carga", () => {
    const s = dashboard(init(dashboard), patchStats({ metrics: { open_tickets: 1 } }));
    expect(s.stats).toEqual({ metrics: { open_tickets: 1 } });
  });
});

describe("uiSlice", () => {
  it("recuerda tema, idioma y scanlines entre sesiones", () => {
    let s = init(ui);
    s = ui(s, setTheme("light"));
    s = ui(s, setLang("en"));
    s = ui(s, setScanlines(false));
    expect(s).toMatchObject({ theme: "light", lang: "en", scanlines: false });
    expect(localStorage.getItem("valhalla_theme")).toBe("light");
    expect(localStorage.getItem("valhalla_lang")).toBe("en");
    expect(localStorage.getItem("valhalla_scanlines")).toBe("false");
  });

  it("navegar a inteligencia o al workspace cambia la vista con su contexto", () => {
    let s = ui(init(ui), navigateToIntel("203.0.113.9"));
    expect(s).toMatchObject({ view: "threat", intelIp: "203.0.113.9" });
    s = ui(s, navigateToWorkspace({ ticketId: 42 }));
    expect(s).toMatchObject({ view: "workspace", workspaceData: { ticketId: 42 } });
  });
});
