import React, { useState, useEffect, useCallback } from 'react';
import {
  listTickets,
  createTicket,
  updateTicket,
  assignTicket,
  resolveTicket,
  listUsers,
  getDashboardSummary,
  type TicketOut,
  type UserOut,
} from '../lib/api';
import { playNotificationSound, playResolvedSound } from './audio';

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
  created_at: string;
}

const COLUMNS: { id: KanbanStatus; label: string; color: string }[] = [
  { id: 'open', label: 'TRIAGE (NEW)', color: '#4D9FFF' },
  { id: 'in_progress', label: 'INVESTIGATION', color: '#FF9F1C' },
  { id: 'escalated', label: 'MITIGATION & RESPONSE', color: '#FF4D4D' },
  { id: 'resolved', label: 'RESOLVED', color: '#4DFFA6' },
];

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#FF0055',
  high: '#FF4D4D',
  medium: '#4D9FFF',
  low: '#4DFFA6',
};

const SEVERITY_OPTIONS = ['critical', 'high', 'medium', 'low'];

export default function AnalystWorkspace() {
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

  // Create form state
  const [createForm, setCreateForm] = useState({
    title: '',
    description: '',
    severity: 'medium',
    category: '',
    source_ip: '',
    affected_asset: '',
  });

  // Detail/edit state
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [ticketsData, usersData, statsData] = await Promise.all([
        listTickets(),
        listUsers(),
        getDashboardSummary(),
      ]);
      const mapped: TicketCard[] = ticketsData.map((t: TicketOut) => ({
        id: t.id,
        title: t.title,
        status: t.status as KanbanStatus,
        severity: t.severity as any,
        progress: t.status === 'resolved' ? 100 : t.status === 'in_progress' ? 50 : 0,
        actions: t.analysis_notes ? '1/3 Actions' : '0/3 Actions',
        tags: t.category ? [t.category] : [],
        assignee_username: t.assignee_username,
        ai_summary: t.ai_summary,
        ai_recommendation: t.ai_recommendation,
        analysis_notes: t.analysis_notes,
        description: t.description,
        source_ip: t.source_ip,
        affected_asset: t.affected_asset,
        created_at: t.created_at,
      }));
      setTickets(mapped);
      setUsers(usersData);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to fetch workspace data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
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
        await resolveTicket(ticketId, 'Resolved from workspace');
        playResolvedSound();
      } else {
        await updateTicket(ticketId, { status: newStatus });
        const wasResolved = tickets.find(t => t.id === ticketId)?.status === 'resolved';
        if (wasResolved) {
          playNotificationSound();
        }
      }
    } catch (err) {
      console.error('Failed to update ticket status:', err);
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
      console.error('Failed to save notes:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleAssign = async (userId: number) => {
    if (!selectedTicket) return;
    setSaving(true);
    try {
      await assignTicket(selectedTicket.id, userId);
      await fetchData();
      setSelectedTicket(null);
    } catch (err) {
      console.error('Failed to assign ticket:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTicket = async () => {
    if (!createForm.title.trim()) return;
    setSaving(true);
    try {
      await createTicket({
        title: createForm.title,
        description: createForm.description,
        severity: createForm.severity,
        category: createForm.category,
        source_ip: createForm.source_ip || null,
        affected_asset: createForm.affected_asset || null,
      });
      setShowCreateModal(false);
      setCreateForm({ title: '', description: '', severity: 'medium', category: '', source_ip: '', affected_asset: '' });
      await fetchData();
    } catch (err) {
      console.error('Failed to create ticket:', err);
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
    <div style={{ height: '100%', padding: '30px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      {/* Screen reader announcements */}
      <div aria-live="polite" aria-atomic="true" style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
        {selectedTicket ? `Opening incident ${selectedTicket.id}: ${selectedTicket.title}` : ''}
      </div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600, color: '#fff', letterSpacing: '0.5px' }}>
            Incident Response Board
          </h1>
          <span style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '5px', display: 'block' }}>
            Manage analyst workloads, playbook actions, and active threat mitigations.
          </span>
        </div>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          {/* Filters */}
          <select
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value)}
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            <option value="all">All Priorities</option>
            {SEVERITY_OPTIONS.map(s => (
              <option key={s} value={s}>{s.toUpperCase()}</option>
            ))}
          </select>
          <select
            value={filterAnalyst}
            onChange={e => setFilterAnalyst(e.target.value)}
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            <option value="all">All Analysts</option>
            <option value="unassigned">Unassigned</option>
            {users.map(u => (
              <option key={u.id} value={u.username}>{u.username.toUpperCase()}</option>
            ))}
          </select>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              background: 'var(--signal)',
              color: '#000',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            + New Incident
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', padding: '15px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
            <span style={{ color: '#FF0055', fontWeight: 600 }}>{stats.metrics?.tickets_open || 0}</span> Open Tickets
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
            <span style={{ color: '#FF4D4D', fontWeight: 600 }}>{getTicketsByStatus('escalated').length}</span> Escalated
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
            <span style={{ color: '#4DFFA6', fontWeight: 600 }}>{getTicketsByStatus('resolved').length}</span> Resolved
          </div>
        </div>
      )}

      {/* Board */}
      <div style={{ display: 'flex', gap: '20px', flex: 1, overflowX: 'auto', paddingBottom: '10px' }}>
        {COLUMNS.map(col => {
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
                  <span style={{ fontSize: '11px', color: col.color, letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
                    {col.label}
                  </span>
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>{colTickets.length}</span>
                </div>
              </div>

              {/* Cards Container */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto', paddingRight: '5px' }}>
                {colTickets.map(ticket => (
                  <div
                    key={ticket.id}
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
                      border: focusedId === ticket.id ? '2px solid var(--signal)' : draggedId === ticket.id ? '2px solid var(--signal)' : '1px solid rgba(255, 255, 255, 0.05)',
                      borderRadius: '8px',
                      padding: '16px',
                      position: 'relative',
                      cursor: 'grab',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                      transition: 'transform 0.2s, background 0.2s, opacity 0.2s',
                      minHeight: '120px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'rgba(255,255,255,0.3)', fontSize: '10px', marginBottom: '8px' }}>
                      <span>#{ticket.id}</span>
                      <span style={{ textTransform: 'uppercase' }}>{ticket.severity}</span>
                    </div>

                    {/* Title */}
                    <div style={{ color: '#fff', fontSize: '14px', fontWeight: 500, lineHeight: '1.4', marginBottom: '10px' }}>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' }}>
                      {/* Progress Bar */}
                      <div style={{ width: '40%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{
                          width: `${ticket.progress}%`,
                          height: '100%',
                          background: PRIORITY_COLORS[ticket.severity],
                          borderRadius: '2px',
                        }} />
                      </div>

                      {/* Assignee */}
                      {ticket.assignee_username ? (
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
                      ) : (
                        <div title="Unassigned" style={{
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
          <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '500px',
          height: '100%',
          background: 'rgba(10, 20, 15, 0.98)',
          borderLeft: '1px solid var(--signal)',
          padding: '30px',
          overflowY: 'auto',
          zIndex: 1000,
          boxShadow: '-10px 0 30px rgba(0,0,0,0.5)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h2 style={{ margin: 0, color: '#fff', fontSize: '18px' }}>
              Incident #{selectedTicket.id}
            </h2>
            <button
              onClick={() => setSelectedTicket(null)}
              aria-label="Close incident details"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-dim)',
                fontSize: '20px',
                cursor: 'pointer',
                padding: '4px',
                lineHeight: 1,
              }}
            >
              ×
            </button>
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
          <h3 style={{ color: '#fff', margin: '0 0 15px 0', fontSize: '16px' }}>
            {selectedTicket.title}
          </h3>

          {/* Description */}
          {selectedTicket.description && (
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Description
              </label>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '13px', lineHeight: '1.6', margin: '8px 0 0 0' }}>
                {selectedTicket.description}
              </p>
            </div>
          )}

          {/* Metadata */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
            {selectedTicket.source_ip && (
              <div>
                <label style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Source IP</label>
                <div style={{ color: '#fff', fontSize: '13px', marginTop: '4px' }}>{selectedTicket.source_ip}</div>
              </div>
            )}
            {selectedTicket.affected_asset && (
              <div>
                <label style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Affected Asset</label>
                <div style={{ color: '#fff', fontSize: '13px', marginTop: '4px' }}>{selectedTicket.affected_asset}</div>
              </div>
            )}
            <div>
              <label style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Created</label>
              <div style={{ color: '#fff', fontSize: '13px', marginTop: '4px' }}>
                {new Date(selectedTicket.created_at).toLocaleString()}
              </div>
            </div>
            <div>
              <label style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Assignee</label>
              <div style={{ color: '#fff', fontSize: '13px', marginTop: '4px' }}>
                {selectedTicket.assignee_username || 'Unassigned'}
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
            <label style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px' }}>
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
              onClick={handleSaveNotes}
              disabled={saving}
              style={{
                marginTop: '10px',
                background: 'var(--signal)',
                color: '#000',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving...' : 'Save Notes'}
            </button>
          </div>

          {/* Assign Analyst */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px', display: 'block' }}>
              Reassign Analyst
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {users.map(u => (
                <button
                  key={u.id}
                  onClick={() => handleAssign(u.id)}
                  disabled={saving || u.username === selectedTicket.assignee_username}
                  style={{
                    padding: '6px 12px',
                    background: u.username === selectedTicket.assignee_username ? 'rgba(77,159,255,0.3)' : 'rgba(0,0,0,0.3)',
                    border: `1px solid ${u.username === selectedTicket.assignee_username ? 'rgba(77,159,255,0.5)' : 'rgba(255,255,255,0.15)'}`,
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '12px',
                    cursor: (saving || u.username === selectedTicket.assignee_username) ? 'default' : 'pointer',
                    opacity: (saving || u.username === selectedTicket.assignee_username) ? 0.6 : 1,
                  }}
                >
                  {u.username.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Move to Resolved */}
          {selectedTicket.status !== 'resolved' && (
            <button
              onClick={async () => {
                await updateTicket(selectedTicket.id, { status: 'resolved' });
                setSelectedTicket(null);
                fetchData();
              }}
              style={{
                width: '100%',
                background: 'rgba(77,255,166,0.1)',
                color: '#4DFFA6',
                border: '1px solid rgba(77,255,166,0.3)',
                padding: '12px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '1px',
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
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1001,
        }}>
          <div style={{
            background: 'rgba(10, 20, 15, 0.98)',
            border: '1px solid var(--signal)',
            borderRadius: '12px',
            padding: '30px',
            width: '500px',
            maxHeight: '90vh',
            overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: '#fff', fontSize: '18px' }}>Create New Incident</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                aria-label="Close create incident modal"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-dim)',
                  fontSize: '20px',
                  cursor: 'pointer',
                  padding: '4px',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>
                  Title *
                </label>
                <input
                  value={createForm.title}
                  onChange={e => setCreateForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g., Suspicious Login Attempt"
                  style={{
                    width: '100%',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '8px',
                    color: '#fff',
                    padding: '12px',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>
                  Description
                </label>
                <textarea
                  value={createForm.description}
                  onChange={e => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Detailed description of the incident..."
                  style={{
                    width: '100%',
                    minHeight: '80px',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '8px',
                    color: '#fff',
                    padding: '12px',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>
                    Severity
                  </label>
                  <select
                    value={createForm.severity}
                    onChange={e => setCreateForm(prev => ({ ...prev, severity: e.target.value }))}
                    style={{
                      width: '100%',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '8px',
                      color: '#fff',
                      padding: '12px',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    {SEVERITY_OPTIONS.map(s => (
                      <option key={s} value={s}>{s.toUpperCase()}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>
                    Category
                  </label>
                  <input
                    value={createForm.category}
                    onChange={e => setCreateForm(prev => ({ ...prev, category: e.target.value }))}
                    placeholder="e.g., Authentication"
                    style={{
                      width: '100%',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '8px',
                      color: '#fff',
                      padding: '12px',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>
                    Source IP
                  </label>
                  <input
                    value={createForm.source_ip}
                    onChange={e => setCreateForm(prev => ({ ...prev, source_ip: e.target.value }))}
                    placeholder="192.168.1.100"
                    style={{
                      width: '100%',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '8px',
                      color: '#fff',
                      padding: '12px',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>
                    Affected Asset
                  </label>
                  <input
                    value={createForm.affected_asset}
                    onChange={e => setCreateForm(prev => ({ ...prev, affected_asset: e.target.value }))}
                    placeholder="workstation-01"
                    style={{
                      width: '100%',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '8px',
                      color: '#fff',
                      padding: '12px',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  onClick={handleCreateTicket}
                  disabled={saving || !createForm.title.trim()}
                  style={{
                    flex: 1,
                    background: 'var(--signal)',
                    color: '#000',
                    border: 'none',
                    padding: '12px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saving ? 'Creating...' : 'Create Incident'}
                </button>
                <button
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    color: 'var(--text-dim)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    padding: '12px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
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
