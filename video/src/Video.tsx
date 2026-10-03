import React from "react";
import {AbsoluteFill, Audio, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig} from "remotion";
import {Fondo, Panel} from "./components/Base";
import {DIAPOSITIVAS, SinVisual} from "./components/Diapositivas";
import {Cabecera, Progreso} from "./components/Overlay";
import {Toma, type MetaToma} from "./components/Toma";
import {srcClip} from "./lib/clips";
import {aparece, fotogramaDe, K, useFrame} from "./lib/tiempo";
import {C, CL, F} from "./theme";
import type {Escena, Manifest} from "./types";

const FUNDIDO = Math.round(10 * K); // fundido de 1/3 s entre escenas

/** Etiqueta discreta que dice de dónde sale la imagen (grabación real de la consola o de la terminal). */
const Origen: React.FC<{texto: string}> = ({texto}) => {
  const frame = useFrame();
  return (
    <div style={{position: "absolute", left: 48, bottom: 40, display: "flex", gap: 10, alignItems: "center", fontFamily: F.mono, fontSize: 15,
      letterSpacing: 1.5, color: C.tenue, textTransform: "uppercase", opacity: aparece(frame, 15, 20) * 0.95,
      background: "rgba(3,8,6,.7)", padding: "6px 12px", borderRadius: 8}}>
      <span style={{width: 9, height: 9, borderRadius: "50%", background: C.rojo, boxShadow: `0 0 10px ${C.rojo}`}} />{texto}
    </div>
  );
};

/** Titular grande sobre la grabación, al estilo de los vídeos de producto (entra y sale arriba). */
const RotuloToma: React.FC<{titulo: string}> = ({titulo}) => {
  const frame = useFrame();
  const o = interpolate(frame, [6, 20, 95, 115], [0, 1, 1, 0], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  return (
    <div style={{position: "absolute", left: 0, right: 0, top: 120, display: "flex", justifyContent: "center", opacity: o,
      transform: `translateY(${(1 - o) * -16}px)`}}>
      <div style={{fontFamily: F.titulo, fontWeight: 700, fontSize: 64, color: "#fff", padding: "10px 34px", borderRadius: 16,
        background: "rgba(4,10,8,.82)", border: `1px solid ${C.borde}`, boxShadow: "0 20px 60px rgba(0,0,0,.55)"}}>{titulo}</div>
    </div>
  );
};

const TomaMovil: React.FC<{escena: Escena; meta: MetaToma}> = ({escena, meta}) => {
  const frame = useFrame();
  const {fps} = useVideoConfig();
  const puntos = (escena.visual.puntos ?? []) as {en: number; texto: string}[];
  const alto = 900;
  const ancho = Math.round((alto * meta.ancho) / meta.alto);
  const vel = Math.max(0.8, Math.min(1.5, meta.duracion / Math.max(1, escena.duracion / fps - 0.5)));
  return (
    <AbsoluteFill>
      <Fondo />
      <div style={{position: "absolute", left: 260, top: 110, width: ancho + 28, height: alto + 28, borderRadius: 54, padding: 14,
        background: "#0b0f0d", border: "2px solid #1d2b25", boxShadow: "0 40px 120px rgba(0,0,0,.7), 0 0 0 1px rgba(82,183,136,.25)"}}>
        <div style={{width: ancho, height: alto, borderRadius: 42, overflow: "hidden"}}>
          <OffthreadVideo src={srcClip(meta.clip)} playbackRate={vel} muted style={{width: ancho, height: alto}} />
        </div>
      </div>
      <div style={{position: "absolute", left: 360 + ancho, right: 120, top: 260, display: "flex", flexDirection: "column", gap: 22}}>
        {puntos.map((p) => {
          const a = aparece(frame, fotogramaDe(escena, p.en), 16);
          return (
            <Panel key={p.texto} style={{opacity: a, transform: `translateX(${(1 - a) * 40}px)`, padding: "20px 26px",
              fontFamily: F.titulo, fontWeight: 600, fontSize: 34, color: CL.texto}}>{p.texto}</Panel>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const EscenaVisual: React.FC<{escena: Escena; tomas: Record<string, MetaToma>}> = ({escena, tomas}) => {
  const vis = escena.visual;
  if (vis.tipo === "toma" && tomas[vis.clip]) {
    const meta = tomas[vis.clip];
    if (meta.ancho < 800) return <TomaMovil escena={escena} meta={meta} />;
    const terminal = vis.clip.startsWith("term_");
    return (
      <>
        <Toma meta={meta} duracion={escena.duracion} />
        <AbsoluteFill style={{background: "linear-gradient(180deg, rgba(3,8,6,.78) 0%, transparent 13%, transparent 80%, rgba(3,8,6,.7) 100%)"}} />
        {vis.rotulo ? <RotuloToma titulo={vis.rotulo} /> : null}
        <Origen texto={terminal ? "Terminal real de la VM · salida sin editar" : "Grabación real de la consola · datos del laboratorio"} />
      </>
    );
  }
  const D = DIAPOSITIVAS[vis.tipo] ?? SinVisual;
  return (
    <>
      <Fondo />
      <D escena={escena} />
    </>
  );
};

export const Video: React.FC<{manifest: Manifest; tomas: Record<string, MetaToma>}> = ({manifest, tomas}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{background: C.fondo}}>
      {manifest.escenas.map((e) => (
        <Sequence key={e.id} from={e.inicio} durationInFrames={e.duracion + FUNDIDO} name={e.id}>
          <Fundido duracion={e.duracion}>
            <EscenaVisual escena={e} tomas={tomas} />
            {e.id !== "s01_portada" && e.id !== "s35_cierre" ? <Cabecera escena={e} manifest={manifest} /> : null}
            {/* Sin subtítulos quemados: el vídeo va con voz en español; out/subtitulos.srt queda aparte */}
          </Fundido>
        </Sequence>
      ))}
      <Progreso manifest={manifest} frameGlobal={frame} />
      <Audio src={staticFile(manifest.audio)} />
    </AbsoluteFill>
  );
};

const Fundido: React.FC<{duracion: number; children: React.ReactNode}> = ({duracion, children}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, FUNDIDO, duracion, duracion + FUNDIDO], [0, 1, 1, 0], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  return <AbsoluteFill style={{opacity: o}}>{children}</AbsoluteFill>;
};
