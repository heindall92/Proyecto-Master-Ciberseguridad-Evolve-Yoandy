import React from "react";
import {AbsoluteFill, Img, interpolate, spring, staticFile} from "remotion";
import {
  AlertTriangle, ArrowRight, Bot, Boxes, Check, CheckCircle2, Database, FileWarning, Globe, KeyRound, Layout, Lock,
  Network, Puzzle, Radar, Server, Shield, ShieldCheck, Skull, Terminal, Users, X,
} from "lucide-react";
import {REQUISITOS} from "../lib/requisitos";
import {aparece, fotogramaDe, useFrame} from "../lib/tiempo";
import {CL as C, F} from "../theme";
import type {Escena} from "../types";
import {Panel, Titular} from "./Base";

type P = {escena: Escena};
const v = (e: Escena) => e.visual;
const ICONOS: Record<string, React.FC<{size?: number; color?: string; strokeWidth?: number}>> = {
  alert: AlertTriangle, puzzle: Puzzle, shield: Shield, layout: Layout, users: Users, database: Database,
};

/** Entrada con muelle desde abajo; `desde` en fotogramas de la escena. */
const useEntrada = (desde: number) => {
  const frame = useFrame();
  // Apple: muelle críticamente amortiguado (sin rebote) y el panel «se materializa» (desenfoque + escala a la vez)
  const s = spring({frame: frame - desde, fps: 30, config: {damping: 200, stiffness: 140, mass: 0.9}});
  return {opacity: Math.min(1, s * 1.3), transform: `translateY(${(1 - s) * 28}px) scale(${0.97 + 0.03 * s})`,
    filter: `blur(${(1 - s) * 10}px)`};
};

const Marco: React.FC<{children: React.ReactNode; centro?: boolean}> = ({children, centro}) => (
  <div style={{position: "absolute", inset: "150px 120px 150px 120px", display: "flex", flexDirection: "column",
    justifyContent: centro ? "center" : "flex-start", gap: 44}}>{children}</div>
);

// ─────────────── portada y cierre ───────────────
/** El fondo del login (vikingo y escudo) con un acercamiento lento, como en la propia consola. */
const FondoLogin: React.FC<{oscuro?: number}> = ({oscuro = 0.55}) => {
  const frame = useFrame();
  const z = 1.04 + frame * 0.00025;
  return (
    <AbsoluteFill style={{background: "#030806", overflow: "hidden"}}>
      <Img src={staticFile("marca/bg-login.png")} style={{position: "absolute", width: "100%", height: "100%", objectFit: "cover",
        transform: `scale(${z}) translateX(${-frame * 0.02}px)`, filter: "saturate(1.05)"}} />
      <AbsoluteFill style={{background: `linear-gradient(90deg, rgba(3,8,6,${oscuro * 0.4}) 0%, rgba(3,8,6,${oscuro}) 48%, rgba(3,8,6,${oscuro + 0.25}) 100%)`}} />
      <AbsoluteFill style={{boxShadow: "inset 0 0 280px rgba(0,0,0,.85)"}} />
    </AbsoluteFill>
  );
};

export const Portada: React.FC<P> = () => {
  const frame = useFrame();
  const a = aparece(frame, 10, 34);
  const b = aparece(frame, 40, 30);
  return (
    <AbsoluteFill>
      <FondoLogin oscuro={0.5} />
      <div style={{position: "absolute", left: 980, top: 330, display: "flex", flexDirection: "column", gap: 44}}>
        <Img src={staticFile("marca/logo_marca.png")} style={{width: 820, opacity: a, transform: `translateY(${(1 - a) * 24}px)`,
          filter: `drop-shadow(0 0 ${30 * a}px rgba(82,183,136,.35))`}} />
        <div style={{opacity: b, transform: `translateY(${(1 - b) * 16}px)`, fontFamily: F.mono, fontSize: 24, letterSpacing: 7,
          color: "rgba(230,242,236,.78)", textTransform: "uppercase", lineHeight: 1.9}}>
          Plataforma de monitorización<br />y respuesta táctica con IA
        </div>
        <div style={{opacity: aparece(frame, 70, 26), display: "flex", gap: 14, fontFamily: F.mono, fontSize: 19, letterSpacing: 3,
          color: "#74e0a8", textTransform: "uppercase"}}>
          Proyecto Valhalla · Práctica 3 · Máster en Ciberseguridad · Evolve
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Cierre: React.FC<P> = ({escena}) => {
  const frame = useFrame();
  const f3 = fotogramaDe(escena, 3);
  return (
    <AbsoluteFill>
      <FondoLogin oscuro={0.62} />
      <div style={{position: "absolute", left: 900, right: 110, top: 250, display: "flex", flexDirection: "column", gap: 46}}>
        <Img src={staticFile("marca/logo_marca.png")} style={{width: 640, opacity: aparece(frame, 0, 24)}} />
        <div style={{fontFamily: F.titulo, fontWeight: 700, fontSize: 62, lineHeight: 1.1, color: "#f2fbf6", opacity: aparece(frame, fotogramaDe(escena, 2), 24)}}>
          Un SOC debe pasar el mismo análisis que exige a lo que vigila.
        </div>
        <div style={{opacity: aparece(frame, f3, 24), display: "flex", flexDirection: "column", gap: 18, fontFamily: F.mono, fontSize: 25, color: "#e6f2ec"}}>
          <span style={{display: "flex", gap: 14, alignItems: "center"}}><Globe size={28} color="#74e0a8" />github.com/heindall92/Proyecto-Master-Ciberseguridad-Evolve-Yoandy</span>
          <span style={{alignSelf: "flex-start", padding: "6px 16px", borderRadius: 10, background: "#52b788", color: "#04140d", fontWeight: 700}}>v1.0-practica3</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─────────────── equipo ───────────────
export const Equipo: React.FC<P> = ({escena}) => {
  const miembros = v(escena).miembros as {nombre: string; rol: string; detalle: string; en: number}[];
  return (
    <Marco>
      <Titular kicker="Proyecto Valhalla" texto="El equipo" tam={84} />
      <div style={{display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 26}}>
        {miembros.map((m) => <Miembro key={m.nombre} m={m} desde={fotogramaDe(escena, m.en)} />)}
      </div>
    </Marco>
  );
};
const Miembro: React.FC<{m: {nombre: string; rol: string; detalle: string; foto?: string}; desde: number}> = ({m, desde}) => {
  const st = useEntrada(desde);
  const iniciales = m.nombre.split(" ").slice(0, 2).map((x) => x[0]).join("");
  return (
    <Panel style={{...st, padding: "34px 26px", display: "flex", flexDirection: "column", alignItems: "center", gap: 18, textAlign: "center", minHeight: 380}}>
      {m.foto ? (
        // Solo la foto del propio autor: la imagen de los compañeros no se usa sin su consentimiento
        <Img src={staticFile(m.foto)} style={{width: 120, height: 120, borderRadius: "50%", objectFit: "cover", objectPosition: "57% 22%",
          border: `3px solid ${C.acento}`, boxShadow: "0 10px 30px rgba(13,60,40,.25)"}} />
      ) : (
        <div style={{width: 120, height: 120, borderRadius: "50%", display: "grid", placeItems: "center", fontFamily: F.titulo, fontWeight: 700,
          fontSize: 46, color: "#ffffff", background: `linear-gradient(135deg, #52b788, #2d8a5f)`, boxShadow: "0 10px 30px rgba(13,60,40,.25)"}}>{iniciales}</div>
      )}
      <div style={{fontFamily: F.titulo, fontWeight: 700, fontSize: 34, color: C.texto, lineHeight: 1.05}}>{m.nombre}</div>
      <div style={{fontFamily: F.mono, fontSize: 18, color: C.acentoVivo, letterSpacing: 1}}>{m.rol}</div>
      <div style={{fontFamily: F.titulo, fontSize: 22, color: C.tenue}}>{m.detalle}</div>
    </Panel>
  );
};

// ─────────────── titular con puntos ───────────────
export const TitularPuntos: React.FC<P> = ({escena}) => {
  const vis = v(escena);
  return (
    <Marco centro>
      <Titular kicker={vis.kicker} texto={vis.titular} tam={86} />
      <div style={{display: "flex", flexDirection: "column", gap: 22}}>
        {(vis.puntos as {en: number; icono: string; texto: string}[]).map((p) => <Punto key={p.texto} p={p} desde={fotogramaDe(escena, p.en)} />)}
      </div>
    </Marco>
  );
};
const Punto: React.FC<{p: {icono: string; texto: string}; desde: number}> = ({p, desde}) => {
  const st = useEntrada(desde);
  const I = ICONOS[p.icono] ?? Check;
  return (
    <Panel style={{...st, display: "flex", alignItems: "center", gap: 28, padding: "24px 34px", maxWidth: 1450}}>
      <div style={{width: 64, height: 64, borderRadius: 16, display: "grid", placeItems: "center", background: C.acentoSuave, border: `1px solid ${C.borde}`}}>
        <I size={34} color={C.acentoVivo} strokeWidth={1.8} />
      </div>
      <span style={{fontFamily: F.titulo, fontWeight: 600, fontSize: 40, color: C.texto}}>{p.texto}</span>
    </Panel>
  );
};

// ─────────────── antes / después ───────────────
export const AntesDespues: React.FC<P> = ({escena}) => {
  const vis = v(escena);
  const col = (titulo: string, items: string[], en: number, bien: boolean) => (
    <div style={{flex: 1, display: "flex", flexDirection: "column", gap: 18}}>
      <div style={{fontFamily: F.mono, fontSize: 24, letterSpacing: 5, color: bien ? C.acentoVivo : C.rojo, ...useEntrada(fotogramaDe(escena, en))}}>{titulo}</div>
      {items.map((t, i) => (
        <Fila key={t} desde={fotogramaDe(escena, en) + 8 + i * 7} bien={bien} texto={t} />
      ))}
    </div>
  );
  return (
    <Marco>
      <Titular kicker={vis.kicker} texto={vis.titular} tam={86} />
      <div style={{display: "flex", gap: 60, alignItems: "flex-start"}}>
        {col("PRÁCTICA 1 · PROTOTIPO", vis.antes, vis.enAntes, false)}
        <ArrowRight size={70} color={C.acento} style={{marginTop: 120}} />
        {col("PRÁCTICA 3 · PRODUCTO", vis.despues, vis.enDespues, true)}
      </div>
    </Marco>
  );
};
const Fila: React.FC<{desde: number; bien: boolean; texto: string}> = ({desde, bien, texto}) => {
  const st = useEntrada(desde);
  const I = bien ? CheckCircle2 : X;
  return (
    <Panel acento={bien ? C.bordeFuerte : "rgba(255,90,106,.35)"} style={{...st, display: "flex", gap: 20, alignItems: "center", padding: "20px 26px"}}>
      <I size={32} color={bien ? C.acentoVivo : C.rojo} />
      <span style={{fontFamily: F.titulo, fontWeight: 600, fontSize: 34, color: bien ? C.texto : C.tenue}}>{texto}</span>
    </Panel>
  );
};

// ─────────────── cifras ───────────────
export const Cifras: React.FC<P> = ({escena}) => {
  const cifras = v(escena).cifras as {valor: number; etiqueta: string; detalle: string; en: number}[];
  return (
    <Marco centro>
      <Titular kicker="En números" texto="Lo que se puede comprobar" tam={80} />
      <div style={{display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 28}}>
        {cifras.map((c) => <Cifra key={c.etiqueta} c={c} desde={fotogramaDe(escena, c.en)} />)}
      </div>
    </Marco>
  );
};
const Cifra: React.FC<{c: {valor: number; etiqueta: string; detalle: string}; desde: number}> = ({c, desde}) => {
  const frame = useFrame();
  const st = useEntrada(desde);
  const n = Math.round(interpolate(frame - desde, [0, 35], [0, c.valor], {extrapolateLeft: "clamp", extrapolateRight: "clamp"}));
  return (
    <Panel style={{...st, padding: "40px 34px", display: "flex", flexDirection: "column", gap: 10}}>
      <span style={{fontFamily: F.titulo, fontWeight: 700, fontSize: 130, lineHeight: 1, color: C.acentoVivo}}>{n}</span>
      <span style={{fontFamily: F.titulo, fontWeight: 700, fontSize: 38, color: C.texto}}>{c.etiqueta}</span>
      <span style={{fontFamily: F.mono, fontSize: 20, color: C.tenue}}>{c.detalle}</span>
    </Panel>
  );
};

// ─────────────── requisitos y trazabilidad ───────────────
const Chip: React.FC<{id: string; nombre: string; desde: number; extra?: React.ReactNode}> = ({id, nombre, desde, extra}) => {
  const st = useEntrada(desde);
  return (
    <div style={{...st, display: "flex", alignItems: "center", gap: 14, padding: "12px 18px", borderRadius: 12, background: C.panel, border: `1px solid ${C.borde}`}}>
      <span style={{fontFamily: F.mono, fontWeight: 700, fontSize: 20, color: C.acentoVivo, minWidth: 82}}>{id}</span>
      <span style={{fontFamily: F.titulo, fontWeight: 600, fontSize: 25, color: C.texto, flex: 1}}>{nombre}</span>
      {extra}
    </div>
  );
};

export const Requisitos: React.FC<P> = ({escena}) => {
  const vis = v(escena);
  const rf = REQUISITOS.filter((r) => r.id.startsWith("RF"));
  const rnf = REQUISITOS.filter((r) => r.id.startsWith("RNF"));
  return (
    <div style={{position: "absolute", inset: "130px 100px 140px 100px", display: "flex", flexDirection: "column", gap: 30}}>
      <Titular kicker="docs/REQUISITOS.md" texto="25 requisitos, cada uno con su criterio de aceptación" tam={62} ancho={1700} />
      <div style={{display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12}}>
        {rf.map((r, i) => <Chip key={r.id} id={r.id} nombre={r.nombre} desde={fotogramaDe(escena, vis.enRF) + i * 2} />)}
        {rnf.map((r, i) => <Chip key={r.id} id={r.id} nombre={r.nombre} desde={fotogramaDe(escena, vis.enRNF) + i * 2} />)}
      </div>
    </div>
  );
};

export const Trazabilidad: React.FC<P> = ({escena}) => {
  const f1 = fotogramaDe(escena, 1);
  return (
    <div style={{position: "absolute", inset: "130px 100px 140px 100px", display: "flex", flexDirection: "column", gap: 30}}>
      <Titular kicker="docs/TRAZABILIDAD.md · generada por las pruebas" texto="Los 25 requisitos, cubiertos" tam={66} ancho={1700} />
      <div style={{display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12}}>
        {REQUISITOS.map((r, i) => (
          <Chip key={r.id} id={r.id} nombre={r.nombre} desde={8 + i * 2}
            extra={r.pruebas > 0
              ? <span style={{fontFamily: F.mono, fontSize: 18, color: "#04140d", background: C.acento, padding: "3px 10px", borderRadius: 7, fontWeight: 700}}>✓ {r.pruebas}</span>
              : <span style={{fontFamily: F.mono, fontSize: 16, color: C.ambar, border: `1px solid ${C.ambar}`, padding: "3px 9px", borderRadius: 7,
                  opacity: aparece(useFrame(), f1, 14)}}>manual</span>} />
        ))}
      </div>
    </div>
  );
};

// ─────────────── arquitectura ───────────────
const Nodo: React.FC<{x: number; y: number; w?: number; icono: React.ReactNode; titulo: string; sub: string; desde: number; color?: string}> = ({x, y, w = 300, icono, titulo, sub, desde, color}) => {
  const st = useEntrada(desde);
  return (
    <Panel acento={color} style={{...st, position: "absolute", left: x, top: y, width: w, padding: "20px 22px", display: "flex", gap: 16, alignItems: "center"}}>
      <div style={{width: 58, height: 58, borderRadius: 14, display: "grid", placeItems: "center", background: C.acentoSuave, flex: "none"}}>{icono}</div>
      <div>
        <div style={{fontFamily: F.titulo, fontWeight: 700, fontSize: 30, color: C.texto, lineHeight: 1.05}}>{titulo}</div>
        <div style={{fontFamily: F.mono, fontSize: 16, color: C.tenue, marginTop: 4}}>{sub}</div>
      </div>
    </Panel>
  );
};
const Flecha: React.FC<{d: string; desde: number; color?: string}> = ({d, desde, color = C.acento}) => {
  const frame = useFrame();
  const k = aparece(frame, desde, 22);
  const despl = -(frame * 1.6) % 40;
  return (
    <path d={d} fill="none" stroke={color} strokeWidth={3} strokeDasharray="10 10" strokeDashoffset={despl}
      opacity={k} style={{filter: "drop-shadow(0 0 6px rgba(82,183,136,.6))"}} pathLength={k === 1 ? undefined : 1} />
  );
};

export const Arquitectura: React.FC<P> = ({escena}) => {
  const e = (i: number) => fotogramaDe(escena, i);
  const ic = (I: React.FC<{size?: number; color?: string}>, c = C.acentoVivo) => <I size={32} color={c} />;
  return (
    <div style={{position: "absolute", inset: 0}}>
      <div style={{position: "absolute", left: 110, top: 140}}><Titular kicker="Arquitectura" texto="Todo en local, con Docker Compose" tam={58} /></div>
      <svg style={{position: "absolute", inset: 0}} width={1920} height={1080}>
        <Flecha d="M 400 520 L 520 520" desde={e(1)} color={C.rojo} />
        <Flecha d="M 840 520 L 960 520" desde={e(2)} />
        <Flecha d="M 1280 520 L 1400 520" desde={e(2)} />
        <Flecha d="M 1560 580 L 1560 690" desde={e(3)} />
        <Flecha d="M 1400 760 L 1280 760" desde={e(3)} />
        <Flecha d="M 960 760 L 840 760" desde={e(4)} />
        <Flecha d="M 1120 820 L 1120 900" desde={e(5)} />
        <Flecha d="M 520 760 L 400 760" desde={e(6)} />
      </svg>
      <Nodo x={100} y={470} icono={ic(Skull, C.rojo)} titulo="Atacante" sub="red aislada lab-net" desde={e(1)} color="rgba(255,90,106,.45)" />
      <Nodo x={520} y={470} w={320} icono={ic(Radar)} titulo="Cowrie" sub="honeypot SSH / Telnet" desde={e(1)} />
      <Nodo x={960} y={470} w={320} icono={ic(Shield)} titulo="Wazuh manager" sub="reglas propias · ATT&CK" desde={e(2)} />
      <Nodo x={1400} y={470} w={330} icono={ic(Database)} titulo="Indexador" sub="OpenSearch · alertas" desde={e(2)} />
      <Nodo x={1400} y={700} w={330} icono={ic(Server)} titulo="Backend" sub="FastAPI · PostgreSQL" desde={e(3)} />
      <Nodo x={960} y={700} w={320} icono={ic(Layout)} titulo="Consola" sub="React 19 · REST + WS" desde={e(4)} />
      <Nodo x={960} y={900} w={320} icono={ic(Bot)} titulo="Ollama" sub="Qwen 2.5 · 3B · local" desde={e(5)} />
      <Nodo x={520} y={700} w={320} icono={ic(Lock)} titulo="Tailscale" sub="VPN · solo HTTPS" desde={e(6)} />
      <Nodo x={100} y={700} w={300} icono={ic(Users)} titulo="Analistas" sub="PC · móvil" desde={e(6)} />
    </div>
  );
};

export const Contenedores: React.FC<P> = ({escena}) => {
  const e = (i: number) => fotogramaDe(escena, i);
  const zona = (titulo: string, color: string, items: string[], desde: number, x: number, w: number) => (
    <Panel acento={color} style={{...useEntrada(desde), position: "absolute", left: x, top: 330, width: w, padding: "26px 28px", display: "flex", flexDirection: "column", gap: 14}}>
      <div style={{fontFamily: F.mono, fontSize: 20, letterSpacing: 3, color}}>{titulo}</div>
      {items.map((t) => (
        <div key={t} style={{display: "flex", gap: 14, alignItems: "center", fontFamily: F.titulo, fontWeight: 600, fontSize: 30, color: C.texto}}>
          <Boxes size={26} color={color} />{t}
        </div>
      ))}
    </Panel>
  );
  return (
    <div style={{position: "absolute", inset: 0}}>
      <div style={{position: "absolute", left: 110, top: 140}}><Titular kicker="Exposición mínima" texto="Cada pieza, en su red" tam={66} /></div>
      {zona("RED INTERNA", C.acento, ["PostgreSQL", "Wazuh indexer", "ts-whois"], e(1), 110, 520)}
      {zona("SOLO 127.0.0.1", C.azul, ["API de Wazuh :55000", "Ollama :11434"], e(1) + 10, 680, 520)}
      {zona("LAB-NET AISLADA", C.rojo, ["Atacante (Kali)", "Cowrie"], e(2), 1250, 560)}
      <div style={{position: "absolute", left: 110, right: 110, top: 720, display: "flex", gap: 28}}>
        <Decision desde={e(3)} icono={<Bot size={34} color={C.acentoVivo} />} texto="La IA redacta, pero no aporta cifras: las calcula el backend" />
        <Decision desde={e(4)} icono={<KeyRound size={34} color={C.acentoVivo} />} texto="La autorización se decide siempre en el servidor" />
      </div>
    </div>
  );
};
const Decision: React.FC<{desde: number; icono: React.ReactNode; texto: string}> = ({desde, icono, texto}) => (
  <Panel acento={C.bordeFuerte} style={{...useEntrada(desde), flex: 1, display: "flex", gap: 22, alignItems: "center", padding: "26px 30px"}}>
    {icono}<span style={{fontFamily: F.titulo, fontWeight: 700, fontSize: 34, color: C.texto}}>{texto}</span>
  </Panel>
);

// ─────────────── seguridad ───────────────
export const Errores: React.FC<P> = ({escena}) => {
  const casos = v(escena).casos as {en: number; entrada: string; codigo: string; resultado: string}[];
  return (
    <Marco>
      <Titular kicker="Casos de error" texto="Cuando algo va mal" tam={78} />
      <div style={{display: "flex", flexDirection: "column", gap: 14}}>
        {casos.map((c) => {
          const st = useEntrada(fotogramaDe(escena, c.en));
          return (
            <Panel key={c.entrada} style={{...st, display: "grid", gridTemplateColumns: "1fr 150px 1fr", alignItems: "center", gap: 24, padding: "18px 28px"}}>
              <span style={{fontFamily: F.mono, fontSize: 26, color: C.texto}}>{c.entrada.replace(/<\/?b>/g, "")}</span>
              <span style={{fontFamily: F.mono, fontWeight: 700, fontSize: 26, textAlign: "center", color: "#04140d",
                background: c.codigo.startsWith("4") ? C.ambar : C.acento, borderRadius: 9, padding: "4px 0"}}>{c.codigo}</span>
              <span style={{fontFamily: F.titulo, fontWeight: 600, fontSize: 32, color: C.acentoVivo}}>{c.resultado}</span>
            </Panel>
          );
        })}
      </div>
    </Marco>
  );
};

const STRIDE = [
  ["S", "Suplantación", "JWT HttpOnly · revocación · límite por IP real"],
  ["T", "Manipulación", "CSRF doble cookie · huella SHA-256 de informes"],
  ["R", "Repudio", "Auditoría de cada escritura (usuario · IP · código)"],
  ["I", "Divulgación", "DM privados · secretos fuera de Git · redes aisladas"],
  ["D", "Denegación", "Límites de tamaño y de tasa · la consola no se rompe"],
  ["E", "Elevación", "Roles comprobados en cada endpoint del servidor"],
];
export const Stride: React.FC<P> = ({escena}) => (
  <Marco>
    <Titular kicker="docs/STRIDE.md" texto="Modelo de amenazas del propio SOC" tam={72} />
    <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18}}>
      {STRIDE.map(([l, n, m], i) => {
        const st = useEntrada(fotogramaDe(escena, 1) + i * 8);
        return (
          <Panel key={l} style={{...st, display: "flex", gap: 24, alignItems: "center", padding: "22px 28px"}}>
            <span style={{fontFamily: F.titulo, fontWeight: 700, fontSize: 72, color: C.acentoVivo, width: 60, textAlign: "center"}}>{l}</span>
            <div>
              <div style={{fontFamily: F.titulo, fontWeight: 700, fontSize: 36, color: C.texto}}>{n}</div>
              <div style={{fontFamily: F.mono, fontSize: 20, color: C.tenue, marginTop: 4}}>{m}</div>
            </div>
          </Panel>
        );
      })}
    </div>
  </Marco>
);

export const Hallazgos: React.FC<P> = ({escena}) => {
  const items = v(escena).items as {en: number; riesgo: string; texto: string; fix: string}[];
  return (
    <Marco>
      <Titular kicker="Auditoría de nuestro propio SOC" texto="Lo que encontramos, y cómo se corrigió" tam={70} />
      <div style={{display: "flex", flexDirection: "column", gap: 16}}>
        {items.map((h) => {
          const st = useEntrada(fotogramaDe(escena, h.en));
          const col = h.riesgo === "ALTO" ? C.rojo : C.ambar;
          return (
            <Panel key={h.texto} style={{...st, display: "grid", gridTemplateColumns: "120px 1fr 560px", gap: 24, alignItems: "center", padding: "20px 28px"}}>
              <span style={{fontFamily: F.mono, fontWeight: 700, fontSize: 20, color: col, border: `1.5px solid ${col}`, borderRadius: 8, textAlign: "center", padding: "4px 0"}}>{h.riesgo}</span>
              <span style={{fontFamily: F.titulo, fontWeight: 600, fontSize: 31, color: C.texto, display: "flex", gap: 14, alignItems: "center"}}><FileWarning size={28} color={col} />{h.texto}</span>
              <span style={{fontFamily: F.titulo, fontWeight: 600, fontSize: 29, color: C.acentoVivo, display: "flex", gap: 12, alignItems: "center"}}><ShieldCheck size={28} />{h.fix}</span>
            </Panel>
          );
        })}
      </div>
    </Marco>
  );
};

export const Barras: React.FC<P> = ({escena}) => {
  const vis = v(escena);
  const frame = useFrame();
  const max = Math.max(...vis.barras.map((b: {antes: number}) => b.antes));
  return (
    <Marco>
      <Titular kicker={vis.kicker} texto={vis.titular} tam={76} />
      <div style={{display: "flex", flexDirection: "column", gap: 26}}>
        {(vis.barras as {en: number; herramienta: string; alcance: string; antes: number; despues: number}[]).map((b) => {
          const d = fotogramaDe(escena, b.en);
          const crece = aparece(frame, d, 20);
          const baja = aparece(frame, d + 34, 26);
          const w = (b.antes / max) * 1000 * crece * (1 - baja * 0.995);
          const n = Math.round(b.antes * crece * (1 - baja));
          return (
            <div key={b.herramienta} style={{display: "grid", gridTemplateColumns: "360px 1fr", alignItems: "center", gap: 30, opacity: aparece(frame, d, 10)}}>
              <div>
                <div style={{fontFamily: F.mono, fontWeight: 700, fontSize: 30, color: C.texto}}>{b.herramienta}</div>
                <div style={{fontFamily: F.titulo, fontSize: 24, color: C.tenue}}>{b.alcance}</div>
              </div>
              <div style={{display: "flex", alignItems: "center", gap: 24}}>
                <div style={{height: 54, width: Math.max(8, w), borderRadius: 10, background: baja > 0.5 ? C.acento : C.rojo, boxShadow: `0 0 20px ${baja > 0.5 ? "rgba(82,183,136,.5)" : "rgba(255,90,106,.4)"}`}} />
                <span style={{fontFamily: F.titulo, fontWeight: 700, fontSize: 58, color: baja > 0.5 ? C.acentoVivo : C.rojo}}>{n}</span>
              </div>
            </div>
          );
        })}
      </div>
      {vis.nota ? <div style={{...useEntrada(fotogramaDe(escena, vis.nota.en)), fontFamily: F.mono, fontSize: 24, color: C.tenue, display: "flex", gap: 14, alignItems: "center"}}>
        <Terminal size={26} color={C.acento} />{vis.nota.texto}</div> : null}
    </Marco>
  );
};

export const Limitaciones: React.FC<P> = ({escena}) => {
  const items = v(escena).items as {en: number; limite: string; mejora: string}[];
  return (
    <Marco>
      <Titular kicker="Honestidad" texto="Limitaciones y trabajo futuro" tam={76} />
      <div style={{display: "flex", flexDirection: "column", gap: 14}}>
        {items.map((it) => {
          const st = useEntrada(fotogramaDe(escena, it.en));
          return (
            <Panel key={it.limite} style={{...st, display: "grid", gridTemplateColumns: "1fr 60px 520px", gap: 20, alignItems: "center", padding: "18px 28px"}}>
              <span style={{fontFamily: F.titulo, fontWeight: 600, fontSize: 31, color: C.texto}}>{it.limite}</span>
              <ArrowRight size={32} color={C.acento} />
              <span style={{fontFamily: F.titulo, fontWeight: 600, fontSize: 30, color: C.acentoVivo}}>{it.mejora}</span>
            </Panel>
          );
        })}
      </div>
    </Marco>
  );
};

export const SinVisual: React.FC<P> = ({escena}) => (
  <Marco centro><Titular kicker={escena.bloque} texto={escena.titulo} tam={90} /></Marco>
);

export const DIAPOSITIVAS: Record<string, React.FC<P>> = {
  portada: Portada, cierre: Cierre, equipo: Equipo, titular: TitularPuntos, antesdespues: AntesDespues, cifras: Cifras,
  requisitos: Requisitos, trazabilidad: Trazabilidad, arquitectura: Arquitectura, contenedores: Contenedores,
  errores: Errores, stride: Stride, hallazgos: Hallazgos, barras: Barras, limitaciones: Limitaciones,
};
export {Network};
