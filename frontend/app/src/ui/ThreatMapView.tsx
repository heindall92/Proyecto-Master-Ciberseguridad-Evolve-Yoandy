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
  as?: string;
  lat: number;
  lon: number;
  count: number;
  is_honeypot?: boolean;
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
  const SOC_COORDS: [number, number] = [40.4168, -3.7038]; // Madrid, España

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "15px", background: "var(--bg-panel)", gap: "15px", overflow: 'hidden' }}>
      <style>{`
        .attack-line {
          stroke-dasharray: 10, 10;
          animation: dash 20s linear infinite;
        }
        @keyframes dash {
          to { stroke-dashoffset: -1000; }
        }
        .leaflet-popup-content-wrapper {
          background: rgba(10, 20, 15, 0.95) !important;
          color: #fff !important;
          border: 1px solid var(--signal) !important;
          border-radius: 4px !important;
        }
        .leaflet-popup-tip {
          background: var(--signal) !important;
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "20px", color: "var(--signal)", fontFamily: "var(--mono)" }}>🛰️ Cyber-Threat Intelligence Map</h2>
          <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>Visualización táctica de ataques en tiempo real (Pew Pew Mode)</span>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <div style={{ display: "flex", background: "rgba(0,0,0,0.3)", borderRadius: "4px", padding: "2px" }}>
             {["Fuerza Bruta", "DDoS", "Malware", "Honeypot"].map(f => (
               <span key={f} style={{ fontSize: '9px', padding: '4px 8px', color: 'var(--text-dim)', borderRight: '1px solid var(--line)' }}>{f}</span>
             ))}
          </div>
          <select value={hours} onChange={e => setHours(Number(e.target.value))} style={{ background: "var(--bg-void)", border: "1px solid var(--line)", color: "var(--text)", padding: "6px 10px", borderRadius: "4px", fontSize: "11px" }}>
            <option value={1}>1h</option>
            <option value={6}>6h</option>
            <option value={24}>24h</option>
          </select>
          <button onClick={loadMap} style={{ padding: "6px 10px", background: "var(--signal)", border: "none", color: "#000", borderRadius: "4px", cursor: "pointer", fontSize: "11px", fontWeight: 600 }}>🔄 REFRESH</button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", gap: "15px", overflow: "hidden" }}>
        {/* Left: Map */}
        <div style={{ flex: 1, borderRadius: "8px", overflow: "hidden", border: "1px solid var(--line)", position: 'relative' }}>
          <MapContainer center={[20, 0]} zoom={2.5} style={{ height: "100%", width: "100%" }} preferCanvas>
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; CARTO' />
            
            {attacks.filter(a => a.lat !== 0 && a.lon !== 0).map((attack, i) => {
              const radius = Math.max(4, (attack.count / maxCount) * 15);
              const isSpain = attack.country_code === "ES";
              const color = attack.is_honeypot ? "#FF00FF" : (isSpain ? "var(--signal)" : "var(--danger)");
              
              return (
                <div key={i}>
                  <CircleMarker 
                    center={[attack.lat, attack.lon]} 
                    radius={radius} 
                    pathOptions={{ color: color, fillColor: color, fillOpacity: 0.6, weight: 1 }}
                  >
                    <Popup>
                      <div style={{ fontFamily: "var(--mono)", fontSize: "11px", minWidth: '180px' }}>
                        <div style={{ color: color, fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px', marginBottom: '4px' }}>
                           🚨 {attack.is_honeypot ? 'HONEYPOT HIT' : 'INBOUND ATTACK'}
                        </div>
                        <strong>{attack.city}, {attack.country}</strong><br />
                        <span style={{ color: 'var(--text-dim)' }}>IP:</span> {attack.ip}<br />
                        <span style={{ color: 'var(--text-dim)' }}>ASN:</span> {attack.as || attack.isp}<br />
                        <span style={{ color: 'var(--text-dim)' }}>VOL:</span> {attack.count} events<br />
                        
                        <div style={{ marginTop: '10px', display: 'flex', gap: '5px' }}>
                           <button onClick={() => window.open(`https://www.virustotal.com/gui/ip-address/${attack.ip}`)} style={{ flex: 1, padding: '4px', fontSize: '9px', background: 'rgba(255,255,255,0.1)', border: '1px solid #fff', color: '#fff', cursor: 'pointer' }}>VIRUSTOTAL</button>
                           <button style={{ flex: 1, padding: '4px', fontSize: '9px', background: 'var(--signal)', border: 'none', color: '#000', cursor: 'pointer', fontWeight: 'bold' }}>+ TICKET</button>
                        </div>
                      </div>
                    </Popup>
                  </CircleMarker>
                  
                  {/* Outer glow circle */}
                  <CircleMarker 
                    center={[attack.lat, attack.lon]} 
                    radius={radius * 1.5} 
                    pathOptions={{ color: color, fill: false, weight: 1, opacity: 0.3 }}
                  />
                </div>
              );
            })}
          </MapContainer>
          
          <div style={{ position: 'absolute', bottom: '20px', left: '20px', zIndex: 1000, background: 'rgba(0,0,0,0.7)', padding: '10px', borderRadius: '4px', border: '1px solid var(--line)', fontSize: '10px' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--danger)' }}></span> Web Attack / Brute Force
             </div>
             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#FF00FF' }}></span> Honeypot Activity
             </div>
             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--signal)' }}></span> Internal / Authorized
             </div>
          </div>
        </div>

        {/* Right: Intel Panel */}
        <div style={{ width: "320px", background: "var(--bg-void)", border: "1px solid var(--line)", borderRadius: "8px", display: "flex", flexDirection: "column", padding: '15px' }}>
          <h3 style={{ margin: "0 0 15px", fontSize: "12px", color: "var(--signal)", fontFamily: "var(--mono)", borderBottom: '1px solid var(--line)', paddingBottom: '8px' }}>
            🌍 GEOPOLITICAL ORIGINS
          </h3>
          <div style={{ flex: 1, overflow: "auto" }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {countries.map((c, idx) => (
                <div key={idx} style={{ padding: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                         <span style={{ fontSize: '16px' }}>{getFlagEmoji(c.country)}</span>
                         <span style={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>{c.country}</span>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--signal)', fontWeight: 'bold' }}>{c.count.toLocaleString()}</span>
                   </div>
                   <div style={{ marginTop: '5px', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px' }}>
                      <div style={{ height: '100%', width: `${(c.count / total) * 100}%`, background: 'var(--signal)', borderRadius: '2px' }}></div>
                   </div>
                </div>
              ))}
            </div>
          </div>
          
          <div style={{ marginTop: '15px', padding: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid var(--danger)', borderRadius: '6px' }}>
             <div style={{ fontSize: '10px', color: 'var(--danger)', fontWeight: 'bold', marginBottom: '5px' }}>GEOFENCING ALERT</div>
             <div style={{ fontSize: '11px', color: '#fff' }}>
                Detected <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>{countries.filter(c => c.country !== 'ES').length}</span> international origins targeting Spain infrastructure.
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getFlagEmoji(countryCode: string) {
  if (countryCode === 'XX') return '🏳️';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}