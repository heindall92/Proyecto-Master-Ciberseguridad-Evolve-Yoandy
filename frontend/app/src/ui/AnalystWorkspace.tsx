import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import logger from '../lib/logger';
import {
  listTickets, createTicket, updateTicket, assignTicket, resolveTicket, deleteTicket, purgeResolvedTickets,
  listUsers, listRunbooks, uploadEvidence, getEvidenceDownloadUrl, getTicketTimeline, addTicketComment, verifyEvidence, vtCheckIp,
  type TicketOut, type UserOut, type Runbook, type RunbookStep, type TicketEventOut, type TicketClassification,
} from '../lib/api';
import { playNotificationSound, playResolvedSound } from './audio';
import { useAppDispatch } from '../store/hooks';
import { navigateToIntel } from '../store/uiSlice';
import type { LucideIcon } from 'lucide-react';
import {
  Search, Plus, UserCheck, Siren, AlertTriangle, UserX, Timer, CircleCheckBig, ChevronLeft, ChevronRight,
  X, Trash2, FileText, Info, Bot, NotebookPen, BookOpen, Paperclip, Download, Upload, Users, ExternalLink,
  Copy, Clock, Globe, Server, User as UserIcon, Target, Hash, Save, ShieldCheck, Flag, Eraser,
  Link2, History, Send, Fingerprint, ShieldAlert, Percent, MessageSquare, Pencil, ArrowRightLeft,
  ListFilter, Check, RotateCcw, Columns3, Table2, ArrowUpDown, ArrowUp, ArrowDown, Download as DownloadIcon, ScanSearch,
} from 'lucide-react';
import { HoldButton, toast } from './premium/widgets';
import './premium/profile.css';
import './premium/workspace.css';

type Lang = 'es' | 'en';
type Status = 'open' | 'in_progress' | 'escalated' | 'resolved';
type Severity = 'critical' | 'high' | 'medium' | 'low';

const STATUSES: { id: Status; es: string; en: string; color: string }[] = [
  { id: 'open', es: 'Triaje', en: 'Triage', color: '#4a9eff' },
  { id: 'in_progress', es: 'Investigación', en: 'Investigation', color: '#e5a33a' },
  { id: 'escalated', es: 'Contención', en: 'Containment', color: '#ef5f6a' },
  { id: 'resolved', es: 'Resuelto', en: 'Resolved', color: '#3fb37f' },
];
const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];
const SEV_LABEL: Record<Severity, { es: string; en: string }> = {
  critical: { es: 'Crítico', en: 'Critical' }, high: { es: 'Alto', en: 'High' },
  medium: { es: 'Medio', en: 'Medium' }, low: { es: 'Bajo', en: 'Low' },
};
// Objetivo de resolución por severidad (horas). Se usa para el indicador de SLA.
const SLA_HOURS: Record<Severity, number> = { critical: 1, high: 4, medium: 24, low: 72 };
const EVIDENCE_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.txt', '.log', '.json', '.csv', '.pcap', '.zip'];
const MAX_EVIDENCE_MB = 10;
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

function fmtDuration(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function slaState(t: TicketOut): { label: string; state: 'ok' | 'warn' | 'breach' } {
  const end = t.status === 'resolved' && t.resolved_at ? new Date(t.resolved_at).getTime() : Date.now();
  const age = end - new Date(t.created_at).getTime();
  const limit = (SLA_HOURS[t.severity as Severity] ?? 24) * 3600000;
  const state = t.status === 'resolved' ? 'ok' : age > limit ? 'breach' : age > limit * 0.75 ? 'warn' : 'ok';
  return { label: fmtDuration(age), state };
}

const mitreUrl = (id: string) => {
  const m = id.trim().toUpperCase().match(/^T(\d{4})(?:\.(\d{3}))?$/);
  return m ? `https://attack.mitre.org/techniques/T${m[1]}/${m[2] ? `${m[2]}/` : ''}` : null;
};
const CLASSIFICATIONS: { id: TicketClassification; es: string; en: string; hint_es: string; hint_en: string }[] = [
  { id: 'true_positive', es: 'Verdadero positivo', en: 'True positive', hint_es: 'Actividad maliciosa real', hint_en: 'Real malicious activity' },
  { id: 'false_positive', es: 'Falso positivo', en: 'False positive', hint_es: 'La detección se equivocó', hint_en: 'The detection was wrong' },
  { id: 'benign', es: 'Benigno', en: 'Benign', hint_es: 'Real pero autorizado o esperado', hint_en: 'Real but authorised or expected' },
];
const EVENT_ICON: Record<string, LucideIcon> = {
  created: Plus, status: ArrowRightLeft, assigned: UserCheck, notes: Pencil, evidence: Paperclip,
  evidence_verified: Fingerprint, resolved: CircleCheckBig, comment: MessageSquare, alert_linked: Link2, severity: ShieldAlert,
};

const stepText = (s: RunbookStep) => (typeof s === 'string' ? s : s.text);
const stepCmd = (s: RunbookStep) => (typeof s === 'string' ? undefined : s.command);

const EMPTY_FORM = { title: '', description: '', severity: 'medium', category: '', source_ip: '', affected_asset: '', affected_user: '', mitre_technique: '', assigned_to_id: '' };

type ViewMode = 'kanban' | 'table';
type SortKey = 'id' | 'severity' | 'title' | 'status' | 'assignee' | 'sla' | 'created';
const SEV_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
const STATUS_RANK: Record<string, number> = { open: 1, in_progress: 2, escalated: 3, resolved: 4 };

export default function AnalystWorkspace({ lang = 'es', initialData, onClearInitialData, currentUser, initialMode }: {
  lang?: Lang; initialData?: any; onClearInitialData?: () => void; currentUser: UserOut; initialMode?: ViewMode;
}) {
  const es = lang === 'es';
  const dispatch = useAppDispatch();
  const [tickets, setTickets] = useState<TicketOut[]>([]);
  const [users, setUsers] = useState<UserOut[]>([]);
  const [runbooks, setRunbooks] = useState<Runbook[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [filterSev, setFilterSev] = useState<string>('all');
  const [filterAnalyst, setFilterAnalyst] = useState<string>('all');
  const [onlyMine, setOnlyMine] = useState(false);
  const [quickFilter, setQuickFilter] = useState<'none' | 'unassigned' | 'breach'>('none');

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mode, setMode] = useState<ViewMode>(() => {
    if (initialMode) return initialMode;
    try { return (localStorage.getItem('valhalla.workspace.mode') as ViewMode) || 'kanban'; } catch { return 'kanban'; }
  });
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'created', dir: -1 });
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [vt, setVt] = useState<{ ip: string; loading: boolean; data?: any; error?: string } | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [overCol, setOverCol] = useState<Status | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeRunbook, setActiveRunbook] = useState<number | null>(null);
  const [doneSteps, setDoneSteps] = useState<Record<string, boolean>>({});
  const [assignTo, setAssignTo] = useState<string>('');

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [resolveFor, setResolveFor] = useState<number | null>(null);
  const [resolveNotes, setResolveNotes] = useState('');
  const [resolveClass, setResolveClass] = useState<TicketClassification | ''>('');
  const [timeline, setTimeline] = useState<TicketEventOut[] | null>(null);
  const [comment, setComment] = useState('');
  const [verified, setVerified] = useState<Record<number, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const canDelete = ['admin', 'analyst', 'analista'].includes((currentUser?.role || '').toLowerCase());
  const selected = tickets.find((t) => t.id === selectedId) || null;
  const statusLabel = (s: Status) => { const x = STATUSES.find((c) => c.id === s)!; return es ? x.es : x.en; };
  const sevLabel = (s: string) => (SEV_LABEL[s as Severity] ? SEV_LABEL[s as Severity][lang] : s);
  const errText = (e: unknown) => String(e).replace(/^Error:\s*/, '').replace(/^HTTP \d+:\s*/, '');

  const fetchData = useCallback(async () => {
    const [tk, us, rb] = await Promise.all([
      listTickets(undefined, undefined, 500, 0, false).catch((e) => { logger.error('[Workspace] tickets', e); return null; }),
      listUsers().catch(() => null),
      listRunbooks().catch(() => null),
    ]);
    if (tk) setTickets(tk);
    // El usuario de sistema del chatbot no es un analista asignable
    if (us) setUsers(us.filter((u) => u.username.toLowerCase() !== 'valhalla-ia'));
    if (rb) setRunbooks(rb);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 60000);
    return () => clearInterval(iv);
  }, [fetchData]);

  // Alta precargada desde otra vista (p. ej. Threat Intel → "Crear incidente")
  useEffect(() => {
    if (!initialData) return;
    setForm({ ...EMPTY_FORM, title: initialData.title || '', source_ip: initialData.source_ip || '', affected_asset: initialData.affected_asset || '', description: initialData.description || '' });
    setShowCreate(true);
    onClearInitialData?.();
  }, [initialData, onClearInitialData]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (resolveFor !== null) setResolveFor(null);
      else if (showCreate) setShowCreate(false);
      else if (selectedId !== null) setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showCreate, selectedId, resolveFor]);

  useEffect(() => { try { localStorage.setItem('valhalla.workspace.mode', mode); } catch { /* sin almacenamiento */ } }, [mode]);
  useEffect(() => { if (initialMode) setMode(initialMode); }, [initialMode]);
  useEffect(() => { setVt(null); }, [selectedId]);

  const loadTimeline = useCallback(async (id: number) => {
    try { setTimeline(await getTicketTimeline(id)); } catch { setTimeline([]); }
  }, []);
  useEffect(() => { if (selectedId !== null) loadTimeline(selectedId); else setTimeline(null); }, [selectedId, loadTimeline]);
  const refreshSelected = async () => { await fetchData(); if (selectedId !== null) loadTimeline(selectedId); };

  const openTicket = (t: TicketOut) => {
    setSelectedId(t.id);
    setNotes(t.analysis_notes || '');
    setActiveRunbook(null);
    setAssignTo(t.assigned_to_id ? String(t.assigned_to_id) : '');
  };

  // Único camino para cambiar de estado: "resuelto" siempre pasa por /resolve con notas.
  const moveTicket = async (id: number, status: Status) => {
    const t = tickets.find((x) => x.id === id);
    if (!t || t.status === status) return;
    if (status === 'resolved') { setResolveFor(id); setResolveNotes(''); setResolveClass(''); return; }
    setTickets((prev) => prev.map((x) => (x.id === id ? { ...x, status } : x)));
    try {
      await updateTicket(id, { status });
      if (t.status === 'resolved') playNotificationSound();
      toast(es ? `#${id} movido a ${statusLabel(status)}.` : `#${id} moved to ${statusLabel(status)}.`, 'ok');
    } catch (e) {
      toast(errText(e), 'err');
    }
    refreshSelected();
  };

  const confirmResolve = async () => {
    if (resolveFor === null || !resolveNotes.trim() || !resolveClass) return;
    setBusy(true);
    try {
      await resolveTicket(resolveFor, resolveNotes.trim(), resolveClass);
      playResolvedSound();
      toast(es ? `Incidente #${resolveFor} resuelto.` : `Incident #${resolveFor} resolved.`, 'ok');
      setResolveFor(null);
      await refreshSelected();
    } catch (e) {
      toast(errText(e), 'err');
    } finally { setBusy(false); }
  };

  const saveNotes = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await updateTicket(selected.id, { analysis_notes: notes });
      setTickets((prev) => prev.map((x) => (x.id === selected.id ? { ...x, analysis_notes: notes } : x)));
      toast(es ? 'Notas guardadas.' : 'Notes saved.', 'ok');
      loadTimeline(selected.id);
    } catch (e) { toast(errText(e), 'err'); } finally { setBusy(false); }
  };

  const doAssign = async (userId: number) => {
    if (!selected) return;
    setBusy(true);
    try {
      await assignTicket(selected.id, userId);
      const who = users.find((u) => u.id === userId)?.username || '';
      toast(es ? `#${selected.id} asignado a ${who}.` : `#${selected.id} assigned to ${who}.`, 'ok');
      await refreshSelected();
    } catch (e) { toast(errText(e), 'err'); } finally { setBusy(false); }
  };

  const doDelete = async (id: number) => {
    try {
      await deleteTicket(id);
      if (selectedId === id) setSelectedId(null);
      toast(es ? `Incidente #${id} eliminado.` : `Incident #${id} deleted.`, 'ok');
      fetchData();
    } catch (e) { toast(errText(e), 'err'); }
  };

  const doPurge = async () => {
    try {
      const r = await purgeResolvedTickets(30);
      toast(es ? `${r.deleted} incidentes resueltos hace más de 30 días eliminados.` : `${r.deleted} incidents resolved over 30 days ago deleted.`, 'ok');
      fetchData();
    } catch (e) { toast(errText(e), 'err'); }
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!selected || !file) return;
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!EVIDENCE_EXT.includes(ext)) { toast(es ? `Tipo no permitido. Usa: ${EVIDENCE_EXT.join(' ')}` : `File type not allowed. Use: ${EVIDENCE_EXT.join(' ')}`, 'err'); return; }
    if (file.size > MAX_EVIDENCE_MB * 1024 * 1024) { toast(es ? `El fichero supera ${MAX_EVIDENCE_MB} MB.` : `File exceeds ${MAX_EVIDENCE_MB} MB.`, 'err'); return; }
    setBusy(true);
    try {
      const ev = await uploadEvidence(selected.id, file);
      setTickets((prev) => prev.map((x) => (x.id === selected.id ? { ...x, evidence: [...(x.evidence || []), ev] } : x)));
      toast(es ? `Evidencia adjuntada · SHA-256 ${ev.sha256?.slice(0, 12)}…` : `Evidence attached · SHA-256 ${ev.sha256?.slice(0, 12)}…`, 'ok');
      loadTimeline(selected.id);
    } catch (err) { toast(errText(err), 'err'); } finally { setBusy(false); }
  };

  const scanVt = async (ip: string) => {
    setVt({ ip, loading: true });
    try {
      const data = await vtCheckIp(ip);
      if (data?.error) setVt({ ip, loading: false, error: String(data.error) });
      else setVt({ ip, loading: false, data });
    } catch (e) {
      setVt({ ip, loading: false, error: errText(e) });
    }
  };

  const bulkAssignMe = async () => {
    const ids = [...checked];
    setBusy(true);
    const res = await Promise.allSettled(ids.map((id) => assignTicket(id, currentUser.id)));
    const ok = res.filter((r) => r.status === 'fulfilled').length;
    toast(es ? `${ok} de ${ids.length} incidentes asignados a ti.` : `${ok} of ${ids.length} incidents assigned to you.`, ok === ids.length ? 'ok' : 'err');
    setChecked(new Set());
    setBusy(false);
    fetchData();
  };

  const bulkMove = async (status: Status) => {
    const ids = [...checked].filter((id) => tickets.find((t) => t.id === id)?.status !== status);
    if (status === 'resolved') { toast(es ? 'Resuelve los incidentes uno a uno: cada cierre necesita clasificación y notas.' : 'Resolve incidents one by one: each needs classification and notes.', 'info'); return; }
    setBusy(true);
    const res = await Promise.allSettled(ids.map((id) => updateTicket(id, { status })));
    const ok = res.filter((r) => r.status === 'fulfilled').length;
    toast(es ? `${ok} incidentes movidos a ${statusLabel(status)}.` : `${ok} incidents moved to ${statusLabel(status)}.`, 'ok');
    setChecked(new Set());
    setBusy(false);
    fetchData();
  };

  const exportCsv = (rows: TicketOut[]) => {
    const cols: [string, (t: TicketOut) => unknown][] = [
      ['id', (t) => t.id], ['titulo', (t) => t.title], ['severidad', (t) => t.severity], ['fase', (t) => t.status],
      ['asignado', (t) => t.assignee_username || ''], ['ip_origen', (t) => t.source_ip || ''], ['activo', (t) => t.affected_asset || ''],
      ['mitre', (t) => t.mitre_technique || ''], ['clasificacion', (t) => t.classification || ''], ['alertas', (t) => t.alerts?.length || 0],
      ['creado', (t) => t.created_at], ['resuelto', (t) => t.resolved_at || ''],
    ];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.map((c) => c[0]).join(','), ...rows.map((t) => cols.map((c) => esc(c[1](t))).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `valhalla-incidentes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(es ? `${rows.length} incidentes exportados.` : `${rows.length} incidents exported.`, 'ok');
  };

  const postComment = async () => {
    if (!selected || !comment.trim()) return;
    setBusy(true);
    try {
      await addTicketComment(selected.id, comment.trim());
      setComment('');
      loadTimeline(selected.id);
    } catch (e) { toast(errText(e), 'err'); } finally { setBusy(false); }
  };

  const doVerify = async (evidenceId: number) => {
    try {
      const r = await verifyEvidence(evidenceId);
      setVerified((v) => ({ ...v, [evidenceId]: r.ok }));
      toast(r.ok
        ? (es ? 'Integridad verificada: el SHA-256 coincide con el registrado.' : 'Integrity verified: SHA-256 matches.')
        : (es ? 'ALERTA: el fichero ha cambiado desde que se registró.' : 'WARNING: the file changed since it was registered.'), r.ok ? 'ok' : 'err');
      if (selected) loadTimeline(selected.id);
    } catch (e) { toast(errText(e), 'err'); }
  };

  const openInWazuh = async (alertId: string) => {
    try { await navigator.clipboard.writeText(alertId); } catch { /* sin portapapeles */ }
    window.open(`https://${window.location.hostname}/app/threat-hunting`, '_blank', 'noopener,noreferrer');
    toast(es ? 'ID de la alerta copiado: pégalo en el buscador de Wazuh (_id).' : 'Alert ID copied: paste it in the Wazuh search (_id).', 'info');
  };

  const formErrors = {
    title: !form.title.trim() ? (es ? 'El título es obligatorio' : 'Title is required') : '',
    source_ip: form.source_ip && !IPV4.test(form.source_ip.trim()) ? (es ? 'IPv4 no válida' : 'Invalid IPv4') : '',
    mitre: form.mitre_technique && !mitreUrl(form.mitre_technique) ? (es ? 'Formato T1234 o T1234.001' : 'Format T1234 or T1234.001') : '',
  };
  const formValid = !formErrors.title && !formErrors.source_ip && !formErrors.mitre;

  const submitCreate = async () => {
    if (!formValid) return;
    setBusy(true);
    try {
      const t = await createTicket({
        title: form.title.trim(),
        description: form.description || null,
        severity: form.severity,
        category: form.category || null,
        source_ip: form.source_ip.trim() || null,
        affected_asset: form.affected_asset || null,
        affected_user: form.affected_user || null,
        mitre_technique: form.mitre_technique.trim().toUpperCase() || null,
        assigned_to_id: form.assigned_to_id ? Number(form.assigned_to_id) : null,
      });
      setShowCreate(false);
      setForm({ ...EMPTY_FORM });
      toast(es ? `Incidente #${t.id} creado.` : `Incident #${t.id} created.`, 'ok');
      await fetchData();
    } catch (e) { toast(errText(e), 'err'); } finally { setBusy(false); }
  };

  // ---------- Filtros e indicadores ----------
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter((t) => {
      if (filterSev !== 'all' && t.severity !== filterSev) return false;
      if (onlyMine && t.assigned_to_id !== currentUser.id) return false;
      if (filterAnalyst === 'unassigned' && t.assigned_to_id) return false;
      if (filterAnalyst !== 'all' && filterAnalyst !== 'unassigned' && t.assignee_username !== filterAnalyst) return false;
      if (quickFilter === 'unassigned' && t.assigned_to_id) return false;
      if (quickFilter === 'breach' && slaState(t).state !== 'breach') return false;
      if (q && !`#${t.id} ${t.title} ${t.source_ip || ''} ${t.affected_asset || ''} ${t.mitre_technique || ''} ${t.category || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tickets, query, filterSev, onlyMine, filterAnalyst, quickFilter, currentUser.id]);

  const activeFilters = (filterSev !== 'all' ? 1 : 0) + (filterAnalyst !== 'all' ? 1 : 0) + (onlyMine ? 1 : 0) + (quickFilter !== 'none' ? 1 : 0);
  const sortedRows = useMemo(() => {
    const val = (t: TicketOut): number | string => {
      switch (sort.key) {
        case 'id': return t.id;
        case 'severity': return SEV_RANK[t.severity] || 0;
        case 'title': return t.title.toLowerCase();
        case 'status': return STATUS_RANK[t.status] || 0;
        case 'assignee': return (t.assignee_username || '~').toLowerCase();
        case 'sla': return t.status === 'resolved' ? Number.MAX_SAFE_INTEGER : new Date(t.created_at).getTime() + (SLA_HOURS[t.severity as Severity] ?? 24) * 3600000;
        default: return new Date(t.created_at).getTime();
      }
    };
    return [...filtered].sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  }, [filtered, sort]);
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'title' || key === 'assignee' ? 1 : -1 }));

  const active = tickets.filter((t) => t.status !== 'resolved');
  const breached = active.filter((t) => slaState(t).state === 'breach').length;
  const unassigned = active.filter((t) => !t.assigned_to_id).length;
  const resolvedWithTime = tickets.filter((t) => t.status === 'resolved' && t.resolved_at);
  const classified = tickets.filter((t) => t.status === 'resolved' && t.classification);
  const fpRate = classified.length ? Math.round((classified.filter((t) => t.classification === 'false_positive').length / classified.length) * 100) : null;
  const mttr = resolvedWithTime.length
    ? resolvedWithTime.reduce((s, t) => s + (new Date(t.resolved_at!).getTime() - new Date(t.created_at).getTime()), 0) / resolvedWithTime.length
    : null;

  const suggestedRunbooks = useMemo(() => {
    if (!selected) return [];
    const cat = (selected.category || '').toLowerCase();
    const text = `${selected.title} ${selected.description || ''}`.toLowerCase();
    return runbooks
      .filter((rb) => rb.is_active !== false)
      .map((rb) => {
        const rc = (rb.category || '').toLowerCase();
        let score = 0;
        if (cat && rc && (rc.includes(cat) || cat.includes(rc))) score += 3;
        if (rc && text.includes(rc)) score += 2;
        rb.name.toLowerCase().split(/\W+/).filter((w) => w.length > 3).forEach((w) => { if (text.includes(w)) score += 1; });
        if (rb.severity_applicable === selected.severity) score += 1;
        return { rb, score };
      })
      .filter((x) => x.score > 0 || x.rb.severity_applicable === 'all')
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((x) => x.rb);
  }, [selected, runbooks]);

  const interpolate = (s: string) => !selected ? s : s
    .replace(/{{ip}}/g, selected.source_ip || 'N/A')
    .replace(/{{asset}}/g, selected.affected_asset || 'N/A')
    .replace(/{{user}}/g, selected.affected_user || 'N/A');

  if (loading) {
    return <div className="wk"><div className="vx-empty"><Clock size={22} />{es ? 'Cargando incidentes…' : 'Loading incidents…'}</div></div>;
  }

  const Stat = ({ icon: Icon, tone, value, label, onClick, pressed }: { icon: LucideIcon; tone: string; value: React.ReactNode; label: string; onClick?: () => void; pressed?: boolean }) => {
    const Tag = onClick ? 'button' : 'div';
    return (
      <Tag className="wk-stat" style={{ ['--tone' as string]: tone }} onClick={onClick} aria-pressed={onClick ? pressed : undefined} type={onClick ? 'button' : undefined}>
        <span className="wk-stat__icon"><Icon size={16} /></span>
        <div><div className="wk-stat__value">{value}</div><div className="wk-stat__label">{label}</div></div>
      </Tag>
    );
  };

  return (
    <div className="wk">
      <div className="wk-head">
        <div>
          <h1>{es ? 'Workspace de incidentes' : 'Incident workspace'}</h1>
          <p>{es ? 'Triaje, investigación y contención. Arrastra las tarjetas o usa las flechas para cambiar de fase.' : 'Triage, investigation and containment. Drag cards or use the arrows to change phase.'}</p>
        </div>
        <div className="wk-tools">
          <label className="wk-search">
            <Search size={15} />
            <input className="vp-bare-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={es ? 'Buscar incidente…' : 'Search incident…'} title={es ? 'Busca por #id, título, IP, activo, MITRE o categoría' : 'Search by #id, title, IP, asset, MITRE or category'} />
            {query && <button className="wk-search__clear" onClick={() => setQuery('')} aria-label={es ? 'Borrar búsqueda' : 'Clear search'}><X size={13} /></button>}
          </label>
          <div className="wk-filter">
            <button className="wk-iconbtn" aria-expanded={filtersOpen} aria-haspopup="dialog" onClick={() => setFiltersOpen(!filtersOpen)} title={es ? 'Filtros' : 'Filters'} aria-label={es ? 'Filtros' : 'Filters'}>
              <ListFilter size={17} />
              {activeFilters > 0 && <span className="vp-badge">{activeFilters}</span>}
            </button>
            {filtersOpen && (
              <>
                <div className="wk-filter__backdrop" onClick={() => setFiltersOpen(false)} />
                <div className="vp-pop wk-filter__pop" role="dialog" aria-label={es ? 'Filtros' : 'Filters'}>
                  <div className="vp-pop__head"><ListFilter size={15} color="var(--signal)" /><div className="vp-pop__title">{es ? 'Filtros' : 'Filters'}</div></div>
                  <div className="vp-pop__body">
                    <div className="vp-menu-label">{es ? 'Severidad' : 'Severity'}</div>
                    <div className="wk-chipset">
                      <button aria-pressed={filterSev === 'all'} onClick={() => setFilterSev('all')}>{es ? 'Todas' : 'All'}</button>
                      {SEVERITIES.map((sv) => (
                        <button key={sv} aria-pressed={filterSev === sv} onClick={() => setFilterSev(sv)} className={`wk-chipset__sev vx-sev--${sv}`}>{sevLabel(sv)}</button>
                      ))}
                    </div>
                    <div className="vp-menu-label">{es ? 'Analista' : 'Analyst'}</div>
                    <div className="wk-filter__list">
                      {[{ v: 'all', l: es ? 'Todos' : 'All' }, { v: 'unassigned', l: es ? 'Sin asignar' : 'Unassigned' }, ...users.map((u) => ({ v: u.username, l: u.username }))].map((o) => (
                        <button key={o.v} className="vp-menu-item" aria-pressed={filterAnalyst === o.v} onClick={() => setFilterAnalyst(o.v)}>
                          {o.v === 'unassigned' ? <UserX size={15} /> : o.v === 'all' ? <Users size={15} /> : <UserIcon size={15} />}{o.l}
                          {filterAnalyst === o.v && <Check size={14} style={{ marginLeft: 'auto', color: 'var(--signal)' }} />}
                        </button>
                      ))}
                    </div>
                    <div className="vp-menu-sep" />
                    <div className="vp-switch-row" role="switch" aria-checked={onlyMine} tabIndex={0} onClick={() => setOnlyMine(!onlyMine)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOnlyMine(!onlyMine)}>
                      <UserCheck size={16} />
                      <div>{es ? 'Solo mis incidentes' : 'Only my incidents'}</div>
                      <span className="vp-switch" data-on={onlyMine} />
                    </div>
                  </div>
                  <div className="vp-pop__foot">
                    <button className="vp-menu-item" disabled={activeFilters === 0} onClick={() => { setFilterSev('all'); setFilterAnalyst('all'); setOnlyMine(false); setQuickFilter('none'); }}><RotateCcw size={15} />{es ? 'Limpiar filtros' : 'Clear filters'}</button>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="vx-seg wk-mode" role="group" aria-label={es ? 'Vista' : 'View'}>
            <button aria-pressed={mode === 'kanban'} onClick={() => setMode('kanban')} title="Kanban" aria-label="Kanban"><Columns3 size={15} /></button>
            <button aria-pressed={mode === 'table'} onClick={() => setMode('table')} title={es ? 'Tabla' : 'Table'} aria-label={es ? 'Tabla' : 'Table'}><Table2 size={15} /></button>
          </div>
          {mode === 'table' && <button className="wk-iconbtn" onClick={() => exportCsv(sortedRows)} disabled={sortedRows.length === 0} title={es ? 'Exportar a CSV' : 'Export CSV'} aria-label={es ? 'Exportar a CSV' : 'Export CSV'}><DownloadIcon size={17} /></button>}
          <button className="vp-btn vp-btn--primary wk-new" onClick={() => { setForm({ ...EMPTY_FORM }); setShowCreate(true); }} title={es ? 'Nuevo incidente' : 'New incident'}><Plus size={15} /><span>{es ? 'Nuevo' : 'New'}</span></button>
        </div>
      </div>

      <div className="wk-stats">
        <Stat icon={Siren} tone="var(--signal)" value={active.length} label={es ? 'Activos' : 'Active'} />
        <Stat icon={AlertTriangle} tone="var(--danger)" value={breached} label={es ? 'Fuera de SLA' : 'SLA breached'} onClick={() => setQuickFilter(quickFilter === 'breach' ? 'none' : 'breach')} pressed={quickFilter === 'breach'} />
        <Stat icon={UserX} tone="var(--amber)" value={unassigned} label={es ? 'Sin asignar' : 'Unassigned'} onClick={() => setQuickFilter(quickFilter === 'unassigned' ? 'none' : 'unassigned')} pressed={quickFilter === 'unassigned'} />
        <Stat icon={Timer} tone="var(--cyan)" value={mttr === null ? '—' : fmtDuration(mttr)} label={es ? 'Tiempo medio de resolución' : 'Mean time to resolve'} />
        <Stat icon={CircleCheckBig} tone="#3fb37f" value={tickets.length - active.length} label={es ? 'Resueltos' : 'Resolved'} />
        <Stat icon={Percent} tone="var(--text-dim)" value={fpRate === null ? '—' : `${fpRate}%`} label={es ? 'Falsos positivos' : 'False positives'} />
      </div>

      {mode === 'table' && (
        <section className="vx-card wk-tablecard">
          {checked.size > 0 && (
            <div className="wk-bulk">
              <span>{checked.size} {es ? 'seleccionados' : 'selected'}</span>
              <button className="vx-mini-btn" onClick={bulkAssignMe} disabled={busy}><UserCheck size={12} />{es ? 'Asignarme' : 'Assign me'}</button>
              {STATUSES.filter((st) => st.id !== 'resolved').map((st) => (
                <button key={st.id} className="vx-mini-btn" onClick={() => bulkMove(st.id)} disabled={busy} style={{ ['--col' as string]: st.color }}><span className="wk-dot" />{es ? st.es : st.en}</button>
              ))}
              <button className="vx-iconbtn" onClick={() => setChecked(new Set())} aria-label={es ? 'Quitar selección' : 'Clear selection'} style={{ marginLeft: 'auto' }}><X size={14} /></button>
            </div>
          )}
          <div className="vx-card__body">
            <div className="vx-table wk-table">
              <div className="vx-table__head">
                <span><input type="checkbox" aria-label={es ? 'Seleccionar todo' : 'Select all'} checked={sortedRows.length > 0 && sortedRows.every((t) => checked.has(t.id))} onChange={(e) => setChecked(e.target.checked ? new Set(sortedRows.map((t) => t.id)) : new Set())} /></span>
                {([['id', '#'], ['severity', es ? 'Sev.' : 'Sev.'], ['title', es ? 'Título' : 'Title'], ['status', es ? 'Fase' : 'Phase'], ['assignee', es ? 'Asignado' : 'Assignee'], ['sla', 'SLA'], ['created', es ? 'Creado' : 'Created']] as [SortKey, string][]).map(([k, l]) => (
                  <button key={k} className="wk-th" onClick={() => toggleSort(k)} aria-sort={sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                    {l}{sort.key === k ? (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ArrowUpDown size={11} className="wk-th__idle" />}
                  </button>
                ))}
              </div>
              {sortedRows.length === 0 && <div className="vx-empty" style={{ height: 180 }}><Siren size={22} />{es ? 'Sin incidentes con estos filtros' : 'No incidents match these filters'}</div>}
              {sortedRows.map((t) => {
                const sla = slaState(t);
                const st = STATUSES.find((x) => x.id === t.status);
                return (
                  <div key={t.id} className={`vx-table__row wk-trow${checked.has(t.id) ? ' wk-trow--checked' : ''}`} onClick={() => openTicket(t)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') openTicket(t); }}>
                    <span onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`#${t.id}`} checked={checked.has(t.id)} onChange={(e) => setChecked((prev) => { const n = new Set(prev); if (e.target.checked) n.add(t.id); else n.delete(t.id); return n; })} /></span>
                    <span className="vx-muted">#{t.id}</span>
                    <span><span className={`vx-sev vx-sev--${t.severity}`}>{sevLabel(t.severity)}</span></span>
                    <span title={t.title}>{t.title}{(t.alerts?.length || 0) > 1 && <span className="sv-count"><Link2 size={10} />{t.alerts.length}</span>}</span>
                    <span><span className="wk-phase" style={{ ['--col' as string]: st?.color }}><span className="wk-dot" />{st ? (es ? st.es : st.en) : t.status}</span></span>
                    <span className={t.assignee_username ? '' : 'wk-assignee--none'}>{t.assignee_username || (es ? 'Sin asignar' : 'Unassigned')}</span>
                    <span><span className={`wk-sla wk-sla--${sla.state}`} style={{ marginLeft: 0 }}><Clock size={10} />{sla.label}</span></span>
                    <span className="vx-muted">{new Date(t.created_at).toLocaleString(lang, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {mode === 'kanban' && <div className="wk-board">
        {STATUSES.map((col, colIdx) => {
          const colTickets = filtered.filter((t) => t.status === col.id);
          return (
            <section
              key={col.id}
              className={`wk-col${overCol === col.id ? ' wk-col--over' : ''}`}
              style={{ ['--col' as string]: col.color }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverCol(col.id); }}
              onDragLeave={() => setOverCol(null)}
              onDrop={(e) => { e.preventDefault(); setOverCol(null); if (draggedId !== null) moveTicket(draggedId, col.id); setDraggedId(null); }}
              aria-label={statusLabel(col.id)}
            >
              <div className="wk-col__head">
                <span className="wk-col__dot" />
                <span className="wk-col__title">{es ? col.es : col.en}</span>
                <span className="wk-col__count">{colTickets.length}</span>
                {col.id === 'resolved' && canDelete && colTickets.length > 0 && (
                  <span className="wk-col__tools">
                    <HoldButton onConfirm={doPurge} title={es ? 'Mantén pulsado para eliminar los resueltos de más de 30 días' : 'Hold to delete incidents resolved over 30 days ago'}><Eraser size={12} />30d+</HoldButton>
                  </span>
                )}
              </div>
              <div className="wk-col__body">
                {colTickets.length === 0 && <div className="wk-col__empty">{es ? 'Sin incidentes' : 'No incidents'}</div>}
                {colTickets.map((t) => {
                  const sla = slaState(t);
                  const prev = STATUSES[colIdx - 1];
                  const next = STATUSES[colIdx + 1];
                  return (
                    <div
                      key={t.id}
                      className={`wk-card wk-sev-${t.severity}${t.severity === 'critical' ? ' wk-card--crit' : ''}${draggedId === t.id ? ' wk-card--drag' : ''}`}
                      draggable
                      tabIndex={0}
                      role="button"
                      aria-label={`${es ? 'Incidente' : 'Incident'} #${t.id}: ${t.title}`}
                      onDragStart={(e) => { setDraggedId(t.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(t.id)); }}
                      onDragEnd={() => { setDraggedId(null); setOverCol(null); }}
                      onClick={() => openTicket(t)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTicket(t); } }}
                    >
                      <div className="wk-card__top">
                        <span className={`vx-sev vx-sev--${t.severity}`}>{sevLabel(t.severity)}</span>
                        <span>#{t.id}</span>
                        <span className={`wk-sla wk-sla--${sla.state}`} title={es ? `Objetivo: ${SLA_HOURS[t.severity as Severity] ?? 24} h` : `Target: ${SLA_HOURS[t.severity as Severity] ?? 24} h`}><Clock size={10} />{sla.label}</span>
                      </div>
                      <div className="wk-card__title">{t.title}</div>
                      <div className="wk-chips">
                        {t.source_ip && <span className="wk-chip"><Globe size={10} />{t.source_ip}</span>}
                        {t.affected_asset && <span className="wk-chip"><Server size={10} />{t.affected_asset}</span>}
                        {t.mitre_technique && <span className="wk-chip"><Target size={10} />{t.mitre_technique}</span>}
                        {(t.alerts?.length || 0) > 1 && <span className="wk-chip" title={es ? 'Alertas correlacionadas' : 'Correlated alerts'}><Link2 size={10} />{t.alerts.length}</span>}
                        {t.ai_summary && <span className="wk-chip wk-chip--ai"><Bot size={10} />IA</span>}
                        {(t.evidence?.length || 0) > 0 && <span className="wk-chip"><Paperclip size={10} />{t.evidence.length}</span>}
                      </div>
                      <div className="wk-card__foot">
                        {t.assignee_username ? (
                          <span className="wk-assignee"><span className="wk-av">{t.assignee_username[0].toUpperCase()}</span>{t.assignee_username}</span>
                        ) : (
                          <span className="wk-assignee wk-assignee--none"><span className="wk-av wk-av--none">?</span>{es ? 'Sin asignar' : 'Unassigned'}</span>
                        )}
                        <span className="wk-move" onClick={(e) => e.stopPropagation()}>
                          {prev && <button onClick={() => moveTicket(t.id, prev.id)} title={`${es ? 'Mover a' : 'Move to'} ${es ? prev.es : prev.en}`} aria-label={`${es ? 'Mover a' : 'Move to'} ${es ? prev.es : prev.en}`}><ChevronLeft size={14} /></button>}
                          {next && <button onClick={() => moveTicket(t.id, next.id)} title={`${es ? 'Mover a' : 'Move to'} ${es ? next.es : next.en}`} aria-label={`${es ? 'Mover a' : 'Move to'} ${es ? next.es : next.en}`}><ChevronRight size={14} /></button>}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>}

      {/* ---------- Detalle ---------- */}
      {selected && createPortal(
        <>
          <div className="wk-drawer-backdrop" onClick={() => setSelectedId(null)} aria-hidden="true" />
          <aside className="wk-drawer" role="dialog" aria-modal="true" aria-labelledby="wk-drawer-title">
            <div className="wk-drawer__head">
              <span className={`vx-sev vx-sev--${selected.severity}`}>{sevLabel(selected.severity)}</span>
              <span className="wk-drawer__id">#{selected.id}</span>
              <span className={`wk-sla wk-sla--${slaState(selected).state}`}><Clock size={11} />{slaState(selected).label}</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                {canDelete && <HoldButton onConfirm={() => doDelete(selected.id)} title={es ? 'Mantén pulsado para eliminar el incidente' : 'Hold to delete incident'}><Trash2 size={12} />{es ? 'Eliminar' : 'Delete'}</HoldButton>}
                <button className="vx-iconbtn" onClick={() => setSelectedId(null)} aria-label={es ? 'Cerrar' : 'Close'}><X size={16} /></button>
              </span>
            </div>

            <div className="wk-drawer__scroll">
              <h2 className="wk-drawer__title" id="wk-drawer-title">{selected.title}</h2>

              <div className="wk-status" role="group" aria-label={es ? 'Fase' : 'Phase'}>
                {STATUSES.map((s) => (
                  <button key={s.id} style={{ ['--col' as string]: s.color }} aria-pressed={selected.status === s.id} onClick={() => moveTicket(selected.id, s.id)}>{es ? s.es : s.en}</button>
                ))}
              </div>

              <section className="wk-section">
                <div className="wk-section__head"><Info size={14} />{es ? 'Datos del incidente' : 'Incident data'}</div>
                <div className="wk-section__body">
                  <div className="wk-facts">
                    <div><div className="wk-fact__k">{es ? 'IP origen' : 'Source IP'}</div><div className="wk-fact__v">{selected.source_ip ? <>
                      <button className="wk-link" onClick={() => { setSelectedId(null); dispatch(navigateToIntel(selected.source_ip!)); }} title={es ? 'Abrir en Threat Intel' : 'Open in Threat Intel'}><Globe size={12} />{selected.source_ip}</button>
                      <button className="vx-iconbtn" style={{ width: 24, height: 24 }} onClick={() => scanVt(selected.source_ip!)} disabled={vt?.loading} title={es ? 'Reputación en VirusTotal' : 'VirusTotal reputation'} aria-label="VirusTotal"><ScanSearch size={13} /></button>
                    </> : '—'}</div></div>
                    <div><div className="wk-fact__k">{es ? 'Activo afectado' : 'Affected asset'}</div><div className="wk-fact__v"><Server size={12} />{selected.affected_asset || '—'}</div></div>
                    <div><div className="wk-fact__k">{es ? 'Usuario afectado' : 'Affected user'}</div><div className="wk-fact__v"><UserIcon size={12} />{selected.affected_user || '—'}</div></div>
                    <div><div className="wk-fact__k">MITRE ATT&CK</div><div className="wk-fact__v">{selected.mitre_technique ? (mitreUrl(selected.mitre_technique) ? <a className="wk-link" href={mitreUrl(selected.mitre_technique)!} target="_blank" rel="noopener noreferrer"><Target size={12} />{selected.mitre_technique}<ExternalLink size={10} /></a> : selected.mitre_technique) : '—'}</div></div>
                    <div><div className="wk-fact__k">{es ? 'Creado' : 'Created'}</div><div className="wk-fact__v"><Clock size={12} />{new Date(selected.created_at).toLocaleString(lang)}</div></div>
                    <div><div className="wk-fact__k">{es ? 'Categoría' : 'Category'}</div><div className="wk-fact__v"><Flag size={12} />{selected.category || '—'}</div></div>
                    <div><div className="wk-fact__k">{es ? 'Reportado por' : 'Reported by'}</div><div className="wk-fact__v">{selected.reporter_username || (es ? 'Automático (Wazuh)' : 'Automatic (Wazuh)')}</div></div>
                    <div><div className="wk-fact__k">{es ? 'Alerta Wazuh' : 'Wazuh alert'}</div><div className="wk-fact__v">{selected.wazuh_alert_id && selected.wazuh_alert_id !== 'undefined' ? <button className="wk-link" onClick={() => openInWazuh(selected.wazuh_alert_id!)}><Hash size={12} />{es ? 'Ver en Wazuh' : 'View in Wazuh'}<ExternalLink size={10} /></button> : '—'}</div></div>
                  </div>
                </div>
              </section>

              {vt && vt.ip === selected.source_ip && (
                <div className={`wk-vt${vt.data?.malicious > 0 ? ' wk-vt--bad' : ''}`}>
                  <ScanSearch size={15} />
                  {vt.loading ? <span>{es ? 'Consultando VirusTotal…' : 'Querying VirusTotal…'}</span>
                    : vt.error ? <span>{es ? 'VirusTotal no disponible: ' : 'VirusTotal unavailable: '}{vt.error}</span>
                    : vt.data?.found === false ? <span>{es ? `${vt.ip} no figura en VirusTotal (normal en IP privadas del laboratorio).` : `${vt.ip} not found in VirusTotal (expected for private lab IPs).`}</span>
                    : <span><b>{vt.data.malicious}</b>/{vt.data.total} {es ? 'motores la marcan como maliciosa' : 'engines flag it as malicious'}{vt.data.suspicious ? ` · ${vt.data.suspicious} ${es ? 'sospechosa' : 'suspicious'}` : ''}{vt.data.country ? ` · ${vt.data.country}` : ''}{vt.data.as_owner ? ` · ${vt.data.as_owner}` : ''}</span>}
                </div>
              )}

              {(selected.alerts?.length || 0) > 0 && (
                <section className="wk-section">
                  <div className="wk-section__head"><Link2 size={14} />{es ? 'Alertas vinculadas' : 'Linked alerts'}
                    <span className="wk-sec-tools"><span className="vx-code">{selected.alerts.length}</span></span>
                  </div>
                  <div className="wk-section__body" style={{ padding: 0 }}>
                    <ul className="vx-list">
                      {selected.alerts.map((a) => (
                        <li key={a.id}>
                          <div className="vx-list__row">
                            <span className="vx-code">{es ? 'regla' : 'rule'} {a.rule_id || '?'}</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.description || ''}>{a.description || '—'}</span>
                          </div>
                          <div className="vx-list__sub">
                            {a.alert_timestamp ? new Date(a.alert_timestamp).toLocaleString(lang) : ''}{a.agent_name ? ` · ${a.agent_name}` : ''}{a.rule_level != null ? ` · ${es ? 'nivel' : 'level'} ${a.rule_level}` : ''}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              )}

              {selected.description && (
                <section className="wk-section">
                  <div className="wk-section__head"><FileText size={14} />{es ? 'Descripción' : 'Description'}</div>
                  <div className="wk-section__body"><p>{selected.description}</p></div>
                </section>
              )}

              {selected.ai_summary && (
                <section className="wk-section wk-section--ai">
                  <div className="wk-section__head"><Bot size={14} />{es ? 'Análisis de VALHALLA-IA' : 'VALHALLA-IA analysis'}</div>
                  <div className="wk-section__body">
                    <p>{selected.ai_summary}</p>
                    {selected.ai_recommendation && <p style={{ marginTop: 10 }}><b>{es ? 'Recomendación: ' : 'Recommendation: '}</b>{selected.ai_recommendation}</p>}
                    <p className="vx-muted" style={{ marginTop: 8, fontSize: 10 }}>{es ? 'Generado por IA: verifícalo con la evidencia antes de actuar.' : 'AI generated: verify against evidence before acting.'}</p>
                  </div>
                </section>
              )}

              <section className="wk-section">
                <div className="wk-section__head"><NotebookPen size={14} />{es ? 'Notas del analista' : 'Analyst notes'}
                  <span className="wk-sec-tools"><button className="vx-mini-btn" onClick={saveNotes} disabled={busy || notes === (selected.analysis_notes || '')}><Save size={12} />{es ? 'Guardar' : 'Save'}</button></span>
                </div>
                <div className="wk-section__body">
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={es ? 'Hallazgos, hipótesis, acciones realizadas…' : 'Findings, hypotheses, actions taken…'} />
                </div>
              </section>

              <section className="wk-section">
                <div className="wk-section__head"><BookOpen size={14} />{es ? 'Runbooks sugeridos' : 'Suggested runbooks'}</div>
                <div className="wk-section__body">
                  {suggestedRunbooks.length === 0 ? <span className="vx-muted">{es ? 'No hay runbooks que encajen con este incidente.' : 'No runbooks match this incident.'}</span> : (
                    <div className="wk-rb">
                      {suggestedRunbooks.map((rb) => (
                        <div key={rb.id}>
                          <button className="wk-rb__pick" aria-expanded={activeRunbook === rb.id} onClick={() => setActiveRunbook(activeRunbook === rb.id ? null : rb.id)}>
                            <BookOpen size={14} />
                            <span style={{ minWidth: 0 }}>{rb.name}<small>{rb.description.slice(0, 90)}{rb.description.length > 90 ? '…' : ''}</small></span>
                            <ChevronRight size={14} style={{ marginLeft: 'auto', transform: activeRunbook === rb.id ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
                          </button>
                          {activeRunbook === rb.id && ([
                            [es ? 'Identificación' : 'Identification', rb.identification_steps],
                            [es ? 'Contención' : 'Containment', rb.containment_steps],
                            [es ? 'Erradicación' : 'Eradication', rb.eradication_steps],
                            [es ? 'Recuperación' : 'Recovery', rb.recovery_steps],
                            [es ? 'Lecciones aprendidas' : 'Post-mortem', rb.post_mortem_steps],
                          ] as [string, RunbookStep[]][]).filter(([, steps]) => steps && steps.length > 0).map(([phase, steps]) => (
                            <div key={phase} className="wk-phase">
                              <div className="wk-phase__name">{phase}</div>
                              {steps.map((st, i) => {
                                const key = `${selected.id}-${rb.id}-${phase}-${i}`;
                                const cmd = stepCmd(st);
                                return (
                                  <div key={key}>
                                    <label className={`wk-step${doneSteps[key] ? ' wk-step--done' : ''}`}>
                                      <input type="checkbox" checked={!!doneSteps[key]} onChange={() => setDoneSteps((d) => ({ ...d, [key]: !d[key] }))} />
                                      <span>{interpolate(stepText(st))}</span>
                                    </label>
                                    {cmd && (
                                      <div className="wk-cmd">
                                        <code>{interpolate(cmd)}</code>
                                        <button onClick={() => { navigator.clipboard.writeText(interpolate(cmd)); toast(es ? 'Comando copiado.' : 'Command copied.', 'ok'); }} aria-label={es ? 'Copiar comando' : 'Copy command'}><Copy size={13} /></button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section className="wk-section">
                <div className="wk-section__head"><Paperclip size={14} />{es ? 'Evidencias' : 'Evidence'}</div>
                <div className="wk-section__body">
                  {(selected.evidence || []).length > 0 && (
                    <div className="wk-files">
                      {selected.evidence.map((ev) => (
                        <div key={ev.id} className="wk-file">
                          <FileText size={16} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="wk-file__name">{ev.filename}</div>
                            <div className="wk-file__meta">
                              {(ev.file_size / 1024).toFixed(1)} KB · {ev.uploaded_by_username || '—'} · {new Date(ev.created_at).toLocaleString(lang)}
                            </div>
                            {ev.sha256 && (
                              <button className="wk-hash" onClick={() => { navigator.clipboard.writeText(ev.sha256!); toast(es ? 'SHA-256 copiado.' : 'SHA-256 copied.', 'ok'); }} title={ev.sha256}>
                                <Fingerprint size={11} />SHA-256 {ev.sha256.slice(0, 20)}…
                                {verified[ev.id] === true && <span className="wk-hash__ok"><ShieldCheck size={11} />{es ? 'íntegro' : 'intact'}</span>}
                                {verified[ev.id] === false && <span className="wk-hash__bad"><ShieldAlert size={11} />{es ? 'alterado' : 'tampered'}</span>}
                              </button>
                            )}
                          </div>
                          {ev.sha256 && <button className="vx-mini-btn" onClick={() => doVerify(ev.id)} title={es ? 'Recalcular el hash en el servidor' : 'Recompute hash on server'}><Fingerprint size={12} />{es ? 'Verificar' : 'Verify'}</button>}
                          <a className="vx-mini-btn" href={getEvidenceDownloadUrl(ev.id)} target="_blank" rel="noopener noreferrer"><Download size={12} />{es ? 'Descargar' : 'Download'}</a>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="wk-drop">
                    <span>{es ? `Logs, capturas, PCAP… (máx. ${MAX_EVIDENCE_MB} MB)` : `Logs, screenshots, PCAP… (max ${MAX_EVIDENCE_MB} MB)`}</span>
                    <input ref={fileRef} type="file" hidden accept={EVIDENCE_EXT.join(',')} onChange={onUpload} />
                    <button className="vx-mini-btn" onClick={() => fileRef.current?.click()} disabled={busy}><Upload size={12} />{es ? 'Adjuntar' : 'Attach'}</button>
                  </div>
                </div>
              </section>

              <section className="wk-section">
                <div className="wk-section__head"><Users size={14} />{es ? 'Asignación' : 'Assignment'}</div>
                <div className="wk-section__body">
                  <div className="wk-assign">
                    <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} aria-label={es ? 'Analista' : 'Analyst'}>
                      <option value="">{es ? 'Elige analista…' : 'Choose analyst…'}</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.username}{u.id === currentUser.id ? (es ? ' (tú)' : ' (you)') : ''}</option>)}
                    </select>
                    <button className="vx-mini-btn" style={{ height: 34 }} disabled={busy || !assignTo || Number(assignTo) === selected.assigned_to_id} onClick={() => doAssign(Number(assignTo))}>{es ? 'Asignar' : 'Assign'}</button>
                    {selected.assigned_to_id !== currentUser.id && <button className="vx-mini-btn" style={{ height: 34 }} disabled={busy} onClick={() => doAssign(currentUser.id)}><UserCheck size={12} />{es ? 'Asignarme' : 'Assign me'}</button>}
                  </div>
                </div>
              </section>

              {selected.status === 'resolved' && selected.resolution_notes && (
                <section className="wk-section">
                  <div className="wk-section__head"><ShieldCheck size={14} />{es ? 'Resolución' : 'Resolution'}</div>
                  <div className="wk-section__body">
                    {selected.classification && (() => { const c = CLASSIFICATIONS.find((x) => x.id === selected.classification); return c ? <span className={`wk-class wk-class--${c.id}`}>{es ? c.es : c.en}</span> : null; })()}
                    <p style={{ marginTop: 8 }}>{selected.resolution_notes}</p>
                    {selected.resolved_at && <p className="vx-muted" style={{ marginTop: 6 }}>{new Date(selected.resolved_at).toLocaleString(lang)} · {es ? 'tiempo de resolución' : 'time to resolve'} {fmtDuration(new Date(selected.resolved_at).getTime() - new Date(selected.created_at).getTime())}</p>}
                  </div>
                </section>
              )}
              <section className="wk-section">
                <div className="wk-section__head"><History size={14} />{es ? 'Línea de tiempo' : 'Timeline'}</div>
                <div className="wk-section__body">
                  <div className="wk-comment">
                    <input value={comment} maxLength={2000} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') postComment(); }} placeholder={es ? 'Añadir comentario al caso…' : 'Add a comment to the case…'} />
                    <button className="vx-mini-btn" style={{ height: 34 }} onClick={postComment} disabled={busy || !comment.trim()} aria-label={es ? 'Enviar comentario' : 'Send comment'}><Send size={12} /></button>
                  </div>
                  {timeline === null && <div className="pf-skel" style={{ marginTop: 12 }} />}
                  {timeline && timeline.length === 0 && <p className="vx-muted" style={{ marginTop: 10 }}>{es ? 'Sin actividad registrada todavía.' : 'No activity recorded yet.'}</p>}
                  {timeline && timeline.length > 0 && (
                    <ul className="pf-timeline" style={{ marginTop: 12 }}>
                      {[...timeline].reverse().map((ev) => {
                        const Icon = EVENT_ICON[ev.kind] || History;
                        return (
                          <li key={ev.id} className="pf-tl">
                            <span className="pf-tl__dot"><Icon size={13} /></span>
                            <div className="pf-tl__main">
                              <div className={`pf-tl__title${ev.kind === 'comment' ? ' wk-tl-comment' : ''}`}>{ev.message}</div>
                              <div className="pf-tl__meta"><span>{ev.username || (es ? 'sistema' : 'system')}</span><span title={new Date(ev.created_at).toLocaleString(lang)}>{new Date(ev.created_at).toLocaleString(lang)}</span></div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </section>
            </div>

            {selected.status !== 'resolved' && (
              <div className="wk-drawer__foot">
                {selected.status !== 'escalated' && <button className="vp-btn" onClick={() => moveTicket(selected.id, 'escalated')}><AlertTriangle size={13} />{es ? 'Escalar a contención' : 'Escalate'}</button>}
                <button className="vp-btn vp-btn--primary" onClick={() => moveTicket(selected.id, 'resolved')}><CircleCheckBig size={13} />{es ? 'Resolver' : 'Resolve'}</button>
              </div>
            )}
          </aside>
        </>,
        document.body,
      )}

      {/* ---------- Resolver (notas obligatorias) ---------- */}
      {resolveFor !== null && createPortal(
        <div className="vp-modal-backdrop" onMouseDown={() => setResolveFor(null)}>
          <div className="vp-pop wk-modal" role="dialog" aria-modal="true" aria-label={es ? 'Resolver incidente' : 'Resolve incident'} onMouseDown={(e) => e.stopPropagation()}>
            <div className="vp-pop__head"><CircleCheckBig size={16} color="var(--signal)" /><div className="vp-pop__title">{es ? `Resolver incidente #${resolveFor}` : `Resolve incident #${resolveFor}`}</div></div>
            <div className="wk-form">
              <div className="wk-form__full wk-classes" role="radiogroup" aria-label={es ? 'Clasificación' : 'Classification'}>
                <span className="wk-classes__label">{es ? 'Clasificación *' : 'Classification *'}</span>
                {CLASSIFICATIONS.map((c) => (
                  <button key={c.id} type="button" role="radio" aria-checked={resolveClass === c.id} className={`wk-class-opt wk-class--${c.id}`} onClick={() => setResolveClass(c.id)}>
                    <strong>{es ? c.es : c.en}</strong><small>{es ? c.hint_es : c.hint_en}</small>
                  </button>
                ))}
              </div>
              <label className="wk-form__full">{es ? 'Notas de resolución *' : 'Resolution notes *'}
                <textarea autoFocus value={resolveNotes} onChange={(e) => setResolveNotes(e.target.value)} placeholder={es ? 'Causa raíz, acciones de contención y erradicación, verificación…' : 'Root cause, containment and eradication actions, verification…'} />
              </label>
            </div>
            <div className="wk-modal__actions">
              <button className="vp-btn" onClick={() => setResolveFor(null)}>{es ? 'Cancelar' : 'Cancel'}</button>
              <button className="vp-btn vp-btn--primary" onClick={confirmResolve} disabled={busy || !resolveNotes.trim() || !resolveClass}><CircleCheckBig size={13} />{es ? 'Marcar como resuelto' : 'Mark as resolved'}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ---------- Nuevo incidente ---------- */}
      {showCreate && createPortal(
        <div className="vp-modal-backdrop" onMouseDown={() => setShowCreate(false)}>
          <div className="vp-pop wk-modal" role="dialog" aria-modal="true" aria-labelledby="wk-create-title" onMouseDown={(e) => e.stopPropagation()}>
            <div className="vp-pop__head"><Plus size={16} color="var(--signal)" /><div className="vp-pop__title" id="wk-create-title">{es ? 'Nuevo incidente' : 'New incident'}</div>
              <button className="vx-iconbtn" style={{ marginLeft: 'auto' }} onClick={() => setShowCreate(false)} aria-label={es ? 'Cerrar' : 'Close'}><X size={15} /></button>
            </div>
            <div className="wk-form">
              <label className="wk-form__full">{es ? 'Título *' : 'Title *'}
                <input autoFocus value={form.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={es ? 'p. ej. Fuerza bruta SSH contra el honeypot' : 'e.g. SSH brute force against the honeypot'} />
              </label>
              <label className="wk-form__full">{es ? 'Descripción' : 'Description'}
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={es ? 'Qué se ha observado y dónde…' : 'What was observed and where…'} />
              </label>
              <label>{es ? 'Severidad' : 'Severity'}
                <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                  {SEVERITIES.map((s) => <option key={s} value={s}>{sevLabel(s)}</option>)}
                </select>
              </label>
              <label>{es ? 'Categoría' : 'Category'}
                <input value={form.category} maxLength={64} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder={es ? 'Autenticación, malware…' : 'Authentication, malware…'} />
              </label>
              <label>{es ? 'IP origen' : 'Source IP'}
                <input value={form.source_ip} onChange={(e) => setForm({ ...form, source_ip: e.target.value })} placeholder="203.0.113.10" />
                {formErrors.source_ip && <span className="wk-form__err">{formErrors.source_ip}</span>}
              </label>
              <label>{es ? 'Activo afectado' : 'Affected asset'}
                <input value={form.affected_asset} maxLength={255} onChange={(e) => setForm({ ...form, affected_asset: e.target.value })} placeholder="srv-web-01" />
              </label>
              <label>{es ? 'Usuario afectado' : 'Affected user'}
                <input value={form.affected_user} maxLength={128} onChange={(e) => setForm({ ...form, affected_user: e.target.value })} placeholder="jdoe" />
              </label>
              <label>{es ? 'Técnica MITRE' : 'MITRE technique'}
                <input value={form.mitre_technique} onChange={(e) => setForm({ ...form, mitre_technique: e.target.value })} placeholder="T1110" />
                {formErrors.mitre && <span className="wk-form__err">{formErrors.mitre}</span>}
              </label>
              <label className="wk-form__full">{es ? 'Asignar a' : 'Assign to'}
                <select value={form.assigned_to_id} onChange={(e) => setForm({ ...form, assigned_to_id: e.target.value })}>
                  <option value="">{es ? 'Sin asignar' : 'Unassigned'}</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
                </select>
              </label>
            </div>
            <div className="wk-modal__actions">
              <button className="vp-btn" onClick={() => setShowCreate(false)}>{es ? 'Cancelar' : 'Cancel'}</button>
              <button className="vp-btn vp-btn--primary" onClick={submitCreate} disabled={busy || !formValid}><Plus size={13} />{es ? 'Crear incidente' : 'Create incident'}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
