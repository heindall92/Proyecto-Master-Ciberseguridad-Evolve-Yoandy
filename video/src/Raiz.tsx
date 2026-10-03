import React from "react";
import {Composition, Folder} from "remotion";
import {Toma, type MetaToma} from "./components/Toma";
import "./fonts";
import clips from "./generated/clips.json";
import manifestJson from "./generated/manifest.json";
import type {Manifest} from "./types";
import {Video} from "./Video";

const FPS = 30;
const tomas = clips as unknown as Record<string, MetaToma>;
const manifest = manifestJson as unknown as Manifest;

/** Cada grabación real de la consola, sola, para revisarla en el Studio. */
const TomaSuelta: React.FC<{clip: string}> = ({clip}) => <Toma meta={tomas[clip]} />;
const Completo: React.FC = () => <Video manifest={manifest} tomas={tomas} />;

export const Raiz: React.FC = () => (
  <>
    <Composition id="ValhallaSOC" component={Completo} durationInFrames={manifest.duracion} fps={manifest.fps} width={1920} height={1080} />
    <Folder name="Tomas-reales">
      {Object.values(tomas).map((m) => (
        <Composition
          key={m.clip}
          id={`toma-${m.clip.replace(/_/g, "-")}`}
          component={TomaSuelta}
          defaultProps={{clip: m.clip}}
          durationInFrames={Math.max(1, Math.round(m.duracion * FPS))}
          fps={FPS}
          width={1920}
          height={1080}
        />
      ))}
    </Folder>
  </>
);
