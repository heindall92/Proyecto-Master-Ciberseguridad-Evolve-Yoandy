import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import logger from "../lib/logger";
import { sanitizePlainText } from "../lib/sanitize";
import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";
import "./HUD.css";
import "./light-theme-overrides.css";
import { getAudioContext, playNotificationSound, playResolvedSound, playChatSound, playMentionSound } from "./audio";

import {
  login,
  getCurrentUser,
  getDashboardSummary,
  getOpenTicketsCount,
  listTickets,
  assignTicket,
  listUsers,
  UserOut,
  getChatHistory,
  postChatMessage,
  getChatWsUrl,
  logout as apiLogout,
} from "../lib/api";

import { useAppDispatch, useAppSelector } from "../store/hooks";
import {
  setUser, setToken, setProfilePic, setLoading, setIsOffline, logout, loginOffline,
} from "../store/authSlice";
import {
  setView, setScheme, setScanlines, setTvMode, setTheme, setLang,
  navigateToIntel, navigateToWorkspace, clearWorkspaceData,
} from "../store/uiSlice";
import {
  setStats, patchStats, setRecentOpenTickets, setLastTicketCount, setNotifSeen,
} from "../store/dashboardSlice";
import {
  setChatOpen, setActiveChatId, upsertMessage, setHistoryForChat, clearChat,
  setTeamUsers, setDmUserIds, addDmUser,
  setUnreadForChat, incrementUnread, clearUnread,
  setChatInput, setMentionFilter, setShowMentionDrop, setPendingAttachment,
  setAiTyping,
  ChatMessage, ChatAttachment,
} from "../store/chatSlice";

import AssetsView from "./AssetsView";
import UsersView from "./UsersView";
import DashboardSuperFinal from "./DashboardSuperFinal";
import { translations } from "./translations";
import AuditLogView from "./AuditLogView";
import SystemSettingsView from "./SystemSettingsView";
import IntegrationsHealthView from "./IntegrationsHealthView";
import MonitorsView from "./MonitorsView";
import SiemView from "./SiemView";
import ThreatIntelView from "./ThreatIntelView";
import CowrieView from "./CowrieView";
import AnalystWorkspace from "./AnalystWorkspace";
import ThreatMapView from "./ThreatMapView";
import RunbooksView from "./RunbooksView";
import LSAMonitorView from "./LSAMonitorView";
import SocMaturityView from "./SocMaturityView";
import HeimdallReportView from "./HeimdallReportView";
import CveIntelView from "./CveIntelView";
import ExecutiveReport from "./ExecutiveReport";
import ProfileView from "./ProfileView";
import CinematicIntro from "./components/CinematicIntro";
import "./premium/premium.css";
import "./premium/accents.css";
import "./premium/light-glass.css";
import "./premium/dark-glass.css";
import CommandPalette, { PaletteCommand } from "./premium/CommandPalette";
import HelpCenter from "./premium/HelpCenter";
import QuickSettings from "./premium/QuickSettings";
import { Toaster } from "./premium/widgets";
import "./premium/dashboard.css";
import {
  Search, MessageSquare, Bell, BellOff, CircleHelp, Palette, Sun, Moon, ChevronDown,
  UserRound, SlidersHorizontal, LayoutGrid, Lock, Unlock, RefreshCw, Play, LogOut,
  AlertTriangle, ShieldAlert, Info, ArrowRight, UserCheck, Minimize2,
  LayoutDashboard, Layers, Monitor, Siren, Radar, Activity, ScrollText, Bug, Globe2,
  KeyRound, BarChart3, FileText, ShieldCheck, BookOpen, Briefcase, FileBarChart, Users,
} from "lucide-react";

const darkTheme = createTheme({ palette: { mode: "dark" } });

// --- Original SVG Symbols Definition ---
function SvgSymbols() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }}>
      <defs>
        <symbol id="i-overview" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></symbol>
        <symbol id="i-siem" viewBox="0 0 24 24"><path d="M12 2 L3 7 L12 12 L21 7 Z"/><path d="M3 12 L12 17 L21 12"/><path d="M3 17 L12 22 L21 17"/></symbol>
        <symbol id="i-workspace" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M9 3v18"/><path d="M15 3v18"/></symbol>
        <symbol id="i-map" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12 H21 M12 3 A15 15 0 0 1 12 21 M12 3 A15 15 0 0 0 12 21"/></symbol>
        <symbol id="i-incident" viewBox="0 0 24 24"><path d="M12 2 L22 20 H2 Z"/><path d="M12 9 V14 M12 17 V17.5"/></symbol>
        <symbol id="i-assets" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="1"/><path d="M8 20 H16 M12 16 V20"/></symbol>
        <symbol id="i-vuln" viewBox="0 0 24 24"><path d="M12 3 L21 8 V16 L12 21 L3 16 V8 Z"/><path d="M12 8 V13 M12 15.5 V16"/></symbol>
        <symbol id="i-threat" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9"/><path d="M12 3 V6 M12 18 V21 M3 12 H6 M18 12 H21"/></symbol>
        <symbol id="i-playbook" viewBox="0 0 24 24"><path d="M4 4 H20 V20 H4 Z"/><path d="M8 9 H16 M8 13 H16 M8 17 H12"/></symbol>
        <symbol id="i-net" viewBox="0 0 24 24"><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M7 6 H17 M6 8 L11 16 M18 8 L13 16"/></symbol>
        <symbol id="i-metrics" viewBox="0 0 24 24"><path d="M3 20 L3 4 M3 20 L21 20"/><rect x="6" y="12" width="3" height="6"/><rect x="11" y="8" width="3" height="10"/><rect x="16" y="5" width="3" height="13"/></symbol>
      </defs>
    </svg>
  );
}

const AlexanaLetter = ({ char, ...props }: any) => {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24", ...props };
  const getLetter = () => {
    switch(char) {
      case 'V': return <><path d="M 5 5 L 12 19 L 19 5"/><circle cx="12" cy="5" r="1.5" stroke="none" fill="currentColor"/></>;
      case 'A': return <><path d="M 12 2 L 20 20"/><path d="M 12 2 L 8 10"/><circle cx="4" cy="20" r="1.5" stroke="none" fill="currentColor"/></>;
      case 'L': return <><path d="M 4 2 L 4 20"/><path d="M 12 20 L 20 20"/><circle cx="8" cy="20" r="1.5" stroke="none" fill="currentColor"/></>;
      case 'H': return <><path d="M 4 2 L 4 22"/><path d="M 4 12 L 20 12 L 20 22"/><circle cx="20" cy="4" r="1.5" stroke="none" fill="currentColor"/></>;
      case 'S': return <><path d="M 20 4 L 10 4 Q 4 4 4 10 Q 4 14 12 14 Q 20 14 20 18 Q 20 22 10 22 L 8 22"/><circle cx="4" cy="22" r="1.5" stroke="none" fill="currentColor"/></>;
      case 'O': return <><path d="M 12 2 A 10 10 0 1 1 2 12"/><circle cx="5" cy="5" r="1.5" stroke="none" fill="currentColor"/></>;
      case 'C': return <><path d="M 20 6 A 10 10 0 0 0 12 2 A 10 10 0 0 0 12 22 A 10 10 0 0 0 20 18"/><circle cx="20" cy="22" r="1.5" stroke="none" fill="currentColor"/></>;
      case 'P': return <><path d="M 4 8 L 4 22"/><path d="M 8 2 L 14 2 A 6 6 0 0 1 14 14 L 4 14"/><circle cx="4" cy="2" r="1.5" stroke="none" fill="currentColor"/></>;
      case 'R': return <><path d="M 4 8 L 4 22"/><path d="M 8 2 L 14 2 A 6 6 0 0 1 14 14 L 4 14"/><path d="M 10 14 L 18 22"/><circle cx="4" cy="2" r="1.5" stroke="none" fill="currentColor"/></>;
      case ' ': return <div style={{ width: '15px' }} />;
      default: return <text x="4" y="18" fill="currentColor" stroke="none" fontSize="20" fontFamily="sans-serif">{char}</text>;
    }
  };
  if (char === ' ') return getLetter();
  return <svg {...common}>{getLetter()}</svg>;
};

const AlexanaWord = ({ word, color = "#fff", height = "40px" }: { word: string, color?: string, height?: string }) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', color }}>
      {word.split('').map((c, i) => (
         <AlexanaLetter key={i} char={c.toUpperCase()} style={{ height, width: height, dropShadow: '0 0 10px rgba(0,255,136,0.3)' }} />
      ))}
    </div>
  );
};

const DM_LIST_KEY = (uid: number) => `valhalla.dm.list.${uid}`;
const makeDmId = (a: number, b: number) => `dm:${Math.min(a,b)}-${Math.max(a,b)}`;

export default function App() {
  const dispatch = useAppDispatch();

  // ── Auth ──
  const user = useAppSelector((s) => s.auth.user);
  const token = useAppSelector((s) => s.auth.token);
  const profilePic = useAppSelector((s) => s.auth.profilePic);
  const loading = useAppSelector((s) => s.auth.loading);
  const isOffline = useAppSelector((s) => s.auth.isOffline);

  // ── UI ──
  const view = useAppSelector((s) => s.ui.view);
  const scheme = useAppSelector((s) => s.ui.scheme);
  const scanlines = useAppSelector((s) => s.ui.scanlines);
  const tvMode = useAppSelector((s) => s.ui.tvMode);
  const theme = useAppSelector((s) => s.ui.theme);
  const lang = useAppSelector((s) => s.ui.lang);
  const intelIp = useAppSelector((s) => s.ui.intelIp);
  const workspaceData = useAppSelector((s) => s.ui.workspaceData);

  // ── Dashboard ──
  const stats = useAppSelector((s) => s.dashboard.stats);
  const recentOpenTickets = useAppSelector((s) => s.dashboard.recentOpenTickets);
  const lastTicketCount = useAppSelector((s) => s.dashboard.lastTicketCount);
  const notifSeen = useAppSelector((s) => s.dashboard.notifSeen);

  // ── Chat ──
  const chatOpen = useAppSelector((s) => s.chat.chatOpen);
  const activeChatId = useAppSelector((s) => s.chat.activeChatId);
  const chatMsgsByChat = useAppSelector((s) => s.chat.chatMsgsByChat);
  const dmUserIds = useAppSelector((s) => s.chat.dmUserIds);
  const teamUsers = useAppSelector((s) => s.chat.teamUsers);
  const unreadByChat = useAppSelector((s) => s.chat.unreadByChat);
  const chatInput = useAppSelector((s) => s.chat.chatInput);
  const mentionFilter = useAppSelector((s) => s.chat.mentionFilter);
  const showMentionDrop = useAppSelector((s) => s.chat.showMentionDrop);
  const pendingAttachment = useAppSelector((s) => s.chat.pendingAttachment);
  const isAiTyping = useAppSelector((s) => s.chat.isAiTyping);

  // ── Local UI state (no necesita store global) ──
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifMenuOpen, setNotifMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [showWidgetCatalog, setShowWidgetCatalog] = useState(false);
  const [showCinematic, setShowCinematic] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('valhalla_sidebar_collapsed') === 'true';
  });

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  const chatOpenRef = useRef(chatOpen);
  const activeChatIdRef = useRef(activeChatId);

  useEffect(() => {
    chatOpenRef.current = chatOpen;
  }, [chatOpen]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
    dispatch(setAiTyping(false));
  }, [activeChatId, dispatch]);

  const totalUnread = Object.values(unreadByChat).reduce((a, b) => a + b, 0);

  useEffect(() => {
    const originalTitle = "Valhalla SOC";
    if (totalUnread > 0) {
      document.title = `(●) ${totalUnread} ${originalTitle}`;
    } else {
      document.title = originalTitle;
    }
    return () => { document.title = originalTitle; };
  }, [totalUnread]);

  const t = (key: keyof typeof translations.es) => (translations[lang] as any)[key] || key;

  const toggleLang = () => {
    dispatch(setLang(lang === "es" ? "en" : "es"));
  };

  const toggleTheme = () => {
    dispatch(setTheme(theme === "dark" ? "light" : "dark"));
  };

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  // Atajos globales: Ctrl/Cmd+K buscador, "?" centro de ayuda, Esc sale del modo TV.
  useEffect(() => {
    if (!user) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (e.key === '?' && !typing) {
        e.preventDefault();
        setHelpOpen(true);
      } else if (e.key === 'Escape' && tvMode) {
        dispatch(setTvMode(false));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [user, tvMode, dispatch]);

  useEffect(() => {
    const ticketsNow = stats?.metrics?.tickets_open || 0;
    if (ticketsNow > lastTicketCount || (lastTicketCount === 0 && ticketsNow > 0)) {
      if (lastTicketCount > 0) playNotificationSound();
      if (!notifSeen) dispatch(setNotifSeen(false));
    }
    dispatch(setLastTicketCount(ticketsNow));
  }, [stats?.metrics?.tickets_open]);

  useEffect(() => {
    const handleNavigateIntel = (e: any) => dispatch(navigateToIntel(e.detail.ip));
    const handleNavigateWorkspace = (e: any) => dispatch(navigateToWorkspace(e.detail));
    const handleNavigateView = (e: Event) => {
      const viewId = (e as CustomEvent<{ view: string }>).detail?.view;
      if (viewId) dispatch(setView(viewId));
    };
    window.addEventListener('navigate-to-intel', handleNavigateIntel);
    window.addEventListener('navigate-to-workspace', handleNavigateWorkspace);
    window.addEventListener('navigate-to-view', handleNavigateView);
    return () => {
      window.removeEventListener('navigate-to-intel', handleNavigateIntel);
      window.removeEventListener('navigate-to-workspace', handleNavigateWorkspace);
      window.removeEventListener('navigate-to-view', handleNavigateView);
    };
  }, []);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await login(fd.get("u") as string, fd.get("p") as string);
      dispatch(setToken("session"));
      const u = await getCurrentUser();
      dispatch(setUser(u));
      dispatch(setProfilePic((u as { avatar_url?: string }).avatar_url || null));
      setUserMenuOpen(false);
      setNotifMenuOpen(false);
      dispatch(setView("overview"));
    } catch (err: any) {
      const devDemoOffline =
        import.meta.env.DEV && import.meta.env.VITE_ALLOW_OFFLINE_DEMO === "true";
      if (
        devDemoOffline &&
        err.message &&
        (err.message.includes("fetch") || err.message.includes("Network"))
      ) {
        alert("DEV: Servidor no alcanzable. Modo offline demo (solo desarrollo).");
        dispatch(loginOffline());
        dispatch(setView("overview"));
      } else {
        alert(err.message?.includes("401") ? "ERROR: Credenciales inválidas." : `ERROR: ${err.message || "Login fallido"}`);
      }
    }
  };

  const handleLogout = () => {
    apiLogout().catch(() => {});
    dispatch(logout());
    dispatch(setProfilePic(null));
    setIsLocked(true);
  };

  useEffect(() => {
    const unlockAudio = () => {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') {
        ctx.resume().then(() => {
          playNotificationSound();
          console.log("Audio unlocked and tested");
        });
      } else {
        playNotificationSound();
      }
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    if (import.meta.env.DEV && token === "offline-mode-token") {
      dispatch(setIsOffline(true));
      dispatch(setLoading(false));
      return;
    }
    getCurrentUser()
      .then(u => {
        if (isMounted) {
          dispatch(setUser(u));
          dispatch(setToken("session"));
          dispatch(setProfilePic((u as { avatar_url?: string }).avatar_url || null));
          dispatch(setLoading(false));
        }
      })
      .catch((err: any) => {
        if (
          import.meta.env.DEV &&
          import.meta.env.VITE_ALLOW_OFFLINE_DEMO === "true" &&
          err.message &&
          (err.message.includes("fetch") || err.message.includes("Network"))
        ) {
          dispatch(setIsOffline(true));
          dispatch(setLoading(false));
          return;
        }
        logger.error("Token invalid, showing login:", err);
        if (isMounted) {
          dispatch(logout());
          dispatch(setLoading(false));
        }
      });
    return () => { isMounted = false; };
  }, [token, dispatch]);

  useEffect(() => {
    document.body.setAttribute("data-scheme", scheme);
    document.body.setAttribute("data-scan", scanlines ? "on" : "off");
  }, [scheme, scanlines]);

  const fetchStats = useCallback(() => {
    getOpenTicketsCount()
      .then((r) => {
        dispatch(patchStats({ metrics: { tickets_open: r.open } }));
      })
      .catch((e) => { logger.error('[Dashboard] Error:', e); });

    listTickets(undefined, undefined, 10, 0, true)
      .then(activeTickets => {
        const oldIds = new Set(recentOpenTickets.map(t => t.id));
        const hasNew = activeTickets.some(t => !oldIds.has(t.id));

        if (hasNew) {
          dispatch(setNotifSeen(false));
          if (recentOpenTickets.length > 0) {
            playNotificationSound();
            const hasCritical = activeTickets.some(t => t.severity === 'critical' && !oldIds.has(t.id));
            if (hasCritical) {
              setTimeout(playNotificationSound, 800);
            }
          }
        }

        dispatch(setRecentOpenTickets(activeTickets));
      })
      .catch((e) => logger.error('[Dashboard] Tickets error:', e));

    getDashboardSummary().then(s => dispatch(setStats(s))).catch((e) => logger.error('[Dashboard] Summary error:', e));
  }, [user, recentOpenTickets, dispatch]);

  useEffect(() => {
    if (user) {
      fetchStats();
      const iv = setInterval(fetchStats, 15000);
      return () => clearInterval(iv);
    }
  }, [user]);

  const handleAssignToMe = async (ticketId: number) => {
    if (!user) return;
    try {
      await assignTicket(ticketId, user.id);
      fetchStats();
      playResolvedSound();
      setNotifMenuOpen(false);
      alert(lang === 'es' ? "Incidente asignado correctamente" : "Incident assigned successfully");
    } catch (err) {
      logger.error("Error assigning ticket", err);
    }
  };

  // Load team users & DM list
  useEffect(() => {
    if (!user) return;
    listUsers().then(u => dispatch(setTeamUsers(u))).catch(() => {});
    try {
      dispatch(setDmUserIds(JSON.parse(localStorage.getItem(DM_LIST_KEY(user.id)) || '[]')));
    } catch {}
  }, [user?.id]);

  // WebSocket connection logic (only on mount / login / logout)
  useEffect(() => {
    if (!user) return;

    const wsUrl = getChatWsUrl();
    let ws: WebSocket;
    let reconnectDelay = 1000;
    let disposed = false;
    let pingInterval: ReturnType<typeof setInterval>;

    const connect = () => {
      if (disposed) return;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        reconnectDelay = 1000;
      };

      ws.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload?.type === "NEW_ALERT") {
            const sev = payload.data?.severity || "medium";
            if (sev === "critical" || sev === "high") {
              playNotificationSound();
            }
            dispatch(setNotifSeen(false));
            return;
          }
          if (payload?.type === "AI_TYPING") {
            if (!payload.chatId || payload.chatId === activeChatIdRef.current) {
              dispatch(setAiTyping(Boolean(payload.isTyping)));
            }
            return;
          }

          const msg: ChatMessage = payload;
          dispatch(upsertMessage(msg));
          if (msg.username?.toLowerCase() === "valhalla-ia") {
            dispatch(setAiTyping(false));
          }

          const myId = user?.id ?? -1;
          const myUsername = (user?.username || '').toLowerCase();

          const isFromMe = msg.userId === myId;
          if (isFromMe) return;

          const isMentionOfMe = Array.isArray(msg.mentions) &&
            msg.mentions.some(m => m.toLowerCase() === myUsername);

          const isDmToMe = msg.chatId.startsWith('dm:') &&
            msg.chatId.replace('dm:', '').split('-').map(Number).includes(myId);

          const isGlobal = msg.chatId === 'global';
          const shouldNotify = isMentionOfMe || isDmToMe || isGlobal;

          const currentChatOpen = chatOpenRef.current;
          const currentActiveChatId = activeChatIdRef.current;

          if (shouldNotify && (!currentChatOpen || currentActiveChatId !== msg.chatId)) {
            dispatch(incrementUnread(msg.chatId));
            const stored = JSON.parse(localStorage.getItem('valhalla.unread') || '{}');
            stored[msg.chatId] = (stored[msg.chatId] || 0) + 1;
            localStorage.setItem('valhalla.unread', JSON.stringify(stored));
            if (isMentionOfMe) playMentionSound();
            else playChatSound();
          }

          if (msg.chatId.startsWith('dm:') && !isFromMe) {
            const parts = msg.chatId.replace('dm:', '').split('-').map(Number);
            const otherId = parts.find(id => id !== myId);
            if (otherId) {
              dispatch(addDmUser(otherId));
              const stored = JSON.parse(localStorage.getItem(DM_LIST_KEY(myId)) || '[]');
              if (!stored.includes(otherId)) {
                localStorage.setItem(DM_LIST_KEY(myId), JSON.stringify([...stored, otherId]));
              }
            }
          }
        } catch (err) {
          if (import.meta.env.DEV) console.error("WS Message Error", err);
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 30000);
      };

      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, 30000);
    };

    connect();

    return () => {
      disposed = true;
      clearInterval(pingInterval);
      ws?.close();
    };
  }, [user?.id]);

  // Load chat history when switching channels or opening chat panel
  useEffect(() => {
    if (!user || !chatOpen) return;

    getChatHistory(activeChatId).then(history => {
      const currentMessages = chatMsgsByChat[activeChatId] || [];
      if (history?.length > 0) {
        const byId = new Map<string, ChatMessage>();
        [...history, ...currentMessages].forEach((msg) => byId.set(msg.id, msg));
        const merged = Array.from(byId.values())
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
          .slice(-200);
        dispatch(setHistoryForChat({ chatId: activeChatId, messages: merged }));
      }
    }).catch(() => {});
  }, [user?.id, activeChatId, chatOpen]);

  useEffect(() => {
    if (chatOpen) {
      dispatch(clearUnread(activeChatId));
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [chatOpen, activeChatId, chatMsgsByChat[activeChatId]?.length]);

  const handleChatInput = (value: string) => {
    dispatch(setChatInput(value));
    const atIdx = value.lastIndexOf('@');
    if (atIdx !== -1 && !value.slice(atIdx + 1).includes(' ')) {
      dispatch(setMentionFilter(value.slice(atIdx + 1).toLowerCase()));
      dispatch(setShowMentionDrop(true));
    } else {
      dispatch(setShowMentionDrop(false));
    }
  };

  const insertMention = (username: string) => {
    const atIdx = chatInput.lastIndexOf('@');
    dispatch(setChatInput(chatInput.slice(0, atIdx) + `@${username} `));
    dispatch(setShowMentionDrop(false));
    chatInputRef.current?.focus();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['text/plain','application/pdf','image/png','image/jpeg','image/svg+xml',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel'];
    if (!allowed.includes(file.type) && !file.name.endsWith('.csv')) {
      alert(lang === 'es' ? 'Tipo no permitido. Usa: texto, PDF, PNG, JPG, SVG, Excel o CSV' : 'File type not allowed');
      e.target.value = ''; return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert(lang === 'es' ? 'Archivo demasiado grande (máx 2 MB)' : 'File too large (max 2 MB)');
      e.target.value = ''; return;
    }
    const reader = new FileReader();
    reader.onload = ev => dispatch(setPendingAttachment({ name: file.name, type: file.type, size: file.size, data: ev.target!.result as string }));
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const openDm = (target: UserOut) => {
    if (!user) return;
    const dmId = makeDmId(user.id, target.id);
    dispatch(addDmUser(target.id));
    const stored = JSON.parse(localStorage.getItem(DM_LIST_KEY(user.id)) || '[]');
    if (!stored.includes(target.id)) {
      localStorage.setItem(DM_LIST_KEY(user.id), JSON.stringify([...stored, target.id]));
    }
    dispatch(setActiveChatId(dmId));
    dispatch(clearUnread(dmId));
  };

  const handleClearActiveChat = () => {
    dispatch(clearChat(activeChatId));
  };

  const getDmPartner = (chatId: string) => {
    if (!user) return null;
    const parts = chatId.replace('dm:', '').split('-').map(Number);
    const otherId = parts.find(id => id !== user.id) ?? parts[0];
    return teamUsers.find(u => u.id === otherId) || null;
  };

  const renderMsgText = (text: string) => {
    if (!text) return null;
    const safe = sanitizePlainText(text);
    const parts = safe.split(/(@\w+)/g);
    return parts.map((p, i) =>
      p.startsWith('@') ? <span key={i} className="mention">{p}</span> : p
    );
  };

  const sendChatMessage = useCallback(() => {
    if ((!chatInput.trim() && !pendingAttachment) || !user) return;
    const mentions = Array.from(chatInput.matchAll(/@(\w+)/g)).map(m => m[1]);
    const msg: ChatMessage = {
      id: Date.now().toString(), userId: user.id,
      username: user.username, rank: user.security_rank || 'ANALISTA',
      text: chatInput.trim(), timestamp: new Date().toISOString(),
      chatId: activeChatId, mentions,
      ...(pendingAttachment ? { attachment: pendingAttachment } : {})
    };
    dispatch(upsertMessage(msg));
    if (/@(chatbot|ia|valhalla|heimdall)\b/i.test(msg.text)) {
      dispatch(setAiTyping(true));
    }
    postChatMessage(msg).catch(err => {
      dispatch(setAiTyping(false));
      console.error("Chat Send Error", err);
    });
    dispatch(setChatInput(''));
    dispatch(setPendingAttachment(null));
    dispatch(setShowMentionDrop(false));
  }, [chatInput, user, activeChatId, pendingAttachment, dispatch]);

  if (showCinematic) {
    return <CinematicIntro onComplete={() => {
      sessionStorage.setItem('valhalla_intro_played', 'true');
      setShowCinematic(false);
    }} />;
  }

  if (loading) {
    return (
      <div className="loading-tactical">
        <div className="loading-tactical__inner">
          <div className="loading-tactical__icon">
            <div className="loading-tactical__icon-inner">
              <AlexanaLetter char="V" style={{ width: '36px', height: '36px', color: 'var(--signal)' }} />
            </div>
          </div>
          <div className="loading-tactical__text">
            INICIALIZANDO SISTEMA<span className="loading-tactical__dots" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div
        className={`login-screen theme-${scheme} ${scanlines ? 'scanlines' : ''}`}
        data-scheme={scheme}
        data-scan={scanlines ? 'on' : 'off'}
        style={{ minHeight: '100vh', height: '100vh' }}
      >
        <SvgSymbols />
        <div className="login-layout">
          <div className="login-hero-col">
            <div className="login-brand-row">
              <div className="login-logo-tile">
                 <AlexanaLetter char="V" style={{ width: '40px', height: '40px', color: '#000' }} />
              </div>
              <div className="login-brand-words">
                 <AlexanaWord word="VALHALLA" height="48px" color="var(--login-brand-text)" />
                 <div className="login-brand-sub">
                    <AlexanaWord word="SOC" height="24px" color="var(--signal)" />
                    <AlexanaWord word="PRO" height="24px" color="var(--login-pro-muted)" />
                 </div>
              </div>
            </div>
            <p className="login-tagline">
              {lang === 'es' ? 'Plataforma de Monitorización y' : 'Platform for Monitoring and'}<br/>
              {lang === 'es' ? 'Respuesta Táctica con IA' : 'Tactical AI Response'}
            </p>
          </div>
          <div className="login-form-col">
            <div className="cyber-panel-wrap">
              <div className="cyber-panel">
              <div className="login-panel-head">
                 <div className="login-panel-icon">
                    <AlexanaLetter char="V" style={{ width: '36px', height: '36px', color: isOffline ? 'var(--danger)' : 'var(--signal)' }} />
                 </div>
                 <h2 className="login-welcome">{t('welcome')}</h2>
              </div>
              <form className="login-form" onSubmit={onLogin}>
                 <div className="login-field">
                   <label className="login-label" htmlFor="login-user">{t('user_id')}</label>
                   <input id="login-user" name="u" className="login-input" placeholder={lang === 'es' ? 'Usuario SOC' : 'SOC username'} autoComplete="username" autoFocus />
                 </div>
                 <div className="login-field">
                   <label className="login-label" htmlFor="login-pass">{t('password')}</label>
                   <input id="login-pass" name="p" className="login-input" type="password" placeholder="••••••••" />
                 </div>
                 <button type="submit" className="login-btn">{t('login_btn')}</button>
                 <div className="login-footer">
                     <a className="login-manual-link" href="/MANUAL.md" target="_blank" rel="noopener noreferrer">{lang === 'es' ? '¿Primera vez? Ver manual' : 'First time? See manual'}</a>
                  </div>
                 <div className="login-lang-wrap">
                    <button type="button" className="login-lang-btn" onClick={toggleLang}>
                       {lang === 'es' ? 'CAMBIAR A INGLÉS' : 'CHANGE TO SPANISH'}
                    </button>
                 </div>
              </form>
            </div>
            </div>
          </div>
        </div>
      </div>
    );
  }


  // Iconos Lucide únicos por módulo (los mismos que usa el buscador Ctrl+K)
  const NAV_ICONS: Record<string, PaletteCommand['icon']> = {
    overview: LayoutDashboard, siem: Layers, assets: Monitor, incidents: Siren, monitors: Radar,
    health: Activity, audit: ScrollText, cowrie: Bug, threat: ShieldAlert, threatmap: Globe2,
    lsamonitor: KeyRound, bifrost: BarChart3, heimdall: FileText, cveintel: ShieldCheck,
    runbooks: BookOpen, workspace: Briefcase, 'executive-report': FileBarChart, users: Users,
  };

  const NavBtn = ({ id, label, sub, icon, badge, color }: any) => (
    <button className={`navbtn ${view === id ? 'active' : ''}`} onClick={() => dispatch(setView(id))}>
      <span className="navbtn__icon-wrap">
        {(() => { const Icon = NAV_ICONS[id]; return Icon ? <Icon className="navbtn__icon" aria-hidden="true" /> : <svg className="navbtn__icon"><use href={`#${icon}`}/></svg>; })()}
      </span>
      <span className="navbtn__main">{label}</span>
      <span className="navbtn__sub">{sub}</span>
      {badge ? <span className={`navbtn__badge ${color || ''}`}>{badge}</span> : null}
    </button>
  );

  const incidentCount = stats?.metrics?.tickets_open || 0;
  const incidentText = incidentCount === 1 ? t('incidents_open_singular') : t('incidents_open_plural');
  const incidentHeaderLabel = incidentCount === 1 ? (lang === 'es' ? 'INCIDENTE' : 'INCIDENT') : t('incidents');

  const es = lang === 'es';
  const isAdmin = user?.role === 'admin';
  const unreadNotifs = recentOpenTickets.length > 0 && !notifSeen;
  const initials = (user.username || '?').slice(0, 2).toUpperCase();

  // Módulos navegables desde el buscador (mismos permisos que el menú lateral).
  const navCommands: Array<{ id: string; es: string; en: string; icon: PaletteCommand['icon']; admin?: boolean; kw?: string }> = [
    { id: 'overview', es: 'Vista general', en: 'Overview', icon: LayoutDashboard, kw: 'dashboard panel' },
    { id: 'siem', es: 'SIEM · Alertas Wazuh', en: 'SIEM · Wazuh alerts', icon: Layers, kw: 'alertas alerts wazuh' },
    { id: 'assets', es: 'Activos', en: 'Assets', icon: Monitor, admin: true, kw: 'agentes endpoints agents' },
    { id: 'monitors', es: 'Monitores', en: 'Monitors', icon: Radar, admin: true },
    { id: 'health', es: 'Estado de integraciones', en: 'Integrations health', icon: Activity, admin: true, kw: 'status salud' },
    { id: 'audit', es: 'Auditoría', en: 'Audit log', icon: ScrollText, admin: true, kw: 'log registro' },
    { id: 'cowrie', es: 'Honeypots · Cowrie', en: 'Honeypots · Cowrie', icon: Bug, admin: true, kw: 'ssh telnet' },
    { id: 'threat', es: 'Threat Intel', en: 'Threat Intel', icon: ShieldAlert, kw: 'virustotal otx ioc' },
    { id: 'threatmap', es: 'Threat Map', en: 'Threat Map', icon: Globe2, kw: 'mapa geo' },
    { id: 'lsamonitor', es: 'LSA Monitor', en: 'LSA Monitor', icon: KeyRound, admin: true, kw: 'credential guard' },
    { id: 'bifrost', es: 'Bifröst · Métricas', en: 'Bifröst · Metrics', icon: BarChart3, admin: true, kw: 'bifrost hunting madurez' },
    { id: 'heimdall', es: 'Heimdall · Informe Intel', en: 'Heimdall · Intel report', icon: FileText, admin: true },
    { id: 'cveintel', es: 'CVE Intel', en: 'CVE Intel', icon: ShieldCheck, kw: 'kev exploit vulnerabilidad' },
    { id: 'runbooks', es: 'Runbooks', en: 'Runbooks', icon: BookOpen, kw: 'playbooks procedimientos' },
    { id: 'workspace', es: 'Workspace de incidentes', en: 'Incident workspace', icon: Briefcase, kw: 'incidentes incidents tickets tabla kanban' },
    { id: 'executive-report', es: 'Informe ejecutivo', en: 'Executive report', icon: FileBarChart, admin: true, kw: 'pdf' },
    { id: 'users', es: 'Usuarios', en: 'Users', icon: Users, admin: true },
    { id: 'profile', es: 'Mi perfil', en: 'My profile', icon: UserRound, kw: 'contraseña password avatar' },
    { id: 'settings', es: 'Ajustes globales', en: 'Global settings', icon: SlidersHorizontal, admin: true, kw: 'api keys ollama' },
  ];
  const paletteCommands: PaletteCommand[] = [
    ...navCommands.filter((c) => !c.admin || isAdmin).map((c) => ({
      id: `nav-${c.id}`, label: es ? c.es : c.en, group: es ? 'Ir a' : 'Go to', icon: c.icon, keywords: c.kw,
      run: () => dispatch(setView(c.id)),
    })),
    { id: 'act-theme', label: theme === 'dark' ? (es ? 'Cambiar a modo claro' : 'Switch to light mode') : (es ? 'Cambiar a modo oscuro' : 'Switch to dark mode'), group: es ? 'Acciones' : 'Actions', icon: theme === 'dark' ? Sun : Moon, keywords: 'tema theme', run: toggleTheme },
    { id: 'act-lang', label: es ? 'Switch to English' : 'Cambiar a español', group: es ? 'Acciones' : 'Actions', icon: Globe2, keywords: 'idioma language', run: toggleLang },
    { id: 'act-appearance', label: es ? 'Apariencia y color de acento' : 'Appearance & accent colour', group: es ? 'Acciones' : 'Actions', icon: Palette, keywords: 'tema acento scanlines tv', run: () => setTweaksOpen(true) },
    { id: 'act-chat', label: es ? 'Abrir chat interno' : 'Open internal chat', group: es ? 'Acciones' : 'Actions', icon: MessageSquare, keywords: 'ia chatbot', run: () => dispatch(setChatOpen(true)) },
    { id: 'act-help', label: es ? 'Centro de ayuda' : 'Help center', group: es ? 'Acciones' : 'Actions', icon: CircleHelp, hint: '?', keywords: 'soporte support faq', run: () => setHelpOpen(true) },
    { id: 'act-logout', label: es ? 'Cerrar sesión' : 'Log out', group: es ? 'Acciones' : 'Actions', icon: LogOut, run: handleLogout },
  ];

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <SvgSymbols />
      <div className={`app ${tvMode ? 'tv-mode' : ''} ${sidebarCollapsed && !tvMode ? 'sidebar-collapsed' : ''}`}>

        {!tvMode && (
        <header
          className="topbar"
        >
          <div className="topbar__brand" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div className="topbar__logo" style={{ width: '32px', height: '32px', background: 'rgba(60,255,158,0.05)', border: '1px solid var(--signal)', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'rotate(45deg)', boxShadow: '0 0 10px var(--signal-glow)', marginRight: '8px' }}>
               <div style={{ transform: 'rotate(-45deg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AlexanaLetter char="V" style={{ width: '22px', height: '22px', color: 'var(--signal)' }} />
               </div>
            </div>
            <div className="glitch-hover" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '4px', cursor: 'default' }}>
               <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                 <AlexanaWord word="VALHALLA" height="18px" color={theme === 'light' ? 'var(--text-bright)' : '#fff'} />
                 <AlexanaWord word="SOC" height="12px" color="var(--signal)" />
                 <AlexanaWord word="PRO" height="12px" color={theme === 'light' ? 'var(--text-faint)' : 'rgba(255,255,255,0.5)'} />
               </div>
               <div className="topbar__sub" style={{ fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '2px', fontFamily: 'var(--mono)' }}>BLUE TEAM · WAZUH 4.9.5 · CLASSIFIED // EYES ONLY</div>
            </div>
          </div>

          <div className="status-chips">
            <div className="topbar-stat-group">
              <div className="topbar-stat">
                <span className="topbar-stat__label">{t('status')}</span>
                <span className="topbar-stat__value topbar-stat__value--ok">{t('operative')}</span>
              </div>
              <div className="topbar-stat__divider" aria-hidden="true" />
              <div className="topbar-stat">
                <span className="topbar-stat__label">{incidentHeaderLabel}</span>
                <span className={`topbar-stat__value${incidentCount > 0 ? ' topbar-stat__value--warn' : ' topbar-stat__value--ok'}`}>{incidentCount}</span>
              </div>
              <div className="topbar-stat__divider" aria-hidden="true" />
              <div className="topbar-stat">
                <span className="topbar-stat__label">{t('alerts_24h')}</span>
                <span className={`topbar-stat__value${(stats?.metrics?.total_alerts_24h || 0) > 0 ? ' topbar-stat__value--warn' : ''}`}>{stats?.metrics?.total_alerts_24h || 0}</span>
              </div>
            </div>
            <div className="vp-tb-cluster">
              <button className="vp-search" onClick={() => setPaletteOpen(true)} aria-label={es ? 'Buscar (Ctrl K)' : 'Search (Ctrl K)'}>
                <Search size={15} />
                <span>{es ? 'Buscar módulo o acción…' : 'Search module or action…'}</span>
                <span className="vp-kbd">Ctrl K</span>
              </button>
              <div className="vp-seg" role="group" aria-label={es ? 'Idioma' : 'Language'}>
                <button aria-pressed={lang === 'es'} onClick={() => dispatch(setLang('es'))}>ES</button>
                <button aria-pressed={lang === 'en'} onClick={() => dispatch(setLang('en'))}>EN</button>
              </div>
              <button className="vp-iconbtn" onClick={toggleTheme} title={theme === 'dark' ? (es ? 'Modo claro' : 'Light mode') : (es ? 'Modo oscuro' : 'Dark mode')} aria-label={es ? 'Cambiar tema' : 'Toggle theme'}>
                {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              <button className="vp-iconbtn" onClick={() => setTweaksOpen(!tweaksOpen)} aria-expanded={tweaksOpen} title={es ? 'Apariencia y acentos' : 'Appearance & accents'} aria-label={es ? 'Apariencia' : 'Appearance'}>
                <Palette size={17} />
              </button>
            </div>
            <div className="vp-tb-sep" aria-hidden="true" />
            <div className="vp-tb-cluster">
              <button
                className={`vp-iconbtn${totalUnread > 0 ? ' vp-iconbtn--alert' : ''}`}
                onClick={() => {
                  if (!chatOpen) dispatch(clearUnread(activeChatId));
                  dispatch(setChatOpen(!chatOpen));
                }}
                aria-expanded={chatOpen}
                title={es ? 'Chat interno' : 'Internal chat'}
                aria-label={es ? 'Chat interno' : 'Internal chat'}
              >
                <MessageSquare size={17} />
                {totalUnread > 0 && <span className="vp-badge">{totalUnread > 99 ? '99+' : totalUnread}</span>}
              </button>
              <button
                className={`vp-iconbtn${unreadNotifs ? ' vp-iconbtn--alert' : ''}`}
                onClick={() => { setNotifMenuOpen(!notifMenuOpen); dispatch(setNotifSeen(true)); }}
                aria-expanded={notifMenuOpen}
                title={t('notifications')}
                aria-label={t('notifications')}
              >
                <Bell size={17} />
                {unreadNotifs && <span className="vp-badge">{incidentCount}</span>}
              </button>
              <button className="vp-iconbtn" onClick={() => setHelpOpen(true)} aria-expanded={helpOpen} title={es ? 'Soporte y centro de ayuda (?)' : 'Support & help center (?)'} aria-label={es ? 'Soporte' : 'Support'}>
                <CircleHelp size={17} />
              </button>
            </div>
            <div className="vp-tb-sep" aria-hidden="true" />
            <button className="vp-user" onClick={() => setUserMenuOpen(!userMenuOpen)} aria-expanded={userMenuOpen} aria-haspopup="menu">
              <div className="vp-user__text" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span className="vp-user__name">{user.username.toUpperCase()}</span>
                <span className="vp-user__rank">{user.security_rank?.toUpperCase() || 'ANALISTA'}</span>
              </div>
              <span className="vp-avatar">
                {profilePic ? <img src={`${profilePic}${profilePic.includes('?') ? '&' : '?'}t=${Date.now()}`} alt="" /> : initials}
              </span>
              <ChevronDown size={14} color="var(--tb-fg-dim)" />
            </button>
          </div>
        </header>
        )}

        {userMenuOpen && (
          <div className="vp-backdrop" onClick={() => setUserMenuOpen(false)}>
            <div className="vp-pop" style={{ width: 272 }} role="menu" onClick={e => e.stopPropagation()}>
              <div className="vp-pop__head">
                <span className="vp-avatar vp-avatar--lg">
                  {profilePic ? <img src={`${profilePic}${profilePic.includes('?') ? '&' : '?'}t=${Date.now()}`} alt="" /> : initials}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="vp-pop__title" style={{ letterSpacing: 1 }}>{user.username.toUpperCase()}</div>
                  <div className="vp-pop__sub">{user.security_rank?.toUpperCase() || 'ANALISTA'} · {user.role?.toUpperCase()}</div>
                </div>
              </div>
              <div className="vp-pop__body">
                <div className="vp-menu-label">{es ? 'Cuenta' : 'Account'}</div>
                <button role="menuitem" className="vp-menu-item" onClick={() => { dispatch(setView("profile")); setUserMenuOpen(false); }}><UserRound size={16} />{es ? 'Mi perfil' : 'My profile'}</button>
                <button role="menuitem" className="vp-menu-item" onClick={() => { setTweaksOpen(true); setUserMenuOpen(false); }}><Palette size={16} />{es ? 'Apariencia' : 'Appearance'}</button>
                {isAdmin && (
                  <button role="menuitem" className="vp-menu-item" onClick={() => { dispatch(setView("settings")); setUserMenuOpen(false); }}><SlidersHorizontal size={16} />{es ? 'Ajustes globales' : 'Global settings'}</button>
                )}
                <div className="vp-menu-label">{es ? 'Panel' : 'Dashboard'}</div>
                <button role="menuitem" className="vp-menu-item" onClick={() => { setShowWidgetCatalog(true); setUserMenuOpen(false); }}><LayoutGrid size={16} />{t('add_widget')}</button>
                <button role="menuitem" className="vp-menu-item" onClick={() => { setIsLocked(!isLocked); setUserMenuOpen(false); }}>{isLocked ? <Unlock size={16} /> : <Lock size={16} />}{isLocked ? t('unlock') : t('lock')}</button>
                <button role="menuitem" className="vp-menu-item" onClick={() => window.location.reload()}><RefreshCw size={16} />{t('sync')}</button>
                <button role="menuitem" className="vp-menu-item" onClick={() => { setShowCinematic(true); setUserMenuOpen(false); }}><Play size={16} />{es ? 'Intro Hyperframe' : 'Hyperframe intro'}</button>
                <div className="vp-menu-sep" />
                <button role="menuitem" className="vp-menu-item" onClick={() => { setHelpOpen(true); setUserMenuOpen(false); }}><CircleHelp size={16} />{es ? 'Centro de ayuda' : 'Help center'}<span className="vp-menu-item__hint">?</span></button>
                <button role="menuitem" className="vp-menu-item vp-menu-item--danger" onClick={handleLogout}><LogOut size={16} />{t('exit')}</button>
              </div>
            </div>
          </div>
        )}

        {notifMenuOpen && (
          <div className="vp-backdrop" onClick={() => setNotifMenuOpen(false)}>
            <div className="vp-pop" style={{ width: 360, right: 110 }} role="dialog" aria-label={t('notifications')} onClick={e => e.stopPropagation()}>
              <div className="vp-pop__head">
                <Bell size={16} color="var(--signal)" />
                <div>
                  <div className="vp-pop__title">{t('notifications')}</div>
                  <div className="vp-pop__sub">{incidentCount} {incidentText}</div>
                </div>
                {recentOpenTickets.length > 0 && <span className="vp-chip vp-chip--danger" style={{ marginLeft: 'auto' }}>{recentOpenTickets.length} {es ? 'nuevos' : 'new'}</span>}
              </div>
              <div className="vp-pop__body">
                {recentOpenTickets.length > 0 ? recentOpenTickets.map(tk => {
                  const sev = tk.severity === 'critical' ? 'var(--danger)' : tk.severity === 'high' ? 'var(--amber)' : 'var(--cyan)';
                  const SevIcon = tk.severity === 'critical' ? ShieldAlert : tk.severity === 'high' ? AlertTriangle : Info;
                  return (
                    <div key={tk.id} className="vp-notif" style={{ ['--sev' as string]: sev }}>
                      <span className="vp-notif__icon"><SevIcon size={16} /></span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="vp-notif__meta">
                          <span style={{ color: sev, fontWeight: 700 }}>{tk.severity.toUpperCase()}</span>
                          <span>#{tk.id}</span>
                        </div>
                        <div className="vp-notif__title">{tk.title}</div>
                        <div className="vp-notif__actions">
                          <button className="vp-btn vp-btn--primary" onClick={() => { dispatch(setView("workspace")); setNotifMenuOpen(false); }}><ArrowRight size={12} />{t('ir_to_workspace')}</button>
                          <button className="vp-btn" onClick={() => handleAssignToMe(tk.id)}><UserCheck size={12} />{t('assign_to_me')}</button>
                        </div>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="vp-empty">
                    <BellOff size={26} />
                    <strong>{t('no_recent_incidents')}</strong>
                    {es ? 'Las alertas convertidas en incidente aparecerán aquí.' : 'Alerts turned into incidents will show up here.'}
                  </div>
                )}
              </div>
              {incidentCount > 0 && (
                <div className="vp-pop__foot">
                  <button className="vp-btn vp-btn--block" onClick={() => { dispatch(setView("workspace")); setNotifMenuOpen(false); }}>
                    {es ? 'Ver todos los tickets' : 'View all tickets'} ({incidentCount})
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {!tvMode && (
        <aside className={`sidenav ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <NavBtn id="overview" label={t('overview')} sub={t('overview_sub')} icon="i-overview" />
          <NavBtn id="siem" label={t('siem')} sub={t('siem_sub')} icon="i-siem" badge={stats?.metrics?.total_alerts_24h?.toLocaleString()} color="danger" />
          {user?.role === 'admin' && <NavBtn id="assets" label={t('assets')} sub={t('assets_sub')} icon="i-assets" badge={stats?.metrics?.unique_agents} />}
          {user?.role === 'admin' && <NavBtn id="monitors" label={lang === 'es' ? 'Monitores' : 'Monitors'} sub="Config SIEM" icon="i-threat" />}
          {user?.role === 'admin' && <NavBtn id="health" label={lang === 'es' ? 'Estado' : 'Health'} sub="Integraciones" icon="i-metrics" />}
          {user?.role === 'admin' && <NavBtn id="audit" label={lang === 'es' ? 'Auditoría' : 'Audit'} sub="Log del Sistema" icon="i-metrics" />}
          {user?.role === 'admin' && <NavBtn id="cowrie" label={t('cowrie')} sub={t('cowrie_sub')} icon="i-threat" badge="Ssh/Tel" color="amber" />}
          <NavBtn id="threat" label={t('threat_intel')} sub={t('threat_intel_sub')} icon="i-threat" badge="IOCs" />
          <NavBtn id="threatmap" label={t('threat_map')} sub={t('threat_map_sub')} icon="i-map" />
          {user?.role === 'admin' && <NavBtn id="lsamonitor" label={t('lsa_monitor')} sub={t('lsa_monitor_sub')} icon="i-overview" />}
          {user?.role === 'admin' && <NavBtn id="bifrost" label="Bifröst" sub={lang === 'es' ? 'Métricas · Hunting' : 'Metrics · Hunting'} icon="i-metrics" />}
          {user?.role === 'admin' && <NavBtn id="heimdall" label="Heimdall" sub={lang === 'es' ? 'Informe Intel' : 'Intel Report'} icon="i-metrics" />}
          <NavBtn id="cveintel" label="CVE Intel" sub={lang === 'es' ? 'KEV · Difusión IA' : 'KEV · AI outreach'} icon="i-vuln" />
          <NavBtn id="runbooks" label={t('runbooks')} sub={t('runbooks_sub')} icon="i-playbook" />
          <NavBtn id="workspace" label={t('workspace')} sub={t('workspace_sub')} icon="i-workspace" />
          {user?.role === 'admin' && <NavBtn id="executive-report" label={t('exec_report')} sub={t('exec_report_sub')} icon="i-metrics" />}
          {user?.role === 'admin' && <NavBtn id="users" label={t('users')} sub={t('users_sub')} icon="i-overview" />}

          {/* Collapse Button */}
          <button
            className={`navbtn collapse-btn${sidebarCollapsed ? ' collapse-btn--active' : ''}`}
            onClick={() => {
              const newVal = !sidebarCollapsed;
              setSidebarCollapsed(newVal);
              localStorage.setItem('valhalla_sidebar_collapsed', String(newVal));
            }}
            style={{ marginTop: 'auto' }}
          >
            <span className="navbtn__icon-wrap" style={{ transform: sidebarCollapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}>
              <svg className="navbtn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
            </span>
            {!sidebarCollapsed && <span className="navbtn__main">Colapsar Sidebar</span>}
          </button>
        </aside>

        )}

        <main className="main" style={{ gridColumn: tvMode ? '1 / -1' : '2 / -1', gridRow: tvMode ? '1 / -1' : 'auto', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className="main-content" style={{ overflowY: 'auto', position: 'relative', flex: 1 }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 10, filter: 'blur(10px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -10, filter: 'blur(10px)' }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                style={{ height: '100%' }}
              >
                {view === 'overview' && <DashboardSuperFinal isLockedProp={isLocked} showWidgetCatalog={showWidgetCatalog} setShowWidgetCatalog={setShowWidgetCatalog} lang={lang} />}
                {view === 'assets' && <AssetsView lang={lang} />}
                {view === 'users' && <UsersView lang={lang} />}
                {view === 'audit' && <AuditLogView lang={lang} />}
                {view === 'settings' && <SystemSettingsView lang={lang} />}
                {view === 'health' && <IntegrationsHealthView lang={lang} />}
                {view === 'monitors' && <MonitorsView lang={lang} />}
                {view === 'siem' && <SiemView lang={lang} />}
                {view === 'threat' && <ThreatIntelView lang={lang} initialIp={intelIp} />}
                {view === 'cowrie' && <CowrieView lang={lang} />}
                {view === 'threatmap' && <ThreatMapView lang={lang} />}
                {view === 'runbooks' && <RunbooksView lang={lang} />}
                {view === 'lsamonitor' && <LSAMonitorView lang={lang} />}
                {view === 'bifrost' && <SocMaturityView lang={lang} />}
                {view === 'heimdall' && <HeimdallReportView lang={lang} />}
                {view === 'cveintel' && <CveIntelView lang={lang} />}
                {/* "Incidentes" se fusionó en el Workspace (vista tabla) */}
                {(view === 'workspace' || view === 'incidents') && <AnalystWorkspace lang={lang} currentUser={user!} initialData={workspaceData} onClearInitialData={() => dispatch(clearWorkspaceData())} initialMode={view === 'incidents' ? 'table' : undefined} />}
                {view === 'executive-report' && <ExecutiveReport lang={lang} />}
                {view === 'profile' && <ProfileView user={user} lang={lang} onUpdate={(u) => dispatch(setUser(u))} profilePic={profilePic} setProfilePic={(p) => dispatch(setProfilePic(p))} />}
                {!['overview', 'assets', 'users', 'incidents', 'audit', 'settings', 'health', 'monitors', 'siem', 'threat', 'cowrie', 'threatmap', 'lsamonitor', 'bifrost', 'heimdall', 'cveintel', 'runbooks', 'workspace', 'executive-report', 'profile'].includes(view) && (
                  <div className="panel" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ fontSize: '48px', opacity: 0.3 }}>404</div>
                    <div style={{ color: 'var(--text-dim)', letterSpacing: '2px', fontSize: '13px' }}>MÓDULO NO ENCONTRADO</div>
                    <button onClick={() => dispatch(setView('overview'))} style={{ padding: '8px 20px', background: 'rgba(60,255,158,0.1)', border: '1px solid var(--signal)', color: 'var(--signal)', cursor: 'pointer', borderRadius: '8px', fontSize: '11px', fontWeight: 600 }}>← VOLVER A OVERVIEW</button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        {tweaksOpen && (
          <QuickSettings
            lang={lang}
            theme={theme}
            scheme={scheme}
            scanlines={scanlines}
            tvMode={tvMode}
            isAdmin={isAdmin}
            onScheme={(s) => dispatch(setScheme(s))}
            onTheme={(v) => dispatch(setTheme(v))}
            onLang={(v) => dispatch(setLang(v))}
            onScanlines={(v) => dispatch(setScanlines(v))}
            onTvMode={(v) => { dispatch(setTvMode(v)); if (v) setTweaksOpen(false); }}
            onOpenGlobalSettings={() => dispatch(setView("settings"))}
            onClose={() => setTweaksOpen(false)}
          />
        )}
        {tvMode && (
          <button className="vp-btn" style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 50, background: 'var(--vp-surface)' }} onClick={() => dispatch(setTvMode(false))}>
            <Minimize2 size={13} />{es ? 'Salir del modo TV (Esc)' : 'Exit TV mode (Esc)'}
          </button>
        )}
        <Toaster />
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={paletteCommands} lang={lang} />
        <HelpCenter
          open={helpOpen}
          onClose={() => setHelpOpen(false)}
          lang={lang}
          isAdmin={isAdmin}
          onNavigate={(v) => dispatch(setView(v))}
          onOpenChat={() => dispatch(setChatOpen(true))}
        />

        {/* Chat Panel — Enterprise */}
        <AnimatePresence>
        {chatOpen && (
          <motion.div
            className="chat-panel"
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            {/* Header */}
            <div className="chat-panel__head">
              <span className="chat-panel__title">
                {activeChatId === 'global'
                  ? 'COMMS // EQUIPO'
                  : `DM // ${getDmPartner(activeChatId)?.username?.toUpperCase() || '???'}`
                }
              </span>
              <div className="chat-panel__head-actions">
                <button className="chat-panel__action-btn" onClick={handleClearActiveChat} title={lang === 'es' ? 'Limpiar chat' : 'Clear chat'}></button>
                <button className="chat-panel__close" onClick={() => dispatch(setChatOpen(false))}></button>
              </div>
            </div>

            {/* Body: sidebar + main */}
            <div className="chat-body">
              {/* Sidebar */}
              <div className="chat-sidebar">
                <div className="chat-sidebar__label">CANALES</div>
                <button
                  className={`chat-sidebar__item${activeChatId === 'global' ? ' active' : ''}`}
                  onClick={() => { dispatch(setActiveChatId('global')); dispatch(clearUnread('global')); }}
                >
                  # EQUIPO
                  {(unreadByChat.global || 0) > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span className="chat-sidebar__unread">{unreadByChat.global}</span>
                      <span className="unread-dot" />
                    </div>
                  )}
                </button>

                {dmUserIds.length > 0 && <div className="chat-sidebar__label">DMs</div>}
                {dmUserIds.map(uid => {
                  const dmId = makeDmId(user!.id, uid);
                  const partner = teamUsers.find(u => u.id === uid);
                  return (
                    <button
                      key={uid}
                      className={`chat-sidebar__item${activeChatId === dmId ? ' active' : ''}`}
                      onClick={() => {
                        dispatch(setActiveChatId(dmId));
                        dispatch(clearUnread(dmId));
                      }}
                    >
                      @ {partner?.username?.toUpperCase() || `U${uid}`}
                      {(unreadByChat[dmId] || 0) > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <span className="chat-sidebar__unread">{unreadByChat[dmId]}</span>
                          <span className="unread-dot" />
                        </div>
                      )}
                    </button>
                  );
                })}

                <div className="chat-sidebar__label">NUEVO DM</div>
                {teamUsers
                  .filter(u => u.id !== user?.id && !dmUserIds.includes(u.id))
                  .map(u => (
                    <button key={u.id} className="chat-sidebar__item" onClick={() => openDm(u)} style={{ opacity: 0.55 }}>
                      + {u.username.toUpperCase()}
                    </button>
                  ))
                }
              </div>

              {/* Main chat area */}
              <div className="chat-main">
                <div className="chat-panel__messages">
                  {(chatMsgsByChat[activeChatId] || []).length === 0 && (
                    <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-faint)', fontSize: '10px', letterSpacing: '2px' }}>
                      CANAL SEGURO ESTABLECIDO<br/>
                      <span style={{ opacity: 0.6, fontSize: '9px' }}>SIN MENSAJES AÚN</span>
                    </div>
                  )}
                  {(chatMsgsByChat[activeChatId] || []).map(msg => (
                    <div key={msg.id} className="chat-msg">
                      <div className="chat-msg__meta">
                        <span className={`chat-msg__user${msg.userId === user?.id ? ' self' : ''}`}>{msg.username}</span>
                        <span className="chat-msg__time">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      {msg.text && <div className="chat-msg__text">{renderMsgText(msg.text)}</div>}
                      {msg.attachment && (
                        <div className="chat-msg__attachment">
                          {msg.attachment.type.startsWith('image/') ? (
                            <img
                              src={msg.attachment.data}
                              alt={msg.attachment.name}
                              onClick={() => window.open(msg.attachment!.data)}
                              style={{ cursor: 'pointer' }}
                            />
                          ) : (
                            <>
                              <span style={{ fontSize: '16px' }}>
                                {msg.attachment.type === 'application/pdf' ? '' :
                                 msg.attachment.type.includes('spreadsheet') || msg.attachment.type.includes('excel') ? '' :
                                 msg.attachment.type === 'text/plain' ? '' : ''}
                              </span>
                              <a href={msg.attachment.data} download={msg.attachment.name} style={{ color: 'var(--signal)', textDecoration: 'none' }}>
                                {msg.attachment.name}
                              </a>
                              <span style={{ fontSize: '8px', color: 'var(--text-faint)' }}>
                                {(msg.attachment.size / 1024).toFixed(0)} KB
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {isAiTyping && (
                    <div className="chat-ai-typing" role="status" aria-live="polite">
                      <span className="chat-ai-typing__orb" />
                      <span>IA escribiendo...</span>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Pending attachment preview */}
                {pendingAttachment && (
                  <div className="chat-attachment-preview">
                    {pendingAttachment.type.startsWith('image/') ? (
                      <img src={pendingAttachment.data} alt={pendingAttachment.name} />
                    ) : (
                      <span> {pendingAttachment.name} ({(pendingAttachment.size / 1024).toFixed(0)} KB)</span>
                    )}
                    <button className="chat-attachment-preview__remove" onClick={() => dispatch(setPendingAttachment(null))}></button>
                  </div>
                )}

                {/* @mention dropdown */}
                {showMentionDrop && (
                  <div className="mention-dropdown">
                    {teamUsers
                      .filter(u => u.username.toLowerCase().startsWith(mentionFilter) && u.id !== user?.id)
                      .slice(0, 6)
                      .map(u => (
                        <button key={u.id} className="mention-item" onClick={() => insertMention(u.username)}>
                          @{u.username.toUpperCase()} <span style={{ opacity: 0.5, fontSize: '9px' }}>{u.security_rank}</span>
                        </button>
                      ))
                    }
                  </div>
                )}

                {/* Input row */}
                <div className="chat-panel__input-row">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                    accept=".txt,.pdf,.png,.jpg,.jpeg,.svg,.xlsx,.xls,.csv"
                  />
                  <button className="chat-attach-btn" onClick={() => fileInputRef.current?.click()} title={lang === 'es' ? 'Adjuntar archivo' : 'Attach file'}></button>
                  <input
                    ref={chatInputRef}
                    className="chat-panel__input"
                    placeholder={activeChatId === 'global'
                      ? (lang === 'es' ? 'Mensaje al equipo... (@usuario)' : 'Team message... (@user)')
                      : (lang === 'es' ? `DM a ${getDmPartner(activeChatId)?.username || ''}...` : `DM to ${getDmPartner(activeChatId)?.username || ''}...`)}
                    value={chatInput}
                    onChange={e => handleChatInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
                      if (e.key === 'Escape') dispatch(setShowMentionDrop(false));
                    }}
                    maxLength={500}
                    autoFocus
                  />
                  <button className="chat-panel__send" onClick={sendChatMessage} title="Enviar"></button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
        </AnimatePresence>

      </div>
    </ThemeProvider>
  );
}
