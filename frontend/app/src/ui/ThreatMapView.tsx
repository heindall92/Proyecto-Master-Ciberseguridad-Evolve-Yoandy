import { useState, useEffect } from "react";
import { getThreatMap } from "../lib/api";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

interface AttackPoint {
  ip: string;
  country: string;
  country_code: string;
  city: string;
  isp: string;
  lat: number;
  lon: number;
  count: number;
}

export default function ThreatMapView() {
  const [attacks, setAttacks] = useState<AttackPoint[]>([]);
  const [countries, setCountries] = useState<{country: string; count: number}[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(24);

  const loadMap = async () => {
    setLoading(true);
    try {
      const data = await getThreatMap(hours);
      setAttacks(data.attacks || []);
      setCountries(data.countries || []);
      setTotal(data.total_attacks || 0);
    } catch (e) {
      console.error("Threat map error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMap();
    const iv = setInterval(loadMap, 60000);
    return () => clearInterval(iv);
  }, [hours]);

  const maxCount = Math.max(...attacks.map(a => a.count), 1);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "15px", background: "var(--bg-panel)", gap: "15px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "20px", color: "var(--signal)", fontFamily: "var(--mono)" }}>Threat Map</h2>
          <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>Mapa geográfico de ataques en tiempo real</span>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <select value={hours} onChange={e => setHours(Number(e.target.value))} style={{ background: "var(--bg-void)", border: "1px solid var(--line)", color: "var(--text)", padding: "6px 10px", borderRadius: "4px", fontSize: "11px" }}>
            <option value={1}>1h</option>
            <option value={6}>6h</option>
            <option value={24}>24h</option>
            <option value={168}>7d</option>
          </select>
          <button onClick={loadMap} style={{ padding: "6px 10px", background: "var(--signal)", border: "none", color: "#000", borderRadius: "4px", cursor: "pointer", fontSize: "11px", fontWeight: 600 }}>🔄 SYNC</button>
          <span style={{ padding: "8px 14px", background: "var(--danger)", borderRadius: "4px", fontSize: "14px", fontWeight: "bold", color: "#000" }}>{total.toLocaleString()}</span>
        </div>
      </div>

      <div style={{ flex: 1, borderRadius: "8px", overflow: "hidden", border: "1px solid var(--line)" }}>
        <MapContainer center={[20, 0]} zoom={2} style={{ height: "100%", width: "100%" }} preferCanvas>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; <a href="https://carto.com/">CARTO</a>' />
          {attacks.filter(a => a.lat !== 0 && a.lon !== 0).map((attack, i) => (
            <CircleMarker key={i} center={[attack.lat, attack.lon]} radius={Math.max(4, (attack.count / maxCount) * 20)} pathOptions={{ color: "var(--danger)", fillColor: "var(--danger)", fillOpacity: 0.6, weight: 1 }}>
              <Popup>
                <div style={{ fontFamily: "var(--mono)", fontSize: "11px" }}>
                  <strong>{attack.city}, {attack.country}</strong><br />
                  IP: {attack.ip}<br />
                  ISP: {attack.isp}<br />
                  Ataques: {attack.count}
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}