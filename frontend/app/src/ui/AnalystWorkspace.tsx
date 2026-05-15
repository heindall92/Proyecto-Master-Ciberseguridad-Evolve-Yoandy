import React, { useState, useEffect, useCallback } from 'react';
import logger from '../lib/logger';
import {
  listTickets,
  createTicket,
  updateTicket,
  assignTicket,
  resolveTicket,
  deleteTicket,
  purgeResolvedTickets,
  listUsers,
  getDashboardSummary,
  syncWazuhAlerts,
  listRunbooks,
  uploadEvidence,
  type TicketOut,
  type UserOut,
  type RunbookOut,
} from '../lib/api';
import { playNotificationSound, playResolvedSound } from './audio';
import { translations } from './translations';

type KanbanStatus = 'open' | 'in_progress' | 'escalated' | 'resolved';

interface TicketCard {
  id: number;
  title: string;
  status: KanbanStatus;
  severity: 'critical' | 'high' | 'medium' | 'low';
  progress: number;
  actions: string;
  tags: string[];
  assignee_username: string | null;
  ai_summary: string | null;
  ai_recommendation: string | null;
  analysis_notes: string | null;
  description: string | null;
  source_ip: string | null;
  affected_asset: string | null;
  affected_user: string | null;
  mitre_technique: string | null;
  wazuh_alert_id: string | null;
  evidence: any[];
  created_at: string;
}

const getColumns = (t: any): { id: KanbanStatus; label: string; color: string }[] => [
  { id: 'open', label: t('triage').toUpperCase(), color: '#4D9FFF' },
  { id: 'in_progress', label: t('investigation').toUpperCase(), color: '#FF9F1C' },
  { id: 'escalated', label: t('mitigation').toUpperCase(), color: '#FF4D4D' },
  { id: 'resolved', label: t('resolved').toUpperCase(), color: '#4DFFA6' },
];

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#FF0055',
  high: '#FF4D4D',
  medium: '#4D9FFF',
  low: '#4DFFA6',
};

const SEVERITY_OPTIONS = ['critical', 'high', 'medium', 'low'];

export default function AnalystWorkspace({ 
  lang = "es", 
  initialData, 
  onClearInitialData,
  currentUser
}: { 
  lang?: "es" | "en", 
  initialData?: any, 
  onClearInitialData?: () => void,
  currentUser: UserOut
}) {
  const t = (key: keyof typeof translations.es) => translations[lang][key] || key;
  const [tickets, setTickets] = useState<TicketCard[]>([]);
  const [users, setUsers] = useState<UserOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<KanbanStatus | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<TicketCard | null>(null);
  const [keyboardSelectedId, setKeyboardSelectedId] = useState<number | null>(null);
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterAnalyst, setFilterAnalyst] = useState<string>('all');
  const [stats, setStats] = useState<any>(null);
  const [runbooks, setRunbooks] = useState<RunbookOut[]>([]);

  // Create form state
  const [createForm, setCreateForm] = useState({
    title: '',
    description: '',
    severity: 'medium',
    category: '',
    source_ip: '',
    affected_asset: '',
    affected_user: '',
    mitre_technique: '',
    assigned_to_id: '' as string | number,
  });

  // Detail/edit state
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeRunbook, setActiveRunbook] = useState<RunbookOut | null>(null);

  useEffect(() => {
    if (initialData) {
      setCreateForm({
        ...createForm,
        title: initialData.title || '',
        source_ip: initialData.source_ip || '',
        affected_asset: initialData.affected_asset || '',
        description: initialData.description || ''
      });
      setShowCreateModal(true);
      if (onClearInitialData) onClearInitialData();
    }
  }, [initialData, onClearInitialData]);

  const interpolate = (text: string) => {
    if (!selectedTicket) return text;
    return text
      .replace(/{{ip}}/g, selectedTicket.source_ip || 'N/A')
      .replace(/{{asset}}/g, selectedTicket.affected_asset || 'N/A')
      .replace(/{{user}}/g, selectedTicket.affected_user || 'N/A');
  };

  const fetchData = useCallback(async () => {
    try {
      let ticketsData: TicketOut[] = [];
      let usersData: UserOut[] = [];
      let statsData: any = null;

      // Llamadas independientes - si una falla, las demás continúan
      try {
        const allTickets = await listTickets();
        // Filtrado multi-sesión: 
        // Los analistas solo ven sus propios tickets. Los admins ven todo.
        if (currentUser.role === 'admin') {
          ticketsData = allTickets;
        } else {
          ticketsData = allTickets.filter(t => t.assigned_to_id === currentUser.id);
        }
        logger.log('[Workspace] Tickets filtered for session:', ticketsData.length);
      } catch(e) {
        logger.error('[Workspace] Error loading tickets:', e);
      }

      try {
        usersData = await listUsers();
        logger.log('[Workspace] Users loaded:', usersData.length);
      } catch(e) {
        logger.error('[Workspace] Error loading users:', e);
        usersData = [];
      }

      try {
        statsData = await getDashboardSummary();
        logger.log('[Workspace] Stats loaded:', statsData);
      } catch(e) {
        logger.error('[Workspace] Error loading stats:', e);
        statsData = null;
      }

      try {
        const rbData = await listRunbooks();
        setRunbooks(rbData || []);
      } catch(e) {
        logger.error('[Workspace] Error loading runbooks:', e);
      }

      const mapped: TicketCard[] = ticketsData.map((t: TicketOut) => ({
        id: t.id,
        title: t.title,
        status: t.status as KanbanStatus,
        severity: t.severity as any,
        progress: t.status === 'resolved' ? 100 : t.status === 'in_progress' ? 50 : 0,
        actions: t.analysis_notes ? '1/3 Actions' : '0/3 Actions',
        tags: t.category ? [t.category] : [],
        assignee_username: t.assignee_username || (t as any).assignee?.username || null,
        assigned_to_id: (t as any).assigned_to_id,
        ai_summary: t.ai_summary,
        ai_recommendation: t.ai_recommendation,
        analysis_notes: t.analysis_notes,
        description: t.description,
        source_ip: t.source_ip,
        affected_asset: t.affected_asset,
        affected_user: t.affected_user,
        mitre_technique: t.mitre_technique,
        wazuh_alert_id: t.wazuh_alert_id,
        evidence: t.evidence || [],
        created_at: t.created_at,
      }));
      setTickets(mapped);
      setUsers(usersData);
      setStats(statsData);
    } catch (err) {
      logger.error('Failed to fetch workspace data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 60000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const handleDragStart = (e: React.DragEvent, ticketId: number) => {
    setDraggedId(ticketId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(ticketId));
  };

  const handleDragOver = (e: React.DragEvent, colId: KanbanStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCol(colId);
  };

  const handleDragLeave = () => {
    setDragOverCol(null);
  };

  const handleDrop = async (e: React.DragEvent, newStatus: KanbanStatus) => {
    e.preventDefault();
    setDragOverCol(null);
    if (draggedId === null) return;
    const ticketId = draggedId;
    setDraggedId(null);

    // Optimistic update
    setTickets(prev =>
      prev.map(t => t.id === ticketId ? { ...t, status: newStatus } : t)
    );

    try {
      if (newStatus === 'resolved') {
        await resolveTicket(ticketId, 'Resolved via Kanban');
        playResolvedSound();
      } else {
        await updateTicket(ticketId, { status: newStatus });
        const wasResolved = tickets.find(t => t.id === ticketId)?.status === 'resolved';
        if (wasResolved) playNotificationSound();
      }
      await fetchData(); // Refresh data to confirm sync with DB
    } catch (err) {
      logger.error('Failed to update ticket status:', err);
      alert('Error al mover incidente: ' + (err instanceof Error ? err.message : String(err)));
      fetchData(); // Revert on error
    }
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverCol(null);
  };

  // Keyboard handler for drawer/modal dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showCreateModal) setShowCreateModal(false);
        if (selectedTicket) setSelectedTicket(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCreateModal, selectedTicket]);

  // Reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => {};
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const handleTicketClick = (ticket: TicketCard) => {
    setSelectedTicket(ticket);
    setEditNotes(ticket.analysis_notes || '');
  };

  const handleSaveNotes = async () => {
    if (!selectedTicket) return;
    setSaving(true);
    try {
      await updateTicket(selectedTicket.id, { analysis_notes: editNotes });
      setTickets(prev =>
        prev.map(t => t.id === selectedTicket.id ? { ...t, analysis_notes: editNotes } : t)
      );
      setSelectedTicket(prev => prev ? { ...prev, analysis_notes: editNotes } : null);
    } catch (err) {
      logger.error('Failed to save notes:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedTicket || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    setSaving(true);
    try {
      const newEv = await uploadEvidence(selectedTicket.id, file);
      const updated = { ...selectedTicket, evidence: [...(selectedTicket.evidence || []), newEv] };
      setSelectedTicket(updated);
      setTickets(prev => prev.map(t => t.id === selectedTicket.id ? updated : t));
    } catch (err) {
      logger.error('Upload failed:', err);
      alert('Error subiendo archivo');
    } finally {
      setSaving(false);
    }
  }, [selectedTicket]);

  const handleAssign = async (userId: number) => {
    if (!selectedTicket) return;
    setSaving(true);
    try {
      await assignTicket(selectedTicket.id, userId);
      await fetchData();
      setSelectedTicket(null);
    } catch (err) {
      logger.error('Failed to assign ticket:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTicket = async () => {
    if (!createForm.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: createForm.title,
        description: createForm.description || null,
        severity: createForm.severity,
        category: createForm.category || null,
        source_ip: createForm.source_ip || null,
        affected_asset: createForm.affected_asset || null,
        affected_user: createForm.affected_user || null,
        mitre_technique: createForm.mitre_technique || null,
        assigned_to_id: createForm.assigned_to_id && createForm.assigned_to_id !== "" ? Number(createForm.assigned_to_id) : null,
      };
      await createTicket(payload);
      setShowCreateModal(false);
      setCreateForm({ title: '', description: '', severity: 'medium', category: '', source_ip: '', affected_asset: '', affected_user: '', mitre_technique: '', assigned_to_id: '' });
      await fetchData();
    } catch (err: any) {
      logger.error('Failed to create ticket:', err);
      alert('Error al crear incidente: ' + (err?.message || err?.toString() || 'Error desconocido'));
    } finally {
      setSaving(false);
    }
  };

  // Keyboard navigation for kanban board
  const handleBoardKeyDown = (e: React.KeyboardEvent, ticket: TicketCard) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleTicketClick(ticket);
    }
  };

  const filteredTickets = tickets.filter(t => {
    if (filterPriority !== 'all' && t.severity !== filterPriority) return false;
    if (filterAnalyst !== 'all') {
      if (filterAnalyst === 'unassigned' && t.assignee_username) return false;
      if (filterAnalyst !== 'unassigned' && t.assignee_username !== filterAnalyst) return false;
    }
    return true;
  });

  const getTicketsByStatus = (status: KanbanStatus) =>
    filteredTickets.filter(t => t.status === status);

  if (loading) {
    return (
      <div style={{ height: '100%', padding: '30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Header skeleton */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ width: '200px', height: '24px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', animation: 'shimmer 1.5s infinite' }} />
            <div style={{ width: '300px', height: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', animation: 'shimmer 1.5s infinite' }} />
          </div>
        </div>
        {/* Stats bar skeleton */}
        <div style={{ display: 'flex', gap: '20px', padding: '15px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
          {[80, 80, 80].map((w, i) => (
            <div key={i} style={{ width: w, height: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', animation: 'shimmer 1.5s infinite' }} />
          ))}
        </div>
        {/* Board skeleton */}
        <div style={{ display: 'flex', gap: '20px', flex: 1 }}>
          {[320, 320, 320, 320].map((w, i) => (
            <div key={i} style={{ width: w, flex: '0 0 320px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ width: '150px', height: '14px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', animation: 'shimmer 1.5s infinite' }} />
              {[120, 120, 120].map((h, j) => (
                <div key={j} style={{ width: '100%', height: h, background: 'rgba(255,255,255,0.05)', borderRadius: '8px', animation: 'shimmer 1.5s infinite', animationDelay: `${(i * 3 + j) * 100}ms` }} />
              ))}
            </div>
          ))}
        </div>
        <style>{`@keyframes shimmer { 0% { opacity: 0.5; } 50% { opacity: 0.8; } 100% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  return (
    <div className="analyst-workspace" style={{ height: '100%', padding: '30px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      {/* Screen reader announcements */}
      <div aria-live="polite" aria-atomic="true" style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
        {selectedTicket ? `Opening incident ${selectedTicket.id}: ${selectedTicket.title}` : ''}
      </div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h1 className="ws-header-title" style={{ margin: 0, fontSize: '24px', fontWeight: 600, letterSpacing: '0.5px' }}>
            {t('incident_response_board')}
          </h1>
          <span className="ws-header-sub" style={{ fontSize: '12px', marginTop: '5px', display: 'block' }}>
            {t('manage_workloads')}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          {/* Filters */}
          <select
            className="ws-filter-select"
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value)}
          >
            <option value="all">{t('all_priorities')}</option>
            {SEVERITY_OPTIONS.map(s => (
              <option key={s} value={s}>{s.toUpperCase()}</option>
            ))}
          </select>
          <select
            className="ws-filter-select"
            value={filterAnalyst}
            onChange={e => setFilterAnalyst(e.target.value)}
          >
            <option value="all">{t('all_analysts')}</option>
            <option value="unassigned">{t('unassigned')}</option>
            {users.map(u => (
              <option key={u.id} value={u.username}>{u.username.toUpperCase()}</option>
            ))}
          </select>
          <button
            type="button"
            className="ws-btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            + {t('new_incident')}
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="ws-stats-bar">
          <div className="ws-stat-item">
            <span className="ws-stat-num ws-stat-num--open">{stats.metrics?.tickets_open || 0}</span> {t('open_tickets')}
          </div>
          <div className="ws-stat-item">
            <span className="ws-stat-num ws-stat-num--escalated">{getTicketsByStatus('escalated').length}</span> {t('escalated_tickets')}
          </div>
          <div className="ws-stat-item">
            <span className="ws-stat-num ws-stat-num--resolved">{getTicketsByStatus('resolved').length}</span> {t('resolved_tickets')}
          </div>
        </div>
      )}

      {/* Board */}
      <div style={{ display: 'flex', gap: '20px', flex: 1, overflowX: 'auto', paddingBottom: '10px' }}>
        {getColumns(t).map(col => {
          const colTickets = getTicketsByStatus(col.id);
          const isDragOver = dragOverCol === col.id;
          return (
            <div
              key={col.id}
              style={{
                flex: '0 0 320px',
                display: 'flex',
                flexDirection: 'column',
                gap: '15px',
                background: isDragOver ? 'rgba(77,159,255,0.05)' : 'transparent',
                borderRadius: '8px',
                transition: 'background 0.2s',
                border: isDragOver ? '2px dashed rgba(77,159,255,0.3)' : '2px solid transparent',
              }}
              onDragOver={e => handleDragOver(e, col.id)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, col.id)}
            >
              {/* Column Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 5px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    className={`ws-kanban-col-label ws-kanban-col-label--${col.id}`}
                    style={{ fontSize: '11px', color: col.color, letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}
                  >
                    {col.label}
                  </span>
                  <span className="ws-kanban-count">{colTickets.length}</span>
                </div>
                {col.id === 'resolved' && colTickets.length > 0 && (
                  <button
                    title="Eliminar resueltos con más de 30 días"
                    onClick={async () => {
                      if (!window.confirm(`¿Eliminar tickets resueltos de más de 30 días? Esta acción no se puede deshacer.`)) return;
                      try {
                        const r = await purgeResolvedTickets(30);
                        await fetchData();
                        alert(`${r.deleted} tickets eliminados`);
                      } catch (e) { logger.error(e); }
                    }}
                    style={{ fontSize: '9px', background: 'rgba(255,77,77,0.15)', border: '1px solid rgba(255,77,77,0.3)', color: '#FF4D4D', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    PURGAR 30d+
                  </button>
                )}
              </div>

              {/* Cards Container */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto', paddingRight: '5px' }}>
                {colTickets.map(ticket => (
                  <div
                    key={ticket.id}
                    className="ws-ticket-card"
                    draggable
                    tabIndex={0}
                    role="button"
                    aria-label={`Incident ${ticket.id}: ${ticket.title}, ${ticket.severity} severity`}
                    onDragStart={e => handleDragStart(e, ticket.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => handleTicketClick(ticket)}
                    onKeyDown={e => handleBoardKeyDown(e, ticket)}
                    onFocus={() => setFocusedId(ticket.id)}
                    onBlur={() => setFocusedId(null)}
                    style={{
                      background: focusedId === ticket.id ? 'rgba(77,159,255,0.15)' : 'rgba(20, 25, 30, 0.6)',
                      backdropFilter: 'blur(10px)',
                      border: ticket.severity === 'critical' ? '2px solid #ef4444' : (focusedId === ticket.id ? '2px solid var(--signal)' : '1px solid rgba(255, 255, 255, 0.1)'),
                      borderRadius: '8px',
                      padding: '16px',
                      position: 'relative',
                      cursor: 'grab',
                      boxShadow: ticket.severity === 'critical' ? '0 0 15px rgba(239,68,68,0.2)' : '0 4px 12px rgba(0,0,0,0.2)',
                      transition: 'transform 0.2s, background 0.2s, opacity 0.2s',
                      minHeight: '120px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      flexShrink: 0,
                      opacity: draggedId === ticket.id ? 0.5 : 1,
                    }}
                    onMouseEnter={e => {
                      if (draggedId !== ticket.id) {
                        e.currentTarget.style.background = 'rgba(30, 35, 40, 0.8)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'rgba(20, 25, 30, 0.6)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    {/* Left Colored Indicator */}
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      top: '10%',
                      bottom: '10%',
                      width: '3px',
                      background: PRIORITY_COLORS[ticket.severity],
                      borderRadius: '0 4px 4px 0',
                      boxShadow: `0 0 8px ${PRIORITY_COLORS[ticket.severity]}40`,
                    }} />

                    {/* Top Section: ID + Menu */}
                    <div className="ws-card-meta" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <span>#{ticket.id}</span>
                        {(() => {
                          const diff = Date.now() - new Date(ticket.created_at).getTime();
                          const hrs = Math.floor(diff / 3600000);
                          const mins = Math.floor((diff % 3600000) / 60000);
                          return <span style={{ color: hrs > 2 ? '#ef4444' : 'inherit' }}>🕒 {hrs}h {mins}m</span>;
                        })()}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ textTransform: 'uppercase', color: PRIORITY_COLORS[ticket.severity], fontWeight: 600 }}>{ticket.severity}</span>
                        {currentUser?.role === 'admin' && (
                          <button
                            title="Eliminar Incidente"
                            onClick={async (e) => {
                                e.stopPropagation();
                                if (window.confirm(`¿Estás seguro de que deseas eliminar el incidente #${ticket.id} permanentemente?`)) {
                                  try {
                                    await deleteTicket(ticket.id);
                                    await fetchData();
                                  } catch (err: any) {
                                    alert('Error al eliminar: ' + (err?.message || String(err)));
                                    logger.error('deleteTicket error:', err);
                                  }
                                }
                            }}
                            style={{
                                background: 'none', border: 'none', color: '#ff4d4d', cursor: 'pointer',
                                padding: '2px', display: 'flex', alignItems: 'center', opacity: 0.6, transition: 'opacity 0.2s'
                            }}
                            onMouseOver={e => e.currentTarget.style.opacity = '1'}
                            onMouseOut={e => e.currentTarget.style.opacity = '0.6'}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/></svg>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Title */}
                    <div className="ws-card-title" style={{ fontSize: '14px', fontWeight: 500, lineHeight: '1.4', marginBottom: '10px' }}>
                      {ticket.title}
                    </div>

                    {/* Tags */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '15px' }}>
                      {ticket.tags.map(tag => (
                        <span key={tag} style={{
                          background: 'rgba(255,255,255,0.05)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          color: 'var(--text-dim)',
                          border: '1px solid rgba(255,255,255,0.1)',
                        }}>
                          {tag}
                        </span>
                      ))}
                      {ticket.ai_summary && (
                        <span style={{
                          background: 'rgba(77,159,255,0.1)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          color: '#4D9FFF',
                          border: '1px solid rgba(77,159,255,0.2)',
                        }}>
                          AI
                        </span>
                      )}
                    </div>

                    {/* Bottom Section: Progress + Avatars */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: 'auto', flexWrap: 'wrap' }}>
                      {/* Progress Bar */}
                      <div style={{ flex: 1, minWidth: '60px', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{
                          width: `${ticket.progress}%`,
                          height: '100%',
                          background: PRIORITY_COLORS[ticket.severity],
                          borderRadius: '2px',
                        }} />
                      </div>

                      {/* Quick Move Menu */}
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        {getColumns(t).filter(c => c.id !== ticket.status).map(c => (
                          <button
                            key={c.id}
                            title={`Mover a ${c.label}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDrop({ preventDefault: () => {}, dataTransfer: { dropEffect: 'move' } } as any, c.id);
                                // Note: We simulate a drop call but we need a specific handler
                                // For simplicity, let's use a direct call:
                                updateTicket(ticket.id, { status: c.id }).then(() => fetchData());
                            }}
                            style={{
                                width: '20px', height: '20px', borderRadius: '4px',
                                border: `1px solid ${c.color}40`, background: 'rgba(0,0,0,0.2)',
                                color: c.color, fontSize: '10px', cursor: 'pointer',
                                display: 'grid', placeItems: 'center'
                            }}
                          >
                          </button>
                        ))}
                      </div>

                      {/* Assignee */}
                      {ticket.assignee_username ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                           <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 600 }}>{ticket.assignee_username.toUpperCase()}</span>
                           <div title={`Assigned to ${ticket.assignee_username}`} style={{
                             width: '24px',
                             height: '24px',
                             borderRadius: '50%',
                             background: 'rgba(77,159,255,0.3)',
                             display: 'grid',
                             placeItems: 'center',
                             fontSize: '10px',
                             color: '#fff',
                             border: '1px solid rgba(77,159,255,0.5)',
                           }}>
                             {ticket.assignee_username.charAt(0).toUpperCase()}
                           </div>
                        </div>
                      ) : (
                        <div title="Unassigned" style={{
                          display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0
                        }}>
                           <span style={{ fontSize: '10px', color: 'var(--danger)', fontWeight: 600 }}>UNASSIGNED</span>
                           <div style={{
                             width: '24px',
                             height: '24px',
                             borderRadius: '50%',
                             background: 'transparent',
                             display: 'grid',
                             placeItems: 'center',
                             fontSize: '14px',
                             color: 'rgba(255,255,255,0.2)',
                             border: '1px dashed rgba(255,255,255,0.2)',
                           }}>
                             +
                           </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Ticket Detail Drawer */}
      {selectedTicket && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setSelectedTicket(null)}
            aria-hidden="true"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              zIndex: 999,
            }}
          />
          <div className="ws-detail-drawer" style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '500px',
          height: '100%',
          padding: '30px',
          overflowY: 'auto',
          zIndex: 1000,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 className="ws-detail-heading" style={{ margin: 0, fontSize: '18px' }}>
              Incident #{selectedTicket.id}
            </h2>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {currentUser?.role === 'admin' && (
                <button
                  onClick={async () => {
                    if (!window.confirm('¿Eliminar este ticket permanentemente? Esta acción no se puede deshacer.')) return;
                    try {
                      await deleteTicket(selectedTicket.id);
                      setSelectedTicket(null);
                      await fetchData();
                    } catch (err: any) {
                      alert('Error al eliminar: ' + (err?.message || String(err)));
                      logger.error('deleteTicket drawer error:', err);
                    }
                  }}
                  style={{ background: 'rgba(255,77,77,0.15)', border: '1px solid rgba(255,77,77,0.4)', color: '#FF4D4D', fontSize: '11px', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer' }}
                >
                  ELIMINAR
                </button>
              )}
              <button
                onClick={() => setSelectedTicket(null)}
                aria-label="Close incident details"
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '20px', cursor: 'pointer', padding: '4px', lineHeight: 1 }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Status Badge */}
          <div style={{
            display: 'inline-block',
            padding: '4px 12px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            background: `${PRIORITY_COLORS[selectedTicket.severity]}20`,
            color: PRIORITY_COLORS[selectedTicket.severity],
            border: `1px solid ${PRIORITY_COLORS[selectedTicket.severity]}40`,
            marginBottom: '20px',
          }}>
            {selectedTicket.severity} · {selectedTicket.status.replace('_', ' ')}
          </div>

          {/* Title */}
          <h3 className="ws-detail-heading" style={{ margin: '0 0 15px 0', fontSize: '16px' }}>
            {selectedTicket.title}
          </h3>

          {/* Description */}
          {selectedTicket.description && (
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Description
              </label>
              <p className="ws-detail-body" style={{ fontSize: '13px', lineHeight: '1.6', margin: '8px 0 0 0' }}>
                {selectedTicket.description}
              </p>
            </div>
          )}

          {/* Metadata */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
            {selectedTicket.source_ip && (
              <div>
                <label style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Source IP</label>
                <div style={{ color: 'var(--signal)', fontSize: '13px', marginTop: '4px', fontFamily: 'var(--mono)' }}>{selectedTicket.source_ip}</div>
              </div>
            )}
            {selectedTicket.affected_asset && (
              <div>
                <label style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Affected Asset</label>
                <div style={{ color: '#fff', fontSize: '13px', marginTop: '4px' }}>{selectedTicket.affected_asset}</div>
              </div>
            )}
            {selectedTicket.affected_user && (
              <div>
                <label style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Affected User</label>
                <div style={{ color: '#f97316', fontSize: '13px', marginTop: '4px' }}>{selectedTicket.affected_user}</div>
              </div>
            )}
            {selectedTicket.mitre_technique && (
              <div>
                <label style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>MITRE Technique</label>
                <div style={{ color: '#38bdf8', fontSize: '13px', marginTop: '4px' }}>{selectedTicket.mitre_technique}</div>
              </div>
            )}
            <div>
              <label style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Created</label>
              <div style={{ color: '#fff', fontSize: '13px', marginTop: '4px' }}>
                {new Date(selectedTicket.created_at).toLocaleString()}
              </div>
            </div>
            <div>
              <label style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Telemetry</label>
              <div style={{ marginTop: '4px' }}>
                {selectedTicket.wazuh_alert_id ? (
                  <button style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)', color: '#06b6d4', fontSize: '10px', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer' }}>
                    VIEW IN WAZUH
                  </button>
                ) : <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.2)' }}>No link</span>}
              </div>
            </div>
          </div>

          {/* AI Summary */}
          {selectedTicket.ai_summary && (
            <div style={{ marginBottom: '20px', padding: '15px', background: 'rgba(77,159,255,0.1)', borderRadius: '8px', border: '1px solid rgba(77,159,255,0.2)' }}>
              <label style={{ fontSize: '10px', color: '#4D9FFF', textTransform: 'uppercase', letterSpacing: '1px' }}>
                AI Analysis
              </label>
              <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '13px', lineHeight: '1.6', margin: '10px 0 0 0' }}>
                {selectedTicket.ai_summary}
              </p>
              {selectedTicket.ai_recommendation && (
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(77,159,255,0.2)' }}>
                  <label style={{ fontSize: '10px', color: '#4D9FFF', textTransform: 'uppercase' }}>Recommended Action</label>
                  <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '12px', margin: '5px 0 0 0' }}>
                    {selectedTicket.ai_recommendation}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Analysis Notes */}
          <div style={{ marginBottom: '20px' }}>
            <label className="ws-detail-section-label">
              Analyst Notes
            </label>
            <textarea
              value={editNotes}
              onChange={e => setEditNotes(e.target.value)}
              placeholder="Add analysis notes..."
              style={{
                width: '100%',
                minHeight: '100px',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '8px',
                color: '#fff',
                padding: '12px',
                fontSize: '13px',
                fontFamily: 'inherit',
                resize: 'vertical',
                marginTop: '8px',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              className="ws-detail-save-btn"
              onClick={handleSaveNotes}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Notes'}
            </button>
          </div>

          {/* Suggested Runbooks */}
          <div style={{ marginBottom: '20px' }}>
            <label className="ws-detail-section-label ws-detail-section-label--accent">
              Suggested Runbooks & SOPs
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {runbooks.filter(rb => {
                const cat = (selectedTicket.category || "").toLowerCase();
                const rbCat = (rb.category || "").toLowerCase();
                return rbCat.includes(cat) || cat.includes(rbCat) || rb.severity_applicable === 'all' || rb.severity_applicable === selectedTicket.severity;
              }).slice(0, 3).map(rb => (
                <div
                  key={rb.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveRunbook(rb)}
                  className={`ws-runbook-pick${activeRunbook?.id === rb.id ? ' ws-runbook-pick--active' : ''}`}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="ws-runbook-pick__title">{rb.name}</div>
                    <span style={{ fontSize: '10px' }}>{activeRunbook?.id === rb.id ? '📖' : '👁️'}</span>
                  </div>
                  <div className="ws-runbook-pick__desc">{rb.description.substring(0, 60)}...</div>
                </div>
              ))}
              {runbooks.length === 0 && <div className="ws-detail-empty">No matching runbooks found.</div>}
            </div>
          </div>

          {/* Expanded Runbook Viewer */}
          {activeRunbook && (
            <div className="ws-runbook-procedure" style={{ marginBottom: '25px', padding: '15px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <div style={{ fontSize: '11px', color: 'var(--signal)', fontWeight: 700 }}>PROCEDURE: {activeRunbook.name.toUpperCase()}</div>
                <button onClick={() => setActiveRunbook(null)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>✕</button>
              </div>

              {[
                { label: 'Identification', steps: activeRunbook.identification_steps, icon: '🔍' },
                { label: 'Containment', steps: activeRunbook.containment_steps, icon: '🛑' },
                { label: 'Eradication', steps: activeRunbook.eradication_steps, icon: '🧹' },
                { label: 'Recovery', steps: activeRunbook.recovery_steps, icon: '♻️' },
                { label: 'Post-Mortem', steps: activeRunbook.post_mortem_steps, icon: '📝' }
              ].map(phase => phase.steps && phase.steps.length > 0 && (
                <div key={phase.label} style={{ marginBottom: '15px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px' }}>
                    {phase.icon} {phase.label.toUpperCase()}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {phase.steps.map((step: any, idx: number) => (
                      <div key={idx} style={{ fontSize: '11px' }}>
                        <div className="ws-runbook-step-text" style={{ marginBottom: '4px' }}>
                          <span style={{ color: 'var(--signal)', marginRight: '6px' }}>{idx + 1}.</span>
                          {interpolate(step.text || step)}
                        </div>
                        {(step.command) && (
                          <div style={{ 
                            padding: '6px 10px', 
                            background: '#000', 
                            borderRadius: '4px', 
                            fontFamily: 'var(--mono)', 
                            fontSize: '10px', 
                            color: 'var(--signal)',
                            border: '1px solid rgba(0,255,136,0.2)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}>
                            <code>{interpolate(step.command)}</code>
                            <button 
                              onClick={() => navigator.clipboard.writeText(interpolate(step.command))}
                              style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: '8px', cursor: 'pointer' }}
                            >
                              COPY
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Evidence / Logs */}
          <div style={{ marginBottom: '25px' }}>
            <label className="ws-detail-section-label">
              Evidence & Artifacts
            </label>
            
            {/* File List */}
            {selectedTicket.evidence && selectedTicket.evidence.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                {selectedTicket.evidence.map(ev => (
                  <div key={ev.id} className="ws-evidence-file">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14px' }}>📄</span>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span className="ws-evidence-file__name">{ev.filename}</span>
                        <span style={{ fontSize: '9px', color: 'var(--text-dim)' }}>{(ev.file_size / 1024).toFixed(1)} KB</span>
                      </div>
                    </div>
                    <button 
                      onClick={async () => {
                        const { getEvidenceDownloadUrl } = await import('../lib/api');
                        window.open(getEvidenceDownloadUrl(ev.id), '_blank');
                      }}
                      style={{ background: 'transparent', border: '1px solid var(--signal)', color: 'var(--signal)', fontSize: '9px', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      DOWNLOAD
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="ws-evidence-drop">
              <div className="ws-evidence-drop__hint">Upload logs or screenshots</div>
              <input 
                type="file" 
                id="evidence-upload" 
                hidden 
                onChange={handleFileUpload} 
                disabled={saving}
              />
              <button
                type="button"
                className="ws-btn-outline"
                onClick={() => document.getElementById('evidence-upload')?.click()}
                disabled={saving}
              >
                {saving ? 'UPLOADING...' : 'SELECT FILE'}
              </button>
            </div>
          </div>

          {/* Assign Analyst */}
          <div style={{ marginBottom: '20px' }}>
            <label className="ws-detail-section-label" style={{ marginBottom: '10px' }}>
              Reassign Analyst
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {users.map(u => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => handleAssign(u.id)}
                  disabled={saving || u.username === selectedTicket.assignee_username}
                  className={`ws-assign-btn${u.username === selectedTicket.assignee_username ? ' ws-assign-btn--selected' : ''}`}
                >
                  {u.username.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Move to Resolved */}
          {selectedTicket.status !== 'resolved' && (
            <button
              type="button"
              className="ws-resolve-btn"
              onClick={async () => {
                await updateTicket(selectedTicket.id, { status: 'resolved' });
                setSelectedTicket(null);
                fetchData();
              }}
            >
              Mark as Resolved
            </button>
          )}
        </div>
        </>
      )}

      {/* Create Ticket Modal */}
      {showCreateModal && (
        <div className="ws-modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div
            className="ws-create-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ws-create-modal-title"
            onClick={e => e.stopPropagation()}
          >
            <div className="ws-create-modal__header">
              <h2 id="ws-create-modal-title" className="ws-create-modal__title">
                Create New Incident
              </h2>
              <button
                type="button"
                className="ws-create-modal__close"
                onClick={() => setShowCreateModal(false)}
                aria-label="Close create incident modal"
              >
                ×
              </button>
            </div>

            <div className="ws-create-modal__body">
              <div className="ws-create-modal__field">
                <label className="ws-create-modal__label">Title *</label>
                <input
                  className="ws-create-modal__input"
                  value={createForm.title}
                  onChange={e => setCreateForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g., Suspicious Login Attempt"
                />
              </div>

              <div className="ws-create-modal__field">
                <label className="ws-create-modal__label">Description</label>
                <textarea
                  className="ws-create-modal__input ws-create-modal__textarea"
                  value={createForm.description}
                  onChange={e => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Detailed description of the incident..."
                />
              </div>

              <div className="ws-create-modal__grid">
                <div className="ws-create-modal__field">
                  <label className="ws-create-modal__label">Severity</label>
                  <select
                    className="ws-create-modal__input ws-create-modal__select"
                    value={createForm.severity}
                    onChange={e => setCreateForm(prev => ({ ...prev, severity: e.target.value }))}
                  >
                    {SEVERITY_OPTIONS.map(s => (
                      <option key={s} value={s}>{s.toUpperCase()}</option>
                    ))}
                  </select>
                </div>

                <div className="ws-create-modal__field">
                  <label className="ws-create-modal__label">Category</label>
                  <input
                    className="ws-create-modal__input"
                    value={createForm.category}
                    onChange={e => setCreateForm(prev => ({ ...prev, category: e.target.value }))}
                    placeholder="e.g., Authentication"
                  />
                </div>
              </div>

              <div className="ws-create-modal__grid">
                <div className="ws-create-modal__field">
                  <label className="ws-create-modal__label">Source IP</label>
                  <input
                    className="ws-create-modal__input"
                    value={createForm.source_ip}
                    onChange={e => setCreateForm(prev => ({ ...prev, source_ip: e.target.value }))}
                    placeholder="192.168.1.100"
                  />
                </div>

                <div className="ws-create-modal__field">
                  <label className="ws-create-modal__label">Affected Asset</label>
                  <input
                    className="ws-create-modal__input"
                    value={createForm.affected_asset}
                    onChange={e => setCreateForm(prev => ({ ...prev, affected_asset: e.target.value }))}
                    placeholder="workstation-01"
                  />
                </div>
              </div>

              <div className="ws-create-modal__grid">
                <div className="ws-create-modal__field">
                  <label className="ws-create-modal__label">MITRE Technique ID</label>
                  <input
                    className="ws-create-modal__input"
                    value={createForm.mitre_technique}
                    onChange={e => setCreateForm(prev => ({ ...prev, mitre_technique: e.target.value }))}
                    placeholder="e.g., T1110"
                  />
                </div>

                <div className="ws-create-modal__field">
                  <label className="ws-create-modal__label">Assign To</label>
                  <select
                    className="ws-create-modal__input ws-create-modal__select"
                    value={createForm.assigned_to_id}
                    onChange={e => setCreateForm(prev => ({ ...prev, assigned_to_id: e.target.value }))}
                  >
                    <option value="">Unassigned</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.username.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="ws-create-modal__actions">
                <button
                  type="button"
                  className="ws-create-modal__submit"
                  onClick={handleCreateTicket}
                  disabled={saving || !createForm.title.trim()}
                >
                  {saving ? 'Creating...' : 'Create Incident'}
                </button>
                <button
                  type="button"
                  className="ws-create-modal__cancel"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
