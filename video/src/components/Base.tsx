import React from "react";
import {AbsoluteFill, interpolate, useCurrentFrame} from "remotion";
import {C, F} from "../theme";

/** Fondo común: degradado oscuro, rejilla técnica que se desplaza y viñeta. */
export const Fondo: React.FC = () => {
  const frame = useCurrentFrame();
  const desp = (frame * 0.25) % 64;
  return (
    <AbsoluteFill style={{background: `radial-gradient(ellipse at 30% 20%, #10241c 0%, ${C.fondo} 55%, #040807 100%)`}}>
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(82,183,136,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(82,183,136,0.055) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          backgroundPosition: `${desp}px ${desp}px`,
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 80%)",
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${50 + 30 * Math.sin(frame / 400)}% ${40 + 20 * Math.cos(frame / 500)}%, rgba(82,183,136,0.10), transparent 45%)`,
        }}
      />
      <AbsoluteFill style={{boxShadow: "inset 0 0 260px rgba(0,0,0,0.85)"}} />
    </AbsoluteFill>
  );
};

/** Logo «V» de Valhalla dibujado en vectorial (mismo trazo que el de la consola). */
export const LogoV: React.FC<{size?: number; brillo?: number}> = ({size = 64, brillo = 1}) => (
  <svg width={size} height={size} viewBox="0 0 64 64">
    <defs>
      <linearGradient id="lv" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#74e0a8" />
        <stop offset="1" stopColor="#2d8a5f" />
      </linearGradient>
    </defs>
    <rect x="3" y="3" width="58" height="58" rx="14" fill="url(#lv)" opacity={0.95} />
    <rect x="3" y="3" width="58" height="58" rx="14" fill="none" stroke="#bff5d8" strokeOpacity={0.35 * brillo} strokeWidth="2" />
    <path d="M18 20 L32 46 L46 20" fill="none" stroke="#062016" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="44" cy="14" r="3.6" fill="#062016" />
  </svg>
);

/** Texto VALHALLA con el espaciado del logotipo de la consola. */
export const Logotipo: React.FC<{size?: number}> = ({size = 40}) => (
  <div style={{display: "flex", flexDirection: "column", lineHeight: 1}}>
    <span style={{fontFamily: F.tech, fontSize: size, letterSpacing: size * 0.42, color: C.texto}}>VALHALLA</span>
    <span style={{fontFamily: F.tech, fontSize: size * 0.62, letterSpacing: size * 0.2, color: C.acento, marginTop: size * 0.12}}>
      SOC <span style={{color: C.tenue}}>PRO</span>
    </span>
  </div>
);

export const Panel: React.FC<{style?: React.CSSProperties; children?: React.ReactNode; acento?: string}> = ({style, children, acento}) => (
  <div
    style={{
      background: C.panel,
      border: `1.5px solid ${acento ?? C.borde}`,
      borderRadius: 18,
      boxShadow: "0 30px 80px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)",
      backdropFilter: "blur(6px)",
      ...style,
    }}
  >
    {children}
  </div>
);

/** Kicker + titular grande con revelado palabra a palabra. */
export const Titular: React.FC<{kicker?: string; texto: string; desde?: number; tam?: number; ancho?: number}> = ({
  kicker,
  texto,
  desde = 0,
  tam = 76,
  ancho = 1500,
}) => {
  const frame = useCurrentFrame();
  const palabras = texto.split(" ");
  return (
    <div style={{maxWidth: ancho}}>
      {kicker ? (
        <div
          style={{
            fontFamily: F.mono,
            fontSize: 22,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: C.acento,
            marginBottom: 18,
            opacity: interpolate(frame - desde, [0, 12], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"}),
          }}
        >
          <span style={{display: "inline-block", width: 36, height: 2, background: C.acento, verticalAlign: "middle", marginRight: 14}} />
          {kicker}
        </div>
      ) : null}
      <div style={{fontFamily: F.titulo, fontWeight: 700, fontSize: tam, lineHeight: 1.05, color: C.texto, letterSpacing: -0.5}}>
        {palabras.map((p, i) => {
          const t = frame - desde - 6 - i * 3;
          const o = interpolate(t, [0, 10], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
          const y = interpolate(t, [0, 12], [28, 0], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
          return (
            <span key={i} style={{display: "inline-block", opacity: o, transform: `translateY(${y}px)`, marginRight: tam * 0.24}}>
              {p}
            </span>
          );
        })}
      </div>
    </div>
  );
};
