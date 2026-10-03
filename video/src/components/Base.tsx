import React from "react";
import {AbsoluteFill, Easing, interpolate} from "remotion";

const suaveSalida = Easing.bezier(0.16, 1, 0.3, 1);
import {useFrame} from "../lib/tiempo";
import {CL as C, F} from "../theme";

/** Fondo de las diapositivas: blanco cálido con luces verdes difusas que se mueven despacio (sin rejilla). */
export const Fondo: React.FC = () => {
  const frame = useFrame();
  const t = frame / 30;
  const mancha = (x: number, y: number, r: number, a: number) =>
    `radial-gradient(circle at ${x}% ${y}%, rgba(82,183,136,${a}) 0%, rgba(82,183,136,0) ${r}%)`;
  return (
    <AbsoluteFill
      style={{
        background: [
          mancha(18 + 6 * Math.sin(t / 9), 22 + 5 * Math.cos(t / 11), 38, 0.28),
          mancha(82 + 5 * Math.cos(t / 10), 78 + 6 * Math.sin(t / 8), 42, 0.22),
          mancha(60 + 8 * Math.sin(t / 13), 10, 30, 0.12),
          "linear-gradient(160deg, #f7faf8 0%, #edf4f0 55%, #e1ece6 100%)",
        ].join(", "),
      }}
    >
      <AbsoluteFill style={{boxShadow: "inset 0 0 220px rgba(13,42,31,0.10)"}} />
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
      background: "linear-gradient(145deg, rgba(255,255,255,0.78), rgba(255,255,255,0.46))",
      border: `1.5px solid ${acento ?? C.borde}`,
      borderTopColor: acento ?? "rgba(255,255,255,1)", // borde superior iluminado: la luz cae sobre el vidrio
      borderRadius: 22,
      boxShadow: "0 24px 60px rgba(13,60,40,0.12), 0 2px 6px rgba(13,60,40,0.06), inset 0 1px 0 rgba(255,255,255,0.95)",
      backdropFilter: "blur(18px) saturate(1.3)",
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
  const frame = useFrame();
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
      <div style={{fontFamily: F.titulo, fontWeight: 700, fontSize: tam, lineHeight: 1.04, color: C.texto, letterSpacing: `${-0.018 * tam}px`}}>
        {palabras.map((p, i) => {
          const t = frame - desde - 6 - i * 3;
          const o = interpolate(t, [0, 10], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
          const y = interpolate(t, [0, 12], [18, 0], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: suaveSalida});
          return (
            <span key={i} style={{display: "inline-block", opacity: o, transform: `translateY(${y}px)`, filter: `blur(${(1 - o) * 6}px)`, marginRight: tam * 0.22}}>
              {p}
            </span>
          );
        })}
      </div>
    </div>
  );
};
