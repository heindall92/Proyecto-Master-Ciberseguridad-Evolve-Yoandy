import React from "react";
import {Img, interpolate, staticFile, useCurrentFrame} from "remotion";
import {nombreReq} from "../lib/requisitos";
import {aparece, useFrame} from "../lib/tiempo";
import {C, F} from "../theme";
import type {Escena, Manifest, Subtitulo} from "../types";

/** Barra superior: marca, bloque del enunciado y requisito que se está demostrando. */
export const Cabecera: React.FC<{escena: Escena; manifest: Manifest}> = ({escena, manifest}) => {
  const frame = useFrame();
  const o = aparece(frame, 4, 16);
  const bloques = Object.keys(manifest.bloques);
  return (
    <>
      <div style={{position: "absolute", left: 40, top: 24, display: "flex", alignItems: "center", gap: 16, opacity: o,
        padding: "10px 16px 10px 10px", borderRadius: 16, background: "rgba(6,14,11,0.78)", backdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 10px 30px rgba(0,0,0,.25)"}}>
        <Img src={staticFile("marca/logo_icono.png")} style={{width: 44, height: 44}} />
        <div style={{display: "flex", flexDirection: "column", gap: 4}}>
          <span style={{fontFamily: F.tech, fontSize: 20, letterSpacing: 7, color: C.texto}}>VALHALLA SOC</span>
          <div style={{display: "flex", gap: 6}}>
            {bloques.map((b) => (
              <span
                key={b}
                style={{
                  fontFamily: F.mono,
                  fontSize: 12,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  padding: "2px 8px",
                  borderRadius: 5,
                  color: b === escena.bloque ? "#062016" : C.muyTenue,
                  background: b === escena.bloque ? C.acento : "transparent",
                  border: `1px solid ${b === escena.bloque ? C.acento : "rgba(82,183,136,0.18)"}`,
                }}
              >
                {manifest.bloques[b]}
              </span>
            ))}
          </div>
        </div>
      </div>
      {escena.req.length > 0 ? (
        <div style={{position: "absolute", right: 48, top: 26, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8}}>
          <span style={{fontFamily: F.mono, fontSize: 13, letterSpacing: 3, color: C.tenue, opacity: o}}>DEMOSTRANDO</span>
          <div style={{display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 1000}}>
            {escena.req.map((r, i) => {
              const a = aparece(frame, 10 + i * 5, 14);
              return (
                <div
                  key={r}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "7px 14px",
                    borderRadius: 10,
                    background: "rgba(10, 22, 18, 0.92)",
                    border: `1.5px solid ${C.bordeFuerte}`,
                    boxShadow: "0 0 24px rgba(82,183,136,0.18)",
                    opacity: a,
                    transform: `translateY(${(1 - a) * -14}px)`,
                  }}
                >
                  <span style={{fontFamily: F.mono, fontWeight: 700, fontSize: 18, color: C.acentoVivo}}>{r}</span>
                  <span style={{fontFamily: F.titulo, fontWeight: 600, fontSize: 20, color: C.texto}}>{nombreReq(r)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </>
  );
};

/** Subtítulos quemados, sincronizados con la voz. */
export const Subtitulos: React.FC<{subs: Subtitulo[]}> = ({subs}) => {
  const frame = useCurrentFrame();
  const s = subs.find((x) => frame >= x.inicio && frame < x.fin + 4);
  if (!s) return null;
  const o = interpolate(frame, [s.inicio, s.inicio + 5, s.fin, s.fin + 4], [0, 1, 1, 0], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  return (
    <div style={{position: "absolute", left: 0, right: 0, bottom: 46, display: "flex", justifyContent: "center", opacity: o}}>
      <div
        style={{
          maxWidth: 1500,
          padding: "12px 28px",
          borderRadius: 14,
          background: "rgba(3, 8, 6, 0.82)",
          border: "1px solid rgba(82,183,136,0.18)",
          fontFamily: F.titulo,
          fontWeight: 600,
          fontSize: 38,
          lineHeight: 1.25,
          color: "#f2fbf6",
          textAlign: "center",
          textShadow: "0 2px 6px rgba(0,0,0,0.8)",
        }}
      >
        {s.texto}
      </div>
    </div>
  );
};

/** Barra de progreso global, segmentada por bloques. */
export const Progreso: React.FC<{manifest: Manifest; frameGlobal: number}> = ({manifest, frameGlobal}) => {
  const total = manifest.duracion;
  const segmentos: {b: string; ini: number; fin: number}[] = [];
  for (const e of manifest.escenas) {
    const ult = segmentos[segmentos.length - 1];
    if (ult && ult.b === e.bloque) ult.fin = e.inicio + e.duracion;
    else segmentos.push({b: e.bloque, ini: e.inicio, fin: e.inicio + e.duracion});
  }
  return (
    <div style={{position: "absolute", left: 48, right: 48, bottom: 18, height: 5, display: "flex", gap: 6}}>
      {segmentos.map((s) => {
        const p = Math.max(0, Math.min(1, (frameGlobal - s.ini) / (s.fin - s.ini)));
        return (
          <div key={s.b + s.ini} style={{flex: (s.fin - s.ini) / total, background: "rgba(82,183,136,0.15)", borderRadius: 3, overflow: "hidden"}}>
            <div style={{width: `${p * 100}%`, height: "100%", background: C.acento}} />
          </div>
        );
      })}
    </div>
  );
};

/** Etiqueta honesta sobre el origen de la imagen (captura real, grabación, esquema…). */
export const Origen: React.FC<{texto: string; color?: string}> = ({texto, color = C.tenue}) => {
  const frame = useFrame();
  return (
    <div
      style={{
        position: "absolute",
        left: 48,
        bottom: 40,
        fontFamily: F.mono,
        fontSize: 14,
        letterSpacing: 1.5,
        color,
        textTransform: "uppercase",
        opacity: aparece(frame, 20, 20) * 0.9,
      }}
    >
      ● {texto}
    </div>
  );
};
