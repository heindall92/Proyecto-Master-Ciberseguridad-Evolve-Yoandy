import { Check, Palette, SunMoon, Languages, ScanLine, Tv, Moon, Sun, SlidersHorizontal } from "lucide-react";

// Acentos disponibles: deben coincidir con body[data-scheme=...] en HUD.css.
// "forest" es el acento base (predeterminado). "dark"/"light" = muestra en cada tema.
export const ACCENTS = [
  { id: "forest", dark: "#52b788", light: "#2d6a4f", es: "Bosque", en: "Forest" },
  { id: "green", dark: "#3cff9e", light: "#12955a", es: "Eléctrico", en: "Electric" },
  { id: "teal", dark: "#2ee6c8", light: "#0e7c7b", es: "Agua", en: "Aqua" },
  { id: "cyan", dark: "#4ae3ff", light: "#0b7fab", es: "Cian", en: "Cyan" },
  { id: "blue", dark: "#5b9dff", light: "#1f5fbf", es: "Azul", en: "Blue" },
  { id: "purple", dark: "#b84dff", light: "#6d3fc0", es: "Púrpura", en: "Purple" },
  { id: "amber", dark: "#ffb454", light: "#b06a00", es: "Ámbar", en: "Amber" },
  { id: "orange", dark: "#ff8a3d", light: "#c2560c", es: "Naranja", en: "Orange" },
  { id: "red", dark: "#ff5a6a", light: "#c2362b", es: "Rojo", en: "Red" },
] as const;

interface Props {
  lang: "es" | "en";
  theme: "dark" | "light";
  scheme: string;
  scanlines: boolean;
  tvMode: boolean;
  isAdmin: boolean;
  onScheme: (s: string) => void;
  onTheme: (t: "dark" | "light") => void;
  onLang: (l: "es" | "en") => void;
  onScanlines: (v: boolean) => void;
  onTvMode: (v: boolean) => void;
  onOpenGlobalSettings: () => void;
  onClose: () => void;
}

export default function QuickSettings(p: Props) {
  const es = p.lang === "es";
  return (
    <div className="vp-backdrop" onClick={p.onClose}>
      <div className="vp-pop" style={{ width: 320 }} role="dialog" aria-label={es ? "Apariencia" : "Appearance"} onClick={(e) => e.stopPropagation()}>
        <div className="vp-pop__head">
          <Palette size={16} color="var(--signal)" />
          <div>
            <div className="vp-pop__title">{es ? "Apariencia" : "Appearance"}</div>
            <div className="vp-pop__sub">{es ? "Se guarda en este navegador" : "Saved in this browser"}</div>
          </div>
        </div>
        <div className="vp-pop__body">
          <div className="vp-field">
            <div className="vp-field__label"><Palette size={12} />{es ? "Color de acento" : "Accent colour"}</div>
            <div className="vp-swatches">
              {ACCENTS.map((a) => (
                <button key={a.id} className="vp-swatch" aria-pressed={p.scheme === a.id} style={{ ["--sw" as string]: p.theme === "light" ? a.light : a.dark }} onClick={() => p.onScheme(a.id)} title={es ? a.es : a.en}>
                  <span className="vp-swatch__dot">{p.scheme === a.id && <Check size={13} strokeWidth={3} />}</span>
                  {es ? a.es : a.en}
                </button>
              ))}
            </div>
          </div>
          <div className="vp-field">
            <div className="vp-field__label"><SunMoon size={12} />{es ? "Tema" : "Theme"}</div>
            <div className="vp-seg vp-seg--block">
              <button aria-pressed={p.theme === "dark"} onClick={() => p.onTheme("dark")}><Moon size={13} />{es ? "Oscuro" : "Dark"}</button>
              <button aria-pressed={p.theme === "light"} onClick={() => p.onTheme("light")}><Sun size={13} />{es ? "Claro" : "Light"}</button>
            </div>
          </div>
          <div className="vp-field">
            <div className="vp-field__label"><Languages size={12} />{es ? "Idioma" : "Language"}</div>
            <div className="vp-seg vp-seg--block">
              <button aria-pressed={p.lang === "es"} onClick={() => p.onLang("es")}>Español</button>
              <button aria-pressed={p.lang === "en"} onClick={() => p.onLang("en")}>English</button>
            </div>
          </div>
          <div className="vp-menu-sep" />
          <div className="vp-switch-row" role="switch" aria-checked={p.scanlines} tabIndex={0} onClick={() => p.onScanlines(!p.scanlines)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && p.onScanlines(!p.scanlines)}>
            <ScanLine size={16} />
            <div>Scanlines<small>{es ? "Efecto de monitor CRT" : "CRT monitor effect"}</small></div>
            <span className="vp-switch" data-on={p.scanlines} />
          </div>
          <div className="vp-switch-row" role="switch" aria-checked={p.tvMode} tabIndex={0} onClick={() => p.onTvMode(!p.tvMode)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && p.onTvMode(!p.tvMode)}>
            <Tv size={16} />
            <div>{es ? "Modo TV" : "TV mode"}<small>{es ? "Pantalla completa para la sala del SOC" : "Full screen for the SOC wall"}</small></div>
            <span className="vp-switch" data-on={p.tvMode} />
          </div>
        </div>
        {p.isAdmin && (
          <div className="vp-pop__foot">
            <button className="vp-menu-item" onClick={() => { p.onClose(); p.onOpenGlobalSettings(); }}>
              <SlidersHorizontal size={16} />{es ? "Ajustes globales del sistema" : "Global system settings"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
