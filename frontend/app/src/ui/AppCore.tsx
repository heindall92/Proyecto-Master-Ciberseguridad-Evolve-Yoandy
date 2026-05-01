import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import logger from "../lib/logger";
import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";
import "./HUD.css";
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
  TicketOut,
  getChatHistory,
  postChatMessage,
  getChatWsUrl
} from "../lib/api";

import AssetsView from "./AssetsView";
import UsersView from "./UsersView";
import DashboardSuperFinal from "./DashboardSuperFinal";
import { translations } from "./translations";
import IncidentsView from "./IncidentsView";
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
import ExecutiveReport from "./ExecutiveReport";
import ProfileView from "./ProfileView";

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

export default function App() {
  const [user, setUser] = useState<UserOut | null>(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [view, setView] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [scheme, setScheme] = useState("green");
  const [scanlines, setScanlines] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifMenuOpen, setNotifMenuOpen] = useState(false);
  const [notifSeen, setNotifSeen] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [lang, setLang] = useState<"es" | "en">(localStorage.getItem('valhalla_lang') as "es" | "en" || "es");
  const [lastTicketCount, setLastTicketCount] = useState(0);
  const [intelIp, setIntelIp] = useState<string | undefined>(undefined);
  const [workspaceData, setWorkspaceData] = useState<any>(null);
  const [tvMode, setTvMode] = useState(false);
  const [recentOpenTickets, setRecentOpenTickets] = useState<TicketOut[]>([]);
  const [profilePic, setProfilePic] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">(localStorage.getItem('valhalla_theme') as "dark" | "light" || "dark");

  // ── Chat interno enterprise ──
  interface ChatAttachment { name: string; type: string; size: number; data: string; }
  interface ChatMessage {
    id: string; userId: number; username: string; rank: string;
    text: string; timestamp: string; chatId: string;
    mentions: string[]; attachment?: ChatAttachment;
  }

  const DM_LIST_KEY = (uid: number) => `valhalla.dm.list.${uid}`;
  const makeDmId = (a: number, b: number) => `dm:${Math.min(a,b)}-${Math.max(a,b)}`;

  const [chatOpen, setChatOpen] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string>('global');
  const [chatMsgsByChat, setChatMsgsByChat] = useState<Record<string, ChatMessage[]>>({});
  const [dmUserIds, setDmUserIds] = useState<number[]>([]);
  const [teamUsers, setTeamUsers] = useState<UserOut[]>([]);
  const [unreadByChat, setUnreadByChat] = useState<Record<string, number>>({});
  const [chatInput, setChatInput] = useState('');
  const [mentionFilter, setMentionFilter] = useState('');
  const [showMentionDrop, setShowMentionDrop] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<ChatAttachment | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatChannelRef = useRef<BroadcastChannel | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);


  const totalUnread = Object.values(unreadByChat).reduce((a, b) => a + b, 0);

  // Update Tab Title when unread (Safe hook placement)
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
    const newLang = lang === "es" ? "en" : "es";
    setLang(newLang);
    localStorage.setItem('valhalla_lang', newLang);
  };
  const [showWidgetCatalog, setShowWidgetCatalog] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  const updateProfilePic = (newPic: string | null) => {
    setProfilePic(newPic);
  };

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    localStorage.setItem('valhalla_theme', newTheme);
  };

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const ticketsNow = stats?.metrics?.tickets_open || 0;
    // Si hay más tickets de los que teníamos, o si es la primera carga y hay tickets críticos
    if (ticketsNow > lastTicketCount || (lastTicketCount === 0 && ticketsNow > 0)) {
      if (lastTicketCount > 0) playNotificationSound();
      if (!notifSeen) setNotifSeen(false);
    }
    setLastTicketCount(ticketsNow);
  }, [stats?.metrics?.tickets_open]);

  useEffect(() => {
    const handleNavigateIntel = (e: any) => {
      setIntelIp(e.detail.ip);
      setView("threat");
    };
    const handleNavigateWorkspace = (e: any) => {
      setWorkspaceData(e.detail);
      setView("workspace");
    };
    window.addEventListener('navigate-to-intel', handleNavigateIntel);
    window.addEventListener('navigate-to-workspace', handleNavigateWorkspace);
    return () => {
      window.removeEventListener('navigate-to-intel', handleNavigateIntel);
      window.removeEventListener('navigate-to-workspace', handleNavigateWorkspace);
    };
  }, []);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      const res = await login(fd.get("u") as string, fd.get("p") as string);
      localStorage.setItem("token", res.access_token);
      setToken(res.access_token);
      setUserMenuOpen(false);
      setNotifMenuOpen(false);
      setView("overview");
    } catch (err: any) {
      if (err.message && (err.message.includes('fetch') || err.message.includes('Network'))) {
        setIsOffline(true);
        alert("ALERTA: Servidor SOC no alcanzable. Entrando al MODO OFFLINE.");
        setToken("offline-mode-token");
        setUser({ id: 1, username: "admin_offline", email: "admin@valhalla", full_name: "Admin Offline", is_active: true, is_superuser: true, role: "admin", rank: "L3 Blue Team" });
        setView("overview");
        setLoading(false);
      } else {
        alert("ERROR: Credenciales inválidas.");
      }
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
    setProfilePic(null);
    setIsLocked(true);
  };

  useEffect(() => {
    const unlockAudio = () => {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') {
        ctx.resume().then(() => {
          playNotificationSound(); // Play test sound
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
    if (!token) {
      setLoading(false);
      return;
    }
    if (token === "offline-mode-token") {
        setIsOffline(true);
        setUser({ id: 1, username: "admin_offline", email: "admin@valhalla", full_name: "Admin Offline", is_active: true, is_superuser: true, role: "admin", rank: "L3 Blue Team" });
        setLoading(false);
        return;
    }
    getCurrentUser()
      .then(u => {
         if (isMounted) {
           setUser(u);
           setProfilePic(u.avatar_url || null);
           setLoading(false);
         }
      })
      .catch((err: any) => {
         if (err.message && (err.message.includes('fetch') || err.message.includes('Network'))) {
           setIsOffline(true);
           setLoading(false);
           return;
         }
         logger.error("Token invalid, showing login:", err);
         if (isMounted) {
           localStorage.removeItem("token");
           setToken(null);
           setUser(null);
           setLoading(false);
         }
      });
    return () => { isMounted = false; };
  }, [token]);

  useEffect(() => {
    document.body.setAttribute("data-scheme", scheme);
    document.body.setAttribute("data-scan", scanlines ? "on" : "off");
  }, [scheme, scanlines]);

  const fetchStats = () => {
      getOpenTicketsCount()
        .then((r) => { 
          setStats((prev: any) => ({...prev, metrics: {...(prev?.metrics || {}), tickets_open: r.open}})); 
        })
        .catch((e) => { logger.error('[Dashboard] Error:', e); });
      
      listTickets('open', undefined, 10)
        .then(allOpen => {
          console.log('[DEBUG] Notif raw tickets:', allOpen.map(t => ({id: t.id, aid: (t as any).assigned_to_id})));
          // Filtrado inteligente según rol
          let filtered = allOpen;
          if (user?.role !== 'admin') {
            // En la campana mostramos:
            // 1. Lo que no tiene dueño (para que cualquiera lo tome)
            // 2. Lo que me han asignado a MI (directamente por el admin)
            filtered = allOpen.filter(tk => !tk.assigned_to_id || tk.assigned_to_id === user.id);
          }
          
          // Lógica de alerta: Si hay tickets nuevos que me corresponden
          const oldIds = new Set(recentOpenTickets.map(t => t.id));
          const hasNew = filtered.some(t => !oldIds.has(t.id));
          
          if (hasNew) {
            // Siempre poner el punto rojo si hay algo nuevo que no hemos visto
            setNotifSeen(false);
            
            // Solo pitar si ya teníamos la lista cargada (evita pitar al loguearse)
            if (recentOpenTickets.length > 0) {
              playNotificationSound();
              // Si hay algún ticket crítico nuevo, pitar una segunda vez para urgencia
              const hasCritical = filtered.some(t => t.severity === 'critical' && !oldIds.has(t.id));
              if (hasCritical) {
                setTimeout(playNotificationSound, 800);
              }
            }
          }
          
          setRecentOpenTickets(filtered);
        })
        .catch((e) => logger.error('[Dashboard] Tickets error:', e));

      getDashboardSummary().then(s => setStats(s)).catch((e) => logger.error('[Dashboard] Summary error:', e));
  }

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
      setNotifMenuOpen(false); // Cierra el menú al asignar
      alert(lang === 'es' ? "Incidente asignado correctamente" : "Incident assigned successfully");
    } catch (err) {
      logger.error("Error assigning ticket", err);
    }
  };

  // Load team users & DM list
  useEffect(() => {
    if (!user) return;
    listUsers().then(setTeamUsers).catch(() => {});
    try { setDmUserIds(JSON.parse(localStorage.getItem(DM_LIST_KEY(user.id)) || '[]')); } catch {}
  }, [user?.id]);

  // WebSocket / Sync logic (Real-time cross-browser)
  useEffect(() => {
    if (!user) return;

    // 1. Sync from Backend when switching chat
    getChatHistory(activeChatId).then(history => {
       if (history?.length > 0) {
          setChatMsgsByChat(prev => ({ ...prev, [activeChatId]: history }));
       }
    }).catch(() => {});

    // 2. Real-time WebSocket
    const wsUrl = getChatWsUrl();
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (e) => {
      try {
        const msg: ChatMessage = JSON.parse(e.data);
        
        // Update messages state (avoid duplicates)
        setChatMsgsByChat(prev => {
          const list = prev[msg.chatId] || [];
          if (list.some(m => m.id === msg.id)) return prev;
          const next = [...list, msg].slice(-200);
          return { ...prev, [msg.chatId]: next };
        });

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

        if (shouldNotify && (!chatOpen || activeChatId !== msg.chatId)) {
          setUnreadByChat(prev => {
            const next = { ...prev, [msg.chatId]: (prev[msg.chatId] || 0) + 1 };
            localStorage.setItem('valhalla.unread', JSON.stringify(next));
            return next;
          });
          if (isMentionOfMe) playMentionSound();
          else playChatSound();
        }

        // Add to DM list if it's a new DM for me
        if (msg.chatId.startsWith('dm:') && !isFromMe) {
           const parts = msg.chatId.replace('dm:', '').split('-').map(Number);
           const otherId = parts.find(id => id !== myId);
           if (otherId) {
             setDmUserIds(prev => {
               if (prev.includes(otherId)) return prev;
               const next = [...prev, otherId];
               localStorage.setItem(DM_LIST_KEY(myId), JSON.stringify(next));
               return next;
             });
           }
        }
      } catch (err) { console.error("WS Message Error", err); }
    };

    const pingInterval = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send("ping"); }, 30000);

    return () => {
      clearInterval(pingInterval);
      ws.close();
    };
  }, [user?.id, activeChatId, chatOpen]);

  useEffect(() => {
    if (chatOpen) {
      setUnreadByChat(prev => ({ ...prev, [activeChatId]: 0 }));
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [chatOpen, activeChatId, chatMsgsByChat[activeChatId]?.length]);

  const handleChatInput = (value: string) => {
    setChatInput(value);
    const atIdx = value.lastIndexOf('@');
    if (atIdx !== -1 && !value.slice(atIdx + 1).includes(' ')) {
      setMentionFilter(value.slice(atIdx + 1).toLowerCase());
      setShowMentionDrop(true);
    } else {
      setShowMentionDrop(false);
    }
  };

  const insertMention = (username: string) => {
    const atIdx = chatInput.lastIndexOf('@');
    setChatInput(chatInput.slice(0, atIdx) + `@${username} `);
    setShowMentionDrop(false);
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
    reader.onload = ev => setPendingAttachment({ name: file.name, type: file.type, size: file.size, data: ev.target!.result as string });
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const openDm = (target: UserOut) => {
    if (!user) return;
    const dmId = makeDmId(user.id, target.id);
    setDmUserIds(prev => {
      if (prev.includes(target.id)) return prev;
      const next = [...prev, target.id];
      localStorage.setItem(DM_LIST_KEY(user.id), JSON.stringify(next));
      return next;
    });
    setActiveChatId(dmId);
    setUnreadByChat(prev => ({ ...prev, [dmId]: 0 }));
  };

  const clearActiveChat = () => {
    setChatMsgsByChat(prev => ({ ...prev, [activeChatId]: [] }));
  };

  const getDmPartner = (chatId: string) => {
    if (!user) return null;
    const parts = chatId.replace('dm:', '').split('-').map(Number);
    const otherId = parts.find(id => id !== user.id) ?? parts[0];
    return teamUsers.find(u => u.id === otherId) || null;
  };

  const renderMsgText = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(@\w+)/g);
    return parts.map((p, i) =>
      p.startsWith('@') ? <span key={i} className="mention">{p}</span> : p
    );
  };

  const sendChatMessage = useCallback(() => {
    if ((!chatInput.trim() && !pendingAttachment) || !user) return;
    const mentions = Array.from(chatInput.matchAll(/@(\w+)/g)).map(m => m[1]);
    const msg: ChatMessage = {
      id: Date.now().toString(), userId: user.id,
      username: user.username, rank: user.rank || 'ANALISTA',
      text: chatInput.trim(), timestamp: new Date().toISOString(),
      chatId: activeChatId, mentions,
      ...(pendingAttachment ? { attachment: pendingAttachment } : {})
    };
    setChatMsgsByChat(prev => {
      const list = prev[activeChatId] || [];
      const next = [...list, msg].slice(-200);
      return { ...prev, [activeChatId]: next };
    });
    
    // Save to DB and broadcast via Backend
    postChatMessage(msg).catch(err => console.error("Chat Send Error", err));

    setChatInput('');
    setPendingAttachment(null);
    setShowMentionDrop(false);
  }, [chatInput, user, activeChatId, pendingAttachment]);

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
      <div className={`theme-${scheme} ${scanlines ? 'scanlines' : ''}`} data-scheme={scheme} data-scan={scanlines ? 'on' : 'off'} style={{ 
          height: '100vh', 
          background: 'url("./bg-login.png") center/cover no-repeat, var(--bg-void)'
      }}>
        <SvgSymbols />
        <div style={{ display: 'flex', height: '100%' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '60px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '20px' }}>
              <div style={{ width: '64px', height: '64px', background: 'var(--signal)', borderRadius: '12px', display: 'grid', placeItems: 'center', boxShadow: '0 0 20px var(--signal-glow)' }}>
                 <AlexanaLetter char="V" style={{ width: '40px', height: '40px', color: '#000' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                 <AlexanaWord word="VALHALLA" height="48px" />
                 <div style={{ display: 'flex', gap: '15px' }}>
                    <AlexanaWord word="SOC" height="24px" color="var(--signal)" />
                    <AlexanaWord word="PRO" height="24px" color="rgba(255,255,255,0.5)" />
                 </div>
              </div>
            </div>
            <p style={{ margin: '10px 0 0 5px', fontSize: '13px', color: 'var(--text-dim)', letterSpacing: '3px', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
              {lang === 'es' ? 'Plataforma de Monitorización y' : 'Platform for Monitoring and'}<br/>
              {lang === 'es' ? 'Respuesta Táctica con IA' : 'Tactical AI Response'}
            </p>
          </div>
          <div style={{ width: '450px', display: 'flex', alignItems: 'center', marginRight: '200px' }}>
            <div className="cyber-panel-wrap">
              <div className="cyber-panel">
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginBottom: '40px' }}>
                 <div style={{ width: '72px', height: '72px', borderRadius: '18px', border: '1px solid rgba(60,255,158,0.4)', display: 'grid', placeItems: 'center', background: 'linear-gradient(145deg, rgba(60,255,158,0.15), rgba(0,0,0,0.4))', boxShadow: '0 8px 24px rgba(0,0,0,0.4), inset 0 0 12px rgba(60,255,158,0.1)' }}>
                    <AlexanaLetter char="V" style={{ width: '36px', height: '36px', color: isOffline ? 'var(--danger)' : 'var(--signal)' }} />
                 </div>
                 <h2 style={{ margin: 0, fontSize: '22px', fontFamily: 'var(--sans)', fontWeight: 500, color: '#fff', letterSpacing: '0.5px' }}>{t('welcome')}</h2>
              </div>
              <form onSubmit={onLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                   <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--sans)' }}>{t('user_id')}</label>
                   <input name="u" placeholder="admin" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '14px 16px', borderRadius: '12px', fontFamily: 'var(--sans)', fontSize: '14px', outline: 'none', transition: 'all 0.2s', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }} autoFocus />
                 </div>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                   <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--sans)' }}>{t('password')}</label>
                   <input name="p" type="password" placeholder="••••••••" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '14px 16px', borderRadius: '12px', fontFamily: 'var(--sans)', fontSize: '14px', outline: 'none', transition: 'all 0.2s', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }} />
                 </div>
                 <button type="submit" className="login-btn">{t('login_btn')}</button>
                 <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--sans)' }}>
                     <a href="/MANUAL.md" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--signal)', textDecoration: 'none', fontWeight: 500 }}>{lang === 'es' ? '¿Primera vez? Ver manual' : 'First time? See manual'}</a>
                  </div>
                 <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center' }}>
                    <button type="button" onClick={toggleLang} style={{ background: 'rgba(60,255,158,0.1)', border: '1px solid rgba(60,255,158,0.3)', color: 'var(--signal)', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '11px', fontFamily: 'var(--mono)' }}>
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


  const NavBtn = ({ id, label, sub, icon, badge, color }: any) => (
    <button className={`navbtn ${view === id ? 'active' : ''}`} onClick={() => setView(id)}>
      <span className="navbtn__icon-wrap">
        <svg className="navbtn__icon"><use href={`#${icon}`}/></svg>
      </span>
      <span className="navbtn__main">{label}</span>
      <span className="navbtn__sub">{sub}</span>
      {badge && <span className={`navbtn__badge ${color || ''}`}>{badge}</span>}
    </button>
  );

  const incidentCount = stats?.metrics?.tickets_open || 0;
  const incidentText = incidentCount === 1 ? t('incidents_open_singular') : t('incidents_open_plural');
  const incidentHeaderLabel = incidentCount === 1 ? (lang === 'es' ? 'INCIDENTE' : 'INCIDENT') : t('incidents');

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <SvgSymbols />
      <div className={`app ${tvMode ? 'tv-mode' : ''}`}>
        
        {!tvMode && (
        <header className="topbar" style={{ background: 'rgba(10, 25, 20, 0.95)', borderBottom: '1px solid var(--signal-dim)' }}>
          <div className="topbar__brand" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div className="topbar__logo" style={{ width: '32px', height: '32px', background: 'rgba(60,255,158,0.05)', border: '1px solid var(--signal)', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'rotate(45deg)', boxShadow: '0 0 10px var(--signal-glow)', marginRight: '8px' }}>
               <div style={{ transform: 'rotate(-45deg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AlexanaLetter char="V" style={{ width: '22px', height: '22px', color: 'var(--signal)' }} />
               </div>
            </div>
            <div className="glitch-hover" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '4px', cursor: 'default' }}>
               <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                 <AlexanaWord word="VALHALLA" height="18px" />
                 <AlexanaWord word="SOC" height="12px" color="var(--signal)" />
                 <AlexanaWord word="PRO" height="12px" color="rgba(255,255,255,0.5)" />
               </div>
               <div className="topbar__sub" style={{ fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '2px', fontFamily: 'var(--mono)' }}>BLUE TEAM · WAZUH 4.9.5 · CLASSIFIED // EYES ONLY</div>
            </div>
          </div>

          <div className="status-chips">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', fontSize: '10px', lineHeight: '1.2' }}>
                <span style={{ color: 'var(--text-faint)' }}>{t('status')}</span>
                <span style={{ color: 'var(--signal)', fontWeight: 600 }}>{t('operative')}</span>
              </div>
              <div style={{ width: '1px', height: '20px', background: 'var(--line-faint)' }}></div>
              <div style={{ display: 'flex', flexDirection: 'column', fontSize: '10px', lineHeight: '1.2' }}>
                <span style={{ color: 'var(--text-faint)' }}>{incidentHeaderLabel}</span>
                <span style={{ color: incidentCount > 0 ? 'var(--danger)' : 'var(--signal)', fontWeight: 600 }}>{incidentCount}</span>
              </div>
              <div style={{ width: '1px', height: '20px', background: 'var(--line-faint)' }}></div>
              <div style={{ display: 'flex', flexDirection: 'column', fontSize: '10px', lineHeight: '1.2' }}>
                <span style={{ color: 'var(--text-faint)' }}>{t('alerts_24h')}</span>
                <span style={{ color: stats?.metrics?.total_alerts_24h > 0 ? 'var(--danger)' : 'var(--text-dim)', fontWeight: 600 }}>{stats?.metrics?.total_alerts_24h || 0}</span>
              </div>
            </div>
            <button
              onClick={() => {
                if (!chatOpen) {
                  // Al ABRIR: limpiar solo el canal activo
                  setUnreadByChat(prev => ({ ...prev, [activeChatId]: 0 }));
                }
                setChatOpen(v => !v);
              }}
              style={{
                position: 'relative', display: 'flex', alignItems: 'center',
                padding: '8px', cursor: 'pointer',
                background: totalUnread > 0 ? 'rgba(255,62,62,0.08)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${totalUnread > 0 ? 'rgba(255,62,62,0.4)' : 'rgba(0,255,136,0.2)'}`,
                borderRadius: '8px', marginRight: '4px', transition: 'all 0.2s'
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke={totalUnread > 0 ? '#FF3E3E' : chatOpen ? 'var(--signal)' : 'var(--signal)'}
                strokeWidth="2"
                style={{ filter: totalUnread > 0 ? 'drop-shadow(0 0 5px #FF3E3E)' : 'none' }}
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              {totalUnread > 0 && (
                <span style={{
                  position: 'absolute', top: '-4px', right: '-4px',
                  minWidth: '18px', height: '18px', padding: '0 4px',
                  background: '#FF3E3E', color: '#fff',
                  borderRadius: '10px', fontSize: '10px', fontWeight: 'bold',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 0 10px rgba(255,62,62,0.5)',
                  animation: 'pulse-red 2s infinite',
                  zIndex: 10
                }}>
                  {totalUnread > 99 ? '99+' : totalUnread}
                </span>
              )}
            </button>
            <button onClick={() => { setNotifMenuOpen(!notifMenuOpen); setNotifSeen(true); }} style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '8px', cursor: 'pointer', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: '8px', marginRight: '8px', transition: 'all 0.2s' }}>
              <style>{`
                @keyframes pulse-red {
                  0% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(255, 62, 62, 0.7); }
                  70% { transform: scale(1.1); box-shadow: 0 0 0 10px rgba(255, 62, 62, 0); }
                  100% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(255, 62, 62, 0); }
                }

                .unread-dot {
                  width: 8px;
                  height: 8px;
                  background-color: #ff3e3e;
                  border-radius: 50%;
                  box-shadow: 0 0 10px #ff3e3e;
                  animation: pulse-red 1.5s infinite;
                  display: inline-block;
                  margin-left: 8px;
                }
              `}</style>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={recentOpenTickets.length > 0 && !notifSeen ? "#FF3E3E" : "var(--signal)"} strokeWidth="2" style={{ filter: recentOpenTickets.length > 0 && !notifSeen ? 'drop-shadow(0 0 5px #FF3E3E)' : 'none' }}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              {recentOpenTickets.length > 0 && !notifSeen && (
                <span style={{ 
                  position: 'absolute', top: '-4px', right: '-4px', 
                  minWidth: '18px', height: '18px', padding: '0 4px',
                  background: '#FF3E3E', color: '#fff', 
                  borderRadius: '10px', fontSize: '10px', fontWeight: 'bold',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 0 10px rgba(255,62,62,0.5)',
                  animation: 'pulse-red 2s infinite',
                  zIndex: 10
                }}>
                  {incidentCount}
                </span>
              )}
            </button>
            <div style={{ width: '1px', height: '32px', background: 'var(--signal-dim)', margin: '0 4px' }}></div>
            <button onClick={() => setUserMenuOpen(!userMenuOpen)} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', background: 'none', border: 'none', padding: '4px 8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--signal)' }}>{user.username.toUpperCase()}</span>
                <span style={{ fontSize: '9px', color: 'var(--text-dim)' }}>{user.rank?.toUpperCase() || 'ANALISTA'}</span>
              </div>
              <div style={{ 
                width: '28px', height: '28px', borderRadius: '50%', 
                background: 'linear-gradient(135deg, var(--signal), var(--signal-deep))', 
                display: 'flex', alignItems: 'center', justifyContent: 'center', 
                border: '1px solid var(--signal-dim)',
                overflow: 'hidden',
                position: 'relative'
              }}>
                {profilePic ? (
                  <img src={`${profilePic}${profilePic.includes('?') ? '&' : '?'}t=${Date.now()}`} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: '14px' }}>👤</span>
                )}
              </div>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
            </button>
          </div>
        </header>
        )}

        {userMenuOpen && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 2147483647, background: 'rgba(0,0,0,0.1)' }} onClick={() => setUserMenuOpen(false)}>
            <div className="tactical-dropdown" style={{ position: 'absolute', top: 54, right: 10, width: '230px' }} onClick={e => e.stopPropagation()}>
              <div className="tactical-dropdown__header">
                <div className="tactical-dropdown__header-name">{user.username.toUpperCase()}</div>
                <div className="tactical-dropdown__header-rank">{user.rank?.toUpperCase() || 'ANALISTA'} · {user.role?.toUpperCase()}</div>
              </div>
              <div style={{ padding: '4px 0' }}>
                <button onClick={() => window.location.reload()} className="tactical-dropdown__item" style={{ color: 'var(--amber)' }}>{t('sync')}</button>
                <button onClick={() => { setShowWidgetCatalog(true); setUserMenuOpen(false); }} className="tactical-dropdown__item" style={{ color: 'var(--text)' }}>{t('add_widget')}</button>
                <button onClick={() => { setIsLocked(!isLocked); setUserMenuOpen(false); }} className="tactical-dropdown__item" style={{ color: 'var(--text)' }}>{isLocked ? t('unlock') : t('lock')}</button>
                <button onClick={() => { setTweaksOpen(true); setUserMenuOpen(false); }} className="tactical-dropdown__item" style={{ color: 'var(--text)' }}>🎨 {lang === 'es' ? 'TEMAS' : 'THEMES'}</button>
                <button onClick={() => { setView("profile"); setUserMenuOpen(false); }} className="tactical-dropdown__item" style={{ color: 'var(--cyan)' }}>👤 {t('profile_settings')}</button>
                {user?.role === 'admin' && (
                  <button onClick={() => { setView("settings"); setUserMenuOpen(false); }} className="tactical-dropdown__item" style={{ color: 'var(--amber)' }}>⚙ {lang === 'es' ? 'AJUSTES GLOBALES' : 'GLOBAL SETTINGS'}</button>
                )}
                <div className="tactical-dropdown__divider" />
                <button onClick={() => { toggleLang(); setUserMenuOpen(false); }} className="tactical-dropdown__item" style={{ color: 'var(--signal)', background: 'rgba(60,255,158,0.05)' }}>{t('language')}: {lang.toUpperCase()}</button>
                <div className="tactical-dropdown__divider" />
                <button onClick={logout} className="tactical-dropdown__item" style={{ color: 'var(--danger)' }}>{t('exit')}</button>
              </div>
            </div>
          </div>
        )}

        {notifMenuOpen && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 2147483647, background: 'rgba(0,0,0,0.1)' }} onClick={() => setNotifMenuOpen(false)}>
            <div className="tactical-dropdown" style={{ position: 'absolute', top: 54, right: 60, width: '320px', maxHeight: '450px', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--line-faint)', fontSize: '11px', fontWeight: 600, color: 'var(--signal)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{t('notifications')}</span>
                <span style={{ opacity: 0.7 }}>{incidentCount} {incidentText}</span>
              </div>
              <div style={{ padding: '4px 0' }}>
                <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '10px', color: 'var(--text-dim)' }}>
                  <a href="/MANUAL.md" target="_blank" style={{ color: 'var(--signal)', textDecoration: 'none' }}>
                    {lang === 'es' ? '¿Primera vez? Ver manual de acceso' : 'First time? View access manual'}
                  </a>
                </div>
                {recentOpenTickets.length > 0 ? recentOpenTickets.map(tk => (
                  <div key={tk.id} style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '9px', color: tk.severity === 'critical' ? 'var(--danger)' : tk.severity === 'high' ? 'var(--amber)' : 'var(--cyan)', fontWeight: 'bold' }}>
                        {tk.severity.toUpperCase()}
                      </span>
                      <span style={{ fontSize: '8px', color: 'var(--text-faint)' }}>ID: {tk.id}</span>
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-bright)', marginBottom: '8px', lineHeight: 1.2 }}>{tk.title}</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        onClick={() => { setView("workspace"); setNotifMenuOpen(false); }} 
                        style={{ padding: '4px 8px', background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', color: 'var(--signal)', fontSize: '9px', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        {t('ir_to_workspace')}
                      </button>
                      <button 
                        onClick={() => handleAssignToMe(tk.id)}
                        style={{ padding: '4px 8px', background: 'rgba(51,204,255,0.1)', border: '1px solid rgba(51,204,255,0.3)', color: 'var(--cyan)', fontSize: '9px', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        {t('assign_to_me')}
                      </button>
                    </div>
                  </div>
                )) : (
                  <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '11px' }}>{t('no_recent_incidents')}</div>
                )}
                {incidentCount > 0 && (
                  <button onClick={() => { setView("workspace"); setNotifMenuOpen(false); }} style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.3)', border: 'none', color: 'var(--amber)', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
                    {lang === 'es' ? 'VER TODOS LOS TICKETS' : 'VIEW ALL TICKETS'} ({incidentCount})
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {!tvMode && (
        <aside className="sidenav">
          <div className="sidenav__label">{t('modules')}</div>
          <NavBtn id="overview" label={t('overview')} sub={t('overview_sub')} icon="i-overview" />
          <NavBtn id="siem" label={t('siem')} sub={t('siem_sub')} icon="i-siem" badge={stats?.metrics?.total_alerts_24h?.toLocaleString()} color="danger" />
          {user?.role === 'admin' && <NavBtn id="assets" label={t('assets')} sub={t('assets_sub')} icon="i-assets" badge={stats?.metrics?.unique_agents} />}
          <NavBtn id="incidents" label={lang === 'es' ? 'Incidentes' : 'Incidents'} sub="Prioridad Alta" icon="i-incident" />
          {user?.role === 'admin' && <NavBtn id="monitors" label={lang === 'es' ? 'Monitores' : 'Monitors'} sub="Config SIEM" icon="i-threat" />}
          {user?.role === 'admin' && <NavBtn id="health" label={lang === 'es' ? 'Estado' : 'Health'} sub="Integraciones" icon="i-metrics" />}
          {user?.role === 'admin' && <NavBtn id="audit" label={lang === 'es' ? 'Auditoría' : 'Audit'} sub="Log del Sistema" icon="i-metrics" />}
          {user?.role === 'admin' && <NavBtn id="cowrie" label={t('cowrie')} sub={t('cowrie_sub')} icon="i-threat" badge="Ssh/Tel" color="amber" />}
          <NavBtn id="threat" label={t('threat_intel')} sub={t('threat_intel_sub')} icon="i-threat" badge="IOCs" />
          <NavBtn id="threatmap" label={t('threat_map')} sub={t('threat_map_sub')} icon="i-map" />
          {user?.role === 'admin' && <NavBtn id="lsamonitor" label={t('lsa_monitor')} sub={t('lsa_monitor_sub')} icon="i-overview" />}
          <NavBtn id="runbooks" label={t('runbooks')} sub={t('runbooks_sub')} icon="i-playbook" />
          <NavBtn id="workspace" label={t('workspace')} sub={t('workspace_sub')} icon="i-workspace" />
          {user?.role === 'admin' && <NavBtn id="executive-report" label={t('exec_report')} sub={t('exec_report_sub')} icon="i-metrics" />}
          {user?.role === 'admin' && <NavBtn id="users" label={t('users')} sub={t('users_sub')} icon="i-overview" />}
          
          <div className="sidenav__label" style={{ marginTop: 'auto' }}>{t('session')}</div>
          <div style={{ padding: '8px 14px', fontSize: '10px', color: 'var(--text-faint)', letterSpacing: '1.2px', lineHeight: '1.6' }}>
            ROOT@VALHALLA:~#<br/>
            SID: 0x7A4F · L3<br/>
            {t('operator')}: {user.username.toUpperCase()}
          </div>
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
                {view === 'incidents' && <IncidentsView />}
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
                {view === 'workspace' && <AnalystWorkspace lang={lang} currentUser={user!} initialData={workspaceData} onClearInitialData={() => setWorkspaceData(null)} />}
                {view === 'executive-report' && <ExecutiveReport lang={lang} />}
                {view === 'profile' && <ProfileView user={user} lang={lang} onUpdate={setUser} profilePic={profilePic} setProfilePic={updateProfilePic} />}
                {!['overview', 'assets', 'users', 'incidents', 'audit', 'settings', 'health', 'monitors', 'siem', 'threat', 'cowrie', 'threatmap', 'lsamonitor', 'runbooks', 'workspace', 'executive-report', 'profile'].includes(view) && (
                  <div className="panel" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ fontSize: '48px', opacity: 0.3 }}>404</div>
                    <div style={{ color: 'var(--text-dim)', letterSpacing: '2px', fontSize: '13px' }}>MÓDULO NO ENCONTRADO</div>
                    <button onClick={() => setView('overview')} style={{ padding: '8px 20px', background: 'rgba(60,255,158,0.1)', border: '1px solid var(--signal)', color: 'var(--signal)', cursor: 'pointer', borderRadius: '8px', fontSize: '11px', fontWeight: 600 }}>← VOLVER A OVERVIEW</button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        {/* Tweaks Panel */}
        {tweaksOpen && (
        <div className="tweaks-panel">
           <h4 className="tweaks-panel__title">// TEMAS</h4>
           <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ fontSize: '9px', letterSpacing: '2px', color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>ESQUEMA CROMÁTICO</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                 {['green', 'cyan', 'amber', 'purple'].map(s => (
                   <button key={s} onClick={() => setScheme(s)} className="action-btn" style={{ color: scheme === s ? '#000' : 'var(--text)' }}>
                     {scheme === s && <span style={{ position: 'absolute', inset: 0, background: 'var(--signal)', zIndex: -1 }} />}
                     {s.toUpperCase()}
                   </button>
                 ))}
              </div>
              <button onClick={toggleTheme} className="action-btn">
                {theme === 'dark' ? '☀ MODO CLARO' : '🌑 MODO OSCURO'}
              </button>
              <button onClick={() => setScanlines(!scanlines)} className="action-btn">SCANLINES: {scanlines ? 'ON' : 'OFF'}</button>
              <button onClick={() => setTvMode(!tvMode)} className={`action-btn ${tvMode ? 'active' : ''}`}>{t('tv_mode')}</button>
              <button onClick={() => setTweaksOpen(false)} className="action-btn" style={{ color: 'var(--danger)' }}>✕ CERRAR</button>
           </div>
        </div>
        )}

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
                <button className="chat-panel__action-btn" onClick={clearActiveChat} title={lang === 'es' ? 'Limpiar chat' : 'Clear chat'}>🗑</button>
                <button className="chat-panel__close" onClick={() => setChatOpen(false)}>✕</button>
              </div>
            </div>

            {/* Body: sidebar + main */}
            <div className="chat-body">
              {/* Sidebar */}
              <div className="chat-sidebar">
                <div className="chat-sidebar__label">CANALES</div>
                <button
                  className={`chat-sidebar__item${activeChatId === 'global' ? ' active' : ''}`}
                  onClick={() => { setActiveChatId('global'); setUnreadByChat(prev => ({ ...prev, global: 0 })); }}
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
                        // Historial se cargará automáticamente vía useEffect
                        setActiveChatId(dmId);
                        setUnreadByChat(prev => ({ ...prev, [dmId]: 0 }));
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
                                {msg.attachment.type === 'application/pdf' ? '📄' :
                                 msg.attachment.type.includes('spreadsheet') || msg.attachment.type.includes('excel') ? '📊' :
                                 msg.attachment.type === 'text/plain' ? '📝' : '📎'}
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
                  <div ref={chatEndRef} />
                </div>

                {/* Pending attachment preview */}
                {pendingAttachment && (
                  <div className="chat-attachment-preview">
                    {pendingAttachment.type.startsWith('image/') ? (
                      <img src={pendingAttachment.data} alt={pendingAttachment.name} />
                    ) : (
                      <span>📎 {pendingAttachment.name} ({(pendingAttachment.size / 1024).toFixed(0)} KB)</span>
                    )}
                    <button className="chat-attachment-preview__remove" onClick={() => setPendingAttachment(null)}>✕</button>
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
                          @{u.username.toUpperCase()} <span style={{ opacity: 0.5, fontSize: '9px' }}>{u.rank}</span>
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
                  <button className="chat-attach-btn" onClick={() => fileInputRef.current?.click()} title={lang === 'es' ? 'Adjuntar archivo' : 'Attach file'}>📎</button>
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
                      if (e.key === 'Escape') setShowMentionDrop(false);
                    }}
                    maxLength={500}
                    autoFocus
                  />
                  <button className="chat-panel__send" onClick={sendChatMessage} title="Enviar">➤</button>
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
