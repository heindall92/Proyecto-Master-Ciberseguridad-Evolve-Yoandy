import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Search, CornerDownLeft } from "lucide-react";

export interface PaletteCommand {
  id: string;
  label: string;
  group: string;
  icon: LucideIcon;
  hint?: string;
  keywords?: string;
  run: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
  lang: "es" | "en";
}

// Normaliza para buscar sin tildes ni mayúsculas ("auditoria" encuentra "Auditoría").
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function CommandPalette({ open, onClose, commands, lang }: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return commands;
    return commands.filter((c) => norm(`${c.label} ${c.group} ${c.keywords ?? ""}`).includes(q));
  }, [commands, query]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const execute = (cmd?: PaletteCommand) => {
    if (!cmd) return;
    onClose();
    cmd.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); execute(results[active]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  let lastGroup = "";
  return (
    <div className="vp-modal-backdrop" onMouseDown={onClose}>
      <div className="vp-pop vp-palette" role="dialog" aria-modal="true" aria-label={lang === "es" ? "Buscar" : "Search"} onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="vp-palette__input">
          <Search size={18} />
          <input
            ref={inputRef}
            className="vp-bare-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={lang === "es" ? "Buscar módulo o acción…" : "Search module or action…"}
            aria-controls="vp-palette-list"
            aria-activedescendant={results[active] ? `vp-cmd-${results[active].id}` : undefined}
          />
          <span className="vp-kbd">Esc</span>
        </div>
        <div className="vp-palette__list" id="vp-palette-list" role="listbox" ref={listRef}>
          {results.length === 0 && (
            <div className="vp-empty">
              <Search size={22} />
              <strong>{lang === "es" ? "Sin resultados" : "No results"}</strong>
              {lang === "es" ? `Nada coincide con «${query}».` : `Nothing matches "${query}".`}
            </div>
          )}
          {results.map((c, idx) => {
            const header = c.group !== lastGroup ? <div className="vp-menu-label">{c.group}</div> : null;
            lastGroup = c.group;
            const Icon = c.icon;
            return (
              <div key={c.id}>
                {header}
                <button
                  id={`vp-cmd-${c.id}`}
                  data-idx={idx}
                  role="option"
                  aria-selected={idx === active}
                  className="vp-menu-item vp-palette__item"
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => execute(c)}
                >
                  <Icon size={16} />
                  {c.label}
                  {c.hint && <span className="vp-menu-item__hint">{c.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="vp-palette__foot">
          <span><span className="vp-kbd">↑</span> <span className="vp-kbd">↓</span> {lang === "es" ? "navegar" : "navigate"}</span>
          <span><span className="vp-kbd"><CornerDownLeft size={10} /></span> {lang === "es" ? "abrir" : "open"}</span>
          <span><span className="vp-kbd">Esc</span> {lang === "es" ? "cerrar" : "close"}</span>
        </div>
      </div>
    </div>
  );
}
