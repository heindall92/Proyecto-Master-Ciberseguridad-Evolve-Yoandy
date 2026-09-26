import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, Globe2, MapPin, RefreshCw, Radar } from "lucide-react";
import logger from "../lib/logger";
import { getThreatMap } from "../lib/api";

/**
 * Mapa de origen de los ataques (pestaña "Mapa" de Inteligencia).
 * Teselas de Esri sin clave (CARTO pasó a exigirla y mostraba "API KEY REQUIRED").
 *
 * Leaflet directo (BSD-2): react-leaflet usa la licencia Hippocratic-2.1, que añade
 * restricciones de uso incompatibles con la GPLv2 del proyecto. Las ventanas emergentes se
 * construyen con nodos DOM y textContent: IP, ciudad y ASN vienen de un servicio externo de
 * geolocalización y nunca se interpretan como HTML.
 */

interface AttackPoint {
  ip: string; country: string; country_code: string; city: string; isp: string; as?: string;
  lat: number; lon: number; count: number; is_honeypot?: boolean;
}

const SOC_COORDS: [number, number] = [40.4168, -3.7038]; // Madrid
const TILES = {
  dark: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  light: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
};
const COLOR = { external: "#ef4f5f", honeypot: "#b36bff", local: "var(--signal)" };

export default function ThreatMapView({ lang = "es", onAnalyze }: { lang?: string; onAnalyze?: (ip: string) => void }) {
  const es = lang === "es";
  const [attacks, setAttacks] = useState<AttackPoint[]>([]);
  const [countries, setCountries] = useState<{ country: string; count: number }[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(24);
  const theme = typeof document !== "undefined" && document.body.dataset.theme === "light" ? "light" : "dark";
  const names = useMemo(() => { try { return new Intl.DisplayNames([es ? "es" : "en"], { type: "region" }); } catch { return null; } }, [es]);
  const countryName = (code: string) => { try { return (code && code !== "XX" && names?.of(code)) || code; } catch { return code; } };

  const load = async () => {
    setLoading(true);
    try {
      const data = await getThreatMap(hours);
      setAttacks(data.attacks || []); setCountries(data.countries || []); setTotal(data.total_attacks || 0);
    } catch (e) { logger.error("Threat map error:", e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); const iv = setInterval(load, 60000); return () => clearInterval(iv); }, [hours]); // eslint-disable-line react-hooks/exhaustive-deps

  const geo = useMemo(() => attacks.filter(a => a.lat !== 0 && a.lon !== 0), [attacks]);
  const maxCount = Math.max(...geo.map(a => a.count), 1);
  const honeypotHits = geo.filter(a => a.is_honeypot).reduce((s, a) => s + a.count, 0);
  const foreign = countries.filter(c => c.country !== "ES" && c.country !== "XX").length;

  // Mapa: se crea una vez; teselas según el tema y capa de ataques según los datos
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const tiles = useRef<L.TileLayer | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  useEffect(() => {
    if (!mapEl.current || map.current) return;
    map.current = L.map(mapEl.current, { center: [25, 5], zoom: 2, minZoom: 2, worldCopyJump: true, preferCanvas: true });
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current?.remove(); map.current = null; tiles.current = null; layer.current = null; };
  }, []);
  useEffect(() => {
    if (!map.current) return;
    tiles.current?.remove();
    tiles.current = L.tileLayer(TILES[theme], { attribution: "Tiles &copy; Esri — Esri, HERE, Garmin, &copy; OpenStreetMap" }).addTo(map.current);
  }, [theme]);
  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    // El canvas no entiende variables CSS: se resuelve el color de acento del tema actual
    const signal = getComputedStyle(document.body).getPropertyValue("--signal").trim() || "#3fb37f";
    for (const a of geo) {
      const radius = Math.max(4, (a.count / maxCount) * 15);
      const color = a.is_honeypot ? COLOR.honeypot : a.country_code === "ES" ? signal : COLOR.external;
      L.polyline([[a.lat, a.lon], SOC_COORDS], { color, weight: 1, className: "tm-line" }).addTo(g);
      L.circleMarker([a.lat, a.lon], { radius: radius * 2, color, fill: false, weight: 1, className: "tm-pulse" }).addTo(g);
      L.circleMarker([a.lat, a.lon], { radius, color, fillColor: color, fillOpacity: 0.55, weight: 1 })
        .bindPopup(() => popup(a, color)).addTo(g);
    }
  }, [geo, maxCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const popup = (a: AttackPoint, color: string) => {
    const box = document.createElement("div");
    box.className = "tm-pop";
    const title = document.createElement("b");
    title.style.color = color;
    title.textContent = a.is_honeypot ? (es ? "Ataque al honeypot" : "Honeypot hit") : (es ? "Ataque entrante" : "Inbound attack");
    box.append(title);
    const place = document.createElement("span");
    place.textContent = [a.city, countryName(a.country_code || a.country)].filter(Boolean).join(", ");
    box.append(place);
    for (const [k, v] of [["IP", a.ip], ["ASN", a.as || a.isp || "—"], [es ? "Eventos" : "Events", String(a.count)]]) {
      const row = document.createElement("span");
      const key = document.createElement("i");
      key.textContent = k;
      row.append(key, document.createTextNode(v));
      box.append(row);
    }
    if (onAnalyze) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = es ? "Analizar IP" : "Analyze IP";
      btn.onclick = () => onAnalyze(a.ip);
      box.append(btn);
    }
    return box;
  };

  return (
    <div className="tm">
      <div className="in-bar">
        <div className="in-seg" role="group" aria-label={es ? "Ventana de tiempo" : "Time window"}>
          {[1, 6, 24].map(h => <button key={h} type="button" aria-pressed={hours === h} onClick={() => setHours(h)}>{h} h</button>)}
        </div>
        <div className="tm-stats">
          <span><Crosshair size={13} /><b>{total.toLocaleString("es-ES")}</b> {es ? "ataques" : "attacks"}</span>
          <span><MapPin size={13} /><b>{geo.length}</b> {es ? "orígenes geolocalizados" : "geolocated origins"}</span>
          <span><Radar size={13} /><b>{honeypotHits}</b> {es ? "en el honeypot" : "on honeypot"}</span>
        </div>
        <button type="button" className="wk-iconbtn" onClick={load} title={es ? "Actualizar" : "Refresh"} aria-label={es ? "Actualizar" : "Refresh"}><RefreshCw size={15} className={loading ? "ex-spin" : ""} /></button>
      </div>

      <div className="tm-grid">
        <div className="tm-map in-panel">
          <div ref={mapEl} style={{ height: "100%", width: "100%" }} />
          <div className="tm-legend">
            <span><i style={{ background: COLOR.external }} />{es ? "Externo" : "External"}</span>
            <span><i style={{ background: COLOR.honeypot }} />Honeypot</span>
            <span><i style={{ background: "var(--signal)" }} />{es ? "España" : "Spain"}</span>
          </div>
        </div>

        <aside className="tm-side in-panel">
          <header className="in-watch__head"><Globe2 size={15} /><h3>{es ? "Países de origen" : "Origin countries"}</h3><span className="in-count">{countries.length}</span></header>
          {countries.length ? (
            <ul className="ex-bars tm-countries">
              {countries.map(c => (
                <li key={c.country}>
                  <span className="ex-bars__label">{countryName(c.country)}<small>{c.country}</small></span>
                  <span className="ex-bars__track"><i style={{ width: `${(c.count * 100) / Math.max(total, 1)}%` }} /></span>
                  <b>{c.count.toLocaleString("es-ES")}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="in-empty">{loading ? (es ? "Cargando…" : "Loading…") : (es
              ? "Sin orígenes geolocalizados en esta ventana. En el laboratorio las IP atacantes son privadas (172.18.x.x) y no tienen ubicación."
              : "No geolocated origins in this window.")}</p>
          )}
          {foreign > 0 && <p className="tm-alert">{es ? `${foreign} países extranjeros atacando la infraestructura.` : `${foreign} foreign countries attacking.`}</p>}
        </aside>
      </div>
    </div>
  );
}
