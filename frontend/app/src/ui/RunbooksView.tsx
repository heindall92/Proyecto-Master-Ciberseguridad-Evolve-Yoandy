import { useState, useEffect } from "react";
import { listRunbooks, createRunbook, updateRunbook, deleteRunbook } from "../lib/api";

interface Runbook {
  id: number;
  name: string;
  category: string;
  description: string;
  containment_steps: string[];
  eradication_steps: string[];
  recovery_steps: string[];
  severity_applicable: string;
  is_active: boolean;
}

const CATEGORIES = ["intrusion", "malware", "phishing", "ransomware", "ddos", "data_breach", "insider_threat", "other"];
const SEVERITIES = ["low", "medium", "high", "critical", "all"];


export default function RunbooksView() {
  const [runbooks, setRunbooks] = useState<Runbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Runbook | null>(null);
  const [editing, setEditing] = useState(false);
  const [filter, setFilter] = useState("all");

  const loadRunbooks = async () => {
    setLoading(true);
    try {
      const data = await listRunbooks();
      setRunbooks(data || []);
    } catch (e) {
      console.error("Load runbooks error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRunbooks();
  }, []);

  const filtered = filter === "all" ? runbooks : runbooks.filter(r => r.category === filter);

  const handleSave = async (rb: Partial<Runbook>) => {
    try {
      if (selected && rb.id) {
        await updateRunbook(rb.id, rb);
      } else {
        await createRunbook(rb as any);
      }
      await loadRunbooks();
      setEditing(false);
      setSelected(null);
    } catch (e) {
      alert("Error guardando runbook");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Eliminar este runbook?")) return;
    try {
      await deleteRunbook(id);
      await loadRunbooks();
      setSelected(null);
    } catch (e) {
      alert("Error eliminando runbook");
    }
  };

  const newRunbook = () => ({
    id: 0,
    name: "",
    category: "intrusion",
    description: "",
    containment_steps: [""],
    eradication_steps: [""],
    recovery_steps: [""],
    severity_applicable: "all",
    is_active: true,
  });

  return (
    <div style={{ flex: 1, padding: '15px', display: 'flex', flexDirection: 'column', gap: '15px', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', color: 'var(--signal)', fontFamily: 'var(--mono)' }}>Runbooks</h1>
          <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Procedimientos operativos del SOC</span>
        </div>
        <button onClick={() => { setSelected(newRunbook() as Runbook); setEditing(true); }} style={{ padding: '6px 12px', background: 'var(--signal)', border: 'none', color: '#000', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>+ Nuevo Runbook</button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <button 
          onClick={() => setFilter("all")}
          style={{ 
            padding: '6px 14px', 
            background: filter === "all" ? 'var(--signal)' : 'rgba(60,255,158,0.1)',
            color: filter === "all" ? '#000' : 'var(--signal)',
            border: filter === "all" ? '1px solid var(--signal)' : '1px solid var(--signal-dim)',
            cursor: 'pointer',
            fontSize: '11px',
            fontFamily: 'var(--mono)',
            textTransform: 'uppercase',
            letterSpacing: '1px'
          }}
        >
         Todo
        </button>
        {CATEGORIES.map(cat => (
          <button 
            key={cat}
            onClick={() => setFilter(cat)}
            style={{ 
              padding: '6px 14px', 
              background: filter === cat ? 'var(--signal)' : 'rgba(60,255,158,0.1)',
              color: filter === cat ? '#000' : 'var(--signal)',
              border: filter === cat ? '1px solid var(--signal)' : '1px solid var(--signal-dim)',
              cursor: 'pointer',
              fontSize: '11px',
              fontFamily: 'var(--mono)',
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}
          >
            {cat.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', gap: '20px', overflow: 'hidden' }}>
        {/* List */}
        <div style={{ 
          width: '350px', 
          overflow: 'auto',
          display: 'flex', 
          flexDirection: 'column', 
          gap: '10px'
        }}>
          {loading && <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>CARGANDO...</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '40px' }}>
              No hay runbooks disponibles
            </div>
          )}
          {filtered.map(rb => (
            <div 
              key={rb.id}
              onClick={() => setSelected(rb)}
              style={{
                padding: '15px',
                background: selected?.id === rb.id ? 'rgba(60,255,158,0.15)' : 'rgba(0,0,0,0.3)',
                border: `1px solid ${selected?.id === rb.id ? 'var(--signal)' : 'var(--line)'}`,
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ 
                  fontFamily: 'var(--mono)', 
                  fontSize: '14px', 
                  color: 'var(--text)',
                  fontWeight: 600
                }}>
                  {rb.name}
                </span>
                <span style={{
                  padding: '2px 8px',
                  background: rb.severity_applicable === 'critical' ? 'var(--danger)' : 
                             rb.severity_applicable === 'high' ? 'orange' : 
                             rb.severity_applicable === 'medium' ? 'yellow' : 'var(--signal)',
                  color: '#000',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontFamily: 'var(--mono)'
                }}>
                  {rb.severity_applicable.toUpperCase()}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '5px' }}>
                {rb.description.substring(0, 80)}...
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-faint)', textTransform: 'uppercase' }}>
                {rb.category} · {rb.containment_steps.length + rb.eradication_steps.length + rb.recovery_steps.length} pasos
              </div>
            </div>
          ))}
        </div>

        {/* Detail/Edit panel */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {!selected && !editing && (
            <div style={{ 
              height: '100%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              color: 'var(--text-dim)'
            }}>
              Selecciona un runbook para ver detalles
            </div>
          )}

          {(selected || editing) && (
            <RunbookDetail 
              runbook={selected!}
              editing={editing}
              onEdit={() => setEditing(true)}
              onSave={handleSave}
              onDelete={() => handleDelete(selected!.id)}
              onCancel={() => { setEditing(false); setSelected(null); }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function RunbookDetail({ 
  runbook, 
  editing, 
  onEdit, 
  onSave, 
  onDelete, 
  onCancel 
}: {
  runbook: Runbook;
  editing: boolean;
  onEdit: () => void;
  onSave: (rb: Partial<Runbook>) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(runbook);

  const updateField = (field: string, value: any) => {
    setForm(f => ({ ...f, [field]: value }));
  };

  const updateStep = (section: string, index: number, value: string) => {
    const steps = [...form[section as keyof Runbook] as string[]];
    steps[index] = value;
    setForm(f => ({ ...f, [section]: steps }));
  };

  const addStep = (section: string) => {
    const steps = [...form[section as keyof Runbook] as string[], ""];
    setForm(f => ({ ...f, [section]: steps }));
  };

  const removeStep = (section: string, index: number) => {
    const steps = (form[section as keyof Runbook] as string[]).filter((_, i) => i !== index);
    setForm(f => ({ ...f, [section]: steps }));
  };

  return (
    <div style={{ flex: 1, padding: '15px', background: 'var(--bg-panel)', border: '1px solid var(--line)', borderRadius: '8px', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ margin: 0, color: 'var(--signal)', fontFamily: 'var(--mono)', fontSize: '18px' }}>
          {editing ? (runbook.id ? "Editar" : "Nuevo") : runbook.name}
        </h2>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {!editing ? (
            <>
              <button onClick={onEdit} style={{ padding: '6px 12px', background: 'var(--signal)', border: 'none', color: '#000', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>Editar</button>
              <button onClick={onDelete} style={{ padding: '6px 12px', background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Eliminar</button>
            </>
          ) : (
            <>
              <button onClick={() => onSave(form)} style={{ padding: '6px 12px', background: 'var(--signal)', border: 'none', color: '#000', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>Guardar</button>
              <button onClick={onCancel} style={{ padding: '6px 12px', background: 'transparent', border: '1px solid var(--line)', color: 'var(--text)', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Cancelar</button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Basic info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-dim)', marginBottom: '5px' }}>Nombre</label>
            {editing ? (
              <input 
                value={form.name} 
                onChange={e => updateField("name", e.target.value)}
                style={inputStyle}
              />
            ) : (
              <div style={valueStyle}>{form.name}</div>
            )}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-dim)', marginBottom: '5px' }}>Categoría</label>
            {editing ? (
              <select 
                value={form.category} 
                onChange={e => updateField("category", e.target.value)}
                style={inputStyle}
              >
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c.replace("_", " ")}</option>
                ))}
              </select>
            ) : (
              <div style={valueStyle}>{form.category}</div>
            )}
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-dim)', marginBottom: '5px' }}>Descripción</label>
          {editing ? (
            <textarea 
              value={form.description} 
              onChange={e => updateField("description", e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          ) : (
            <div style={valueStyle}>{form.description}</div>
          )}
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-dim)', marginBottom: '5px' }}>Severidad aplicable</label>
          {editing ? (
            <select 
              value={form.severity_applicable} 
              onChange={e => updateField("severity_applicable", e.target.value)}
              style={inputStyle}
            >
              {SEVERITIES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          ) : (
            <div style={valueStyle}>{form.severity_applicable}</div>
          )}
        </div>

        {/* Containment */}
        <StepsSection 
          title="Containment (Contención)" 
          steps={form.containment_steps}
          editing={editing}
          onUpdate={(i, v) => updateStep("containment_steps", i, v)}
          onAdd={() => addStep("containment_steps")}
          onRemove={(i) => removeStep("containment_steps", i)}
          icon="🛑"
        />

        {/* Eradication */}
        <StepsSection 
          title="Eradication (Erradicación)" 
          steps={form.eradication_steps}
          editing={editing}
          onUpdate={(i, v) => updateStep("eradication_steps", i, v)}
          onAdd={() => addStep("eradication_steps")}
          onRemove={(i) => removeStep("eradication_steps", i)}
          icon="🧹"
        />

        {/* Recovery */}
        <StepsSection 
          title="Recovery (Recuperación)" 
          steps={form.recovery_steps}
          editing={editing}
          onUpdate={(i, v) => updateStep("recovery_steps", i, v)}
          onAdd={() => addStep("recovery_steps")}
          onRemove={(i) => removeStep("recovery_steps", i)}
          icon="♻️"
        />
      </div>
    </div>
  );
}

function StepsSection({ 
  title, 
  steps, 
  editing, 
  onUpdate, 
  onAdd, 
  onRemove,
  icon 
}: {
  title: string;
  steps: string[];
  editing: boolean;
  onUpdate: (i: number, v: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  icon: string;
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ color: 'var(--signal)', fontFamily: 'var(--mono)', fontSize: '13px' }}>
          {icon} {title}
        </span>
        {editing && (
          <button onClick={onAdd} style={addBtnStyle}>+ Añadir paso</button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {steps.map((step, i) => (
          <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ 
              width: '24px', 
              height: '24px', 
              borderRadius: '50%', 
              background: 'var(--line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              color: 'var(--text-dim)'
            }}>{i + 1}</span>
            {editing ? (
              <>
                <input 
                  value={step} 
                  onChange={e => onUpdate(i, e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button onClick={() => onRemove(i)} style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
              </>
            ) : (
              <div style={{ flex: 1, color: 'var(--text)', fontSize: '12px' }}>
                {step || "(vacío)"}
              </div>
            )}
          </div>
        ))}
        {steps.length === 0 && (
          <div style={{ color: 'var(--text-faint)', fontSize: '11px', padding: '10px' }}>
            No hay pasos definidos
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  background: 'rgba(0,0,0,0.4)',
  border: '1px solid var(--line)',
  borderRadius: '6px',
  color: 'var(--text)',
  fontSize: '13px',
  fontFamily: 'var(--sans)'
};

const valueStyle = {
  padding: '10px 12px',
  background: 'rgba(0,0,0,0.2)',
  border: '1px solid var(--line)',
  borderRadius: '6px',
  color: 'var(--text)',
  fontSize: '13px'
};

const addBtnStyle = {
  padding: '4px 10px',
  background: 'transparent',
  border: '1px solid var(--signal)',
  color: 'var(--signal)',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '11px'
};