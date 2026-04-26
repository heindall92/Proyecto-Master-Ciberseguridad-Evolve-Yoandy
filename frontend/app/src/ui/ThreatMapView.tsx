export default function ThreatMapView() {
  return (
    <div style={{ padding: 40, color: 'var(--text-dim)', textAlign: 'center' }}>
      <h2>Threat Map</h2>
      <p>Mapa de geolocalización de ataques en mantenimiento</p>
      <p style={{ fontSize: 12 }}>Requiere react-leaflet en entorno Docker</p>
    </div>
  );
}