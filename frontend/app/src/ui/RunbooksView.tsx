import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown, ArrowUp, BookOpen, Bug, Copy, Database, Fish, Lock, Pencil, Plus, Save, Search, ServerCrash, ShieldAlert,
  Trash2, UserX, Waves, X, Info, CircleDot,
} from "lucide-react";
import { listRunbooks, createRunbook, updateRunbook, deleteRunbook, type Runbook, type RunbookStep } from "../lib/api";
import { useAppSelector } from "../store/hooks";
import { HoldButton, toast } from "./premium/widgets";
import "./premium/dashboard.css";
import "./premium/workspace.css";
import "./premium/executive.css";
import "./intel/intel.css";

/** Runbooks: procedimientos de respuesta por tipo de incidente, con las 5 fases de NIST SP 800-61. */

const PHASES = [
  ["identification_steps", "Identificación", "Confirmar el incidente y su alcance"],
  ["containment_steps", "Contención", "Limitar el daño y cortar al atacante"],
  ["eradication_steps", "Erradicación", "Eliminar la causa y los artefactos"],
  ["recovery_steps", "Recuperación", "Volver a la operación normal vigilando"],
  ["post_mortem_steps", "Lecciones aprendidas", "Qué mejorar para la próxima vez"],
] as const;
type PhaseKey = typeof PHASES[number][0];
const CATS: Record<string, [string, typeof Bug]> = {
  intrusion: ["Intrusión", ShieldAlert], malware: ["Malware", Bug], phishing: ["Phishing", Fish], ransomware: ["Ransomware", Lock],
  ddos: ["DDoS", Waves], data_breach: ["Fuga de datos", Database], insider_threat: ["Amenaza interna", UserX], other: ["Otros", ServerCrash],
};
const SEV_ES: Record<string, string> = { all: "Todas", low: "Baja", medium: "Media", high: "Alta", critical: "Crítica" };
const norm = (s: RunbookStep): { text: string; command?: string } => (typeof s === "string" ? { text: s } : s);
const EMPTY: Omit<Runbook, "id"> = { name: "", category: "intrusion", description: "", identification_steps: [], containment_steps: [], eradication_steps: [], recovery_steps: [], post_mortem_steps: [], severity_applicable: "all", is_active: true };

function Editor({ initial, onClose, onSaved }: { initial: Omit<Runbook, "id"> & { id?: number }; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(() => ({ ...initial, ...Object.fromEntries(PHASES.map(([k]) => [k, (initial[k] ?? []).map(norm)])) }) as typeof initial);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const steps = (k: PhaseKey) => f[k] as { text: string; command?: string }[];
  const setSteps = (k: PhaseKey, v: { text: string; command?: string }[]) => setF(p => ({ ...p, [k]: v }));
  const save = async () => {
    setErr(null); setBusy(true);
    const payload = { ...f, ...Object.fromEntries(PHASES.map(([k]) => [k, steps(k).filter(s => s.text.trim()).map(s => ({ text: s.text.trim(), ...(s.command?.trim() ? { command: s.command.trim() } : {}) }))])) };
    try {
      if (initial.id) await updateRunbook(initial.id, payload); else await createRunbook(payload as Omit<Runbook, "id">);
      toast(initial.id ? "Runbook actualizado." : "Runbook creado.", "ok"); onSaved(); onClose();
    } catch (e) { setErr(e instanceof Error ? e.message.replace(/^HTTP \d+:\s*/, "") : String(e)); }
    finally { setBusy(false); }
  };
  return createPortal(<>
    <div className="wk-drawer-backdrop" onClick={onClose} aria-hidden="true" />
    <aside className="wk-drawer rb-drawer" role="dialog" aria-modal="true" aria-label={initial.id ? "Editar runbook" : "Nuevo runbook"}>
      <div className="wk-drawer__head"><Pencil size={15} /><span className="wk-drawer__id">{initial.id ? "Editar runbook" : "Nuevo runbook"}</span>
        <button className="vx-iconbtn" style={{ marginLeft: "auto" }} onClick={onClose} aria-label="Cerrar"><X size={16} /></button></div>
      <div className="wk-drawer__scroll">
        <div className="rb-form">
          <label className="rb-full">Nombre<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} maxLength={128} /></label>
          <label>Categoría<select value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>{Object.entries(CATS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label>Severidad aplicable<select value={f.severity_applicable} onChange={e => setF({ ...f, severity_applicable: e.target.value })}>{Object.entries(SEV_ES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="rb-full">Descripción<textarea rows={3} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} maxLength={2000} /></label>
        </div>
        {PHASES.map(([k, label]) => (
          <section key={k} className="wk-section">
            <div className="wk-section__head"><CircleDot size={13} />{label}<span className="wk-sec-tools in-muted">{steps(k).length}</span></div>
            <div className="wk-section__body rb-steps-edit">
              {steps(k).map((s, i) => (
                <div key={i} className="rb-step-edit">
                  <span className="rb-num">{i + 1}</span>
                  <div>
                    <input value={s.text} onChange={e => setSteps(k, steps(k).map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} placeholder="Qué hay que hacer" maxLength={600} />
                    <input className="rb-cmd-in" value={s.command ?? ""} onChange={e => setSteps(k, steps(k).map((x, j) => (j === i ? { ...x, command: e.target.value } : x)))} placeholder="Comando o referencia (opcional)" maxLength={600} />
                  </div>
                  <div className="rb-step-tools">
                    <button type="button" className="vx-iconbtn" disabled={i === 0} onClick={() => { const a = [...steps(k)]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setSteps(k, a); }} aria-label="Subir"><ArrowUp size={12} /></button>
                    <button type="button" className="vx-iconbtn" disabled={i === steps(k).length - 1} onClick={() => { const a = [...steps(k)]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; setSteps(k, a); }} aria-label="Bajar"><ArrowDown size={12} /></button>
                    <button type="button" className="vx-iconbtn" onClick={() => setSteps(k, steps(k).filter((_, j) => j !== i))} aria-label="Quitar paso"><X size={12} /></button>
                  </div>
                </div>
              ))}
              <button type="button" className="vp-btn rb-add" onClick={() => setSteps(k, [...steps(k), { text: "" }])} disabled={steps(k).length >= 30}><Plus size={13} />Añadir paso</button>
            </div>
          </section>
        ))}
        {err && <p className="wk-form__err">{err}</p>}
      </div>
      <div className="wk-drawer__foot">
        <button className="vp-btn" onClick={onClose}>Cancelar</button>
        <button className="vp-btn vp-btn--primary" onClick={save} disabled={busy || f.name.trim().length < 3 || !f.description.trim()}><Save size={13} />{busy ? "Guardando…" : "Guardar"}</button>
      </div>
    </aside>
  </>, document.body);
}

export default function RunbooksView() {
  const role = (useAppSelector(s => s.auth.user?.role) ?? "").toLowerCase();
  const canEdit = ["admin", "analyst", "analista"].includes(role);
  const [list, setList] = useState<Runbook[] | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [open, setOpen] = useState<Runbook | null>(null);
  const [edit, setEdit] = useState<(Omit<Runbook, "id"> & { id?: number }) | null>(null);

  const load = () => listRunbooks().then(l => setList(l.filter(r => r.is_active))).catch(() => setList([]));
  useEffect(() => { load(); }, []);

  const rows = useMemo(() => (list ?? []).filter(r => (cat === "all" || r.category === cat) && (!q || `${r.name} ${r.description}`.toLowerCase().includes(q.toLowerCase()))), [list, q, cat]);
  const copy = (c: string) => { navigator.clipboard.writeText(c); toast("Copiado.", "ok"); };
  const remove = async (r: Runbook) => {
    try { await deleteRunbook(r.id); toast("Runbook archivado.", "ok"); setOpen(null); load(); }
    catch (e) { toast(`No se pudo archivar: ${e instanceof Error ? e.message : e}`, "err"); }
  };

  return (
    <div className="view in rb">
      <div className="wk-head">
        <div><h1>Runbooks</h1><p>Procedimientos de respuesta por tipo de incidente (NIST SP 800-61)</p></div>
        <div className="in-bar">
          <label className="wk-search"><Search size={15} /><input className="vp-bare-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar procedimiento…" />
            {q && <button className="wk-search__clear" onClick={() => setQ("")} aria-label="Borrar"><X size={13} /></button>}</label>
          {canEdit && <button type="button" className="vp-btn vp-btn--primary" onClick={() => setEdit({ ...EMPTY })}><Plus size={14} />Nuevo</button>}
        </div>
      </div>
      <div className="in-body">
        <div className="in-vulns">
          <div className="wk-chipset rb-cats">
            <button type="button" aria-pressed={cat === "all"} onClick={() => setCat("all")}>Todos <small>{list?.length ?? 0}</small></button>
            {Object.entries(CATS).filter(([k]) => (list ?? []).some(r => r.category === k)).map(([k, [l, I]]) => (
              <button key={k} type="button" aria-pressed={cat === k} onClick={() => setCat(k)}><I size={12} /> {l} <small>{(list ?? []).filter(r => r.category === k).length}</small></button>
            ))}
          </div>
          {!list ? <p className="in-empty">Cargando…</p> : !rows.length ? <p className="in-empty">Ningún runbook con este filtro.</p> : (
            <div className="rb-grid">
              {rows.map(r => {
                const [label, I] = CATS[r.category] ?? CATS.other;
                const counts = PHASES.map(([k]) => (r[k] ?? []).length);
                return (
                  <button key={r.id} type="button" className="in-panel rb-card" onClick={() => setOpen(r)}>
                    <div className="rb-card__top"><span className="sy-icon rb-icon"><I size={17} /></span><span className="in-muted">{label}</span>{r.severity_applicable !== "all" && <span className="in-tag">{SEV_ES[r.severity_applicable]}</span>}</div>
                    <b>{r.name}</b>
                    <p>{r.description}</p>
                    <div className="rb-phases" title={PHASES.map(([, l], i) => `${l}: ${counts[i]}`).join(" · ")}>
                      {PHASES.map(([k], i) => <i key={k} style={{ flexGrow: Math.max(counts[i], 0.4) }} className={counts[i] ? "" : "is-empty"} />)}
                    </div>
                    <small className="in-muted">{counts.reduce((a, b) => a + b, 0)} pasos en {counts.filter(Boolean).length} fases</small>
                  </button>
                );
              })}
            </div>
          )}
          <p className="in-foot"><Info size={12} />El Workspace sugiere automáticamente el runbook de cada incidente según su categoría. Archivar un runbook lo oculta sin borrar su historial.</p>
        </div>
      </div>

      {open && createPortal(<>
        <div className="wk-drawer-backdrop" onClick={() => setOpen(null)} aria-hidden="true" />
        <aside className="wk-drawer" role="dialog" aria-modal="true" aria-label={open.name}>
          <div className="wk-drawer__head"><BookOpen size={15} /><span className="wk-drawer__id">{CATS[open.category]?.[0] ?? open.category}</span>
            <button className="vx-iconbtn" style={{ marginLeft: "auto" }} onClick={() => setOpen(null)} aria-label="Cerrar"><X size={16} /></button></div>
          <div className="wk-drawer__scroll">
            <h2 className="wk-drawer__title">{open.name}</h2>
            <p className="in-text">{open.description}</p>
            <ol className="rb-flow">
              {PHASES.map(([k, label, hint], pi) => {
                const st = (open[k] ?? []).map(norm);
                return (
                  <li key={k} className={st.length ? "" : "is-empty"}>
                    <div className="rb-flow__head"><span className="rb-num">{pi + 1}</span><b>{label}</b><small>{hint}</small></div>
                    {st.length ? (
                      <ul>{st.map((s, i) => (
                        <li key={i}><span>{s.text}</span>
                          {s.command && <div className="rb-cmd"><code>{s.command}</code><button type="button" className="vx-iconbtn" onClick={() => copy(s.command!)} aria-label="Copiar comando"><Copy size={12} /></button></div>}
                        </li>
                      ))}</ul>
                    ) : <p className="in-muted">Sin pasos definidos.</p>}
                  </li>
                );
              })}
            </ol>
          </div>
          {canEdit && (
            <div className="wk-drawer__foot">
              {role === "admin" && <HoldButton className="hp-block hp-block--wide" onConfirm={() => remove(open)} title="Mantén pulsado para archivar"><Trash2 size={13} />Archivar</HoldButton>}
              <button className="vp-btn vp-btn--primary" onClick={() => { setEdit(open); setOpen(null); }}><Pencil size={13} />Editar</button>
            </div>
          )}
        </aside>
      </>, document.body)}
      {edit && <Editor initial={edit} onClose={() => setEdit(null)} onSaved={load} />}
    </div>
  );
}
