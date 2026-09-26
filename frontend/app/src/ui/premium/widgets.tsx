import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, AlertCircle, Info, X } from "lucide-react";

/* ---------- Número animado (sustituye al CountUp por intervalos) ---------- */
export function AnimatedNumber({ value, duration = 700 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { fromRef.current = value; setDisplay(value); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const current = Math.round(from + (value - from) * eased);
      fromRef.current = current;
      setDisplay(current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{display.toLocaleString()}</>;
}

/* ---------- Mini gráfico de línea ---------- */
export function Sparkline({ points, height = 28 }: { points: number[]; height?: number }) {
  if (!points || points.length < 2) return null;
  const W = 100;
  const max = Math.max(...points, 1);
  const coords = points.map((v, i) => `${((i / (points.length - 1)) * W).toFixed(2)},${(height - (v / max) * (height - 3) - 1.5).toFixed(2)}`);
  return (
    <svg className="vx-spark" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={`0,${height} ${coords.join(" ")} ${W},${height}`} className="vx-spark__area" />
      <polyline points={coords.join(" ")} className="vx-spark__line" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ---------- Tarjeta KPI ---------- */
export type Tone = "accent" | "danger" | "warning" | "info" | "ok";

export function KpiCard({ icon: Icon, label, value, sub, tone = "accent", spark, onClick }: {
  icon: LucideIcon; label: string; value: number; sub?: React.ReactNode; tone?: Tone; spark?: number[]; onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={`vx-kpi vx-tone-${tone}`} onClick={onClick} type={onClick ? "button" : undefined}>
      <div className="vx-kpi__top">
        <span className="vx-kpi__icon"><Icon size={16} /></span>
        <span className="vx-kpi__label">{label}</span>
      </div>
      <div className="vx-kpi__value"><AnimatedNumber value={value} /></div>
      {sub && <div className="vx-kpi__sub">{sub}</div>}
      {spark && spark.length > 1 && <Sparkline points={spark} />}
    </Tag>
  );
}

/* ---------- Punto de estado ---------- */
export function StatusDot({ state }: { state: "ok" | "warn" | "down" | "idle" }) {
  return <span className={`vx-dot vx-dot--${state}`} aria-hidden="true" />;
}

/* ---------- Botón "mantener para confirmar" (acciones destructivas) ---------- */
export function HoldButton({ children, onConfirm, holdMs = 900, disabled, title, className = "" }: {
  children: React.ReactNode; onConfirm: () => void; holdMs?: number; disabled?: boolean; title?: string; className?: string;
}) {
  const [progress, setProgress] = useState(0);
  const raf = useRef(0);
  const startAt = useRef(0);
  const done = useRef(false);

  const stop = () => {
    cancelAnimationFrame(raf.current);
    if (!done.current) setProgress(0);
  };
  const start = () => {
    if (disabled) return;
    done.current = false;
    startAt.current = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - startAt.current) / holdMs);
      setProgress(p);
      if (p >= 1) {
        done.current = true;
        onConfirm();
        setTimeout(() => { done.current = false; setProgress(0); }, 400);
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <button
      type="button"
      className={`vx-hold ${className}`}
      disabled={disabled}
      title={title}
      aria-label={title}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); start(); } }}
      onKeyUp={(e) => { if (e.key === "Enter" || e.key === " ") stop(); }}
      style={{ ["--hold" as string]: progress }}
    >
      <span className="vx-hold__fill" aria-hidden="true" />
      <span className="vx-hold__label">{children}</span>
    </button>
  );
}

/* ---------- Avisos (toasts) ---------- */
type ToastKind = "ok" | "err" | "info";
interface ToastMsg { id: number; kind: ToastKind; text: string }

export function toast(text: string, kind: ToastKind = "info", ms?: number) {
  window.dispatchEvent(new CustomEvent("valhalla-toast", { detail: { text, kind, ms } }));
}

export function Toaster() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => {
    let seq = 0;
    const onToast = (e: Event) => {
      const { text, kind, ms } = (e as CustomEvent).detail as { text: string; kind: ToastKind; ms?: number };
      const id = ++seq;
      setItems((prev) => [...prev.slice(-3), { id, kind, text }]);
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), ms ?? (kind === "err" ? 7000 : 4000));
    };
    window.addEventListener("valhalla-toast", onToast);
    return () => window.removeEventListener("valhalla-toast", onToast);
  }, []);
  const Icon = { ok: Check, err: AlertCircle, info: Info };
  return (
    <div className="vx-toaster" role="status" aria-live="polite">
      {items.map((t) => {
        const I = Icon[t.kind];
        return (
          <div key={t.id} className={`vx-toast vx-toast--${t.kind}`}>
            <I size={16} />
            <span>{t.text}</span>
            <button onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))} aria-label="Cerrar"><X size={14} /></button>
          </div>
        );
      })}
    </div>
  );
}
