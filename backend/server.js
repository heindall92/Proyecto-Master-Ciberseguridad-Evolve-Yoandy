'use strict';
require('dotenv').config();
const express      = require('express');
const https        = require('https');
const fs           = require('fs');
const path         = require('path');
const cookieParser = require('cookie-parser');

// Init DB (creates tables + default admin on first run)
require('./db');

const { requireAuth } = require('./auth');
const { getSetting, settingsQueries, encryptSetting, decryptSetting, writeAudit, aiQueries, db: _db } = require('./db');
const authRoutes    = require('./routes/auth');
const usersRoutes   = require('./routes/users');
const exportRoutes  = require('./routes/export');
const ticketsRoutes = require('./routes/tickets');

const app  = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// ── Backup automático de valhalla.db ──────────────────────────────────────────
(function scheduleBackup() {
  const DB_PATH      = path.join(__dirname, 'valhalla.db');
  const BACKUP_DIR   = path.join(__dirname, 'backups');
  const KEEP_BACKUPS = 7;

  function doBackup() {
    try {
      if (!fs.existsSync(DB_PATH)) return;
      if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
      const stamp = new Date().toISOString().slice(0, 10);
      const dest  = path.join(BACKUP_DIR, `valhalla_${stamp}.db`);
      fs.copyFileSync(DB_PATH, dest);
      // Purge old backups — keep the most recent N
      const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('valhalla_') && f.endsWith('.db'))
        .sort();
      while (files.length > KEEP_BACKUPS) {
        fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
      }
      console.log('[backup] valhalla.db →', path.basename(dest));
    } catch (e) {
      console.error('[backup] Error:', e.message);
    }
  }

  doBackup(); // once at startup
  setInterval(doBackup, 24 * 60 * 60 * 1000); // then every 24h
})();

// ── Security headers ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' https://unpkg.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none';"
  );
  // HSTS — only in production (HTTPS). Preload requires at least 1 year.
  if (IS_PROD) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());

// ── Config from env (same vars as docker-compose) ────────────────────────────
const INDEXER_URL  = process.env.INDEXER_URL  || 'https://localhost:9200';
const WAZUH_API    = process.env.WAZUH_API_URL || 'https://localhost:55000';
const IDX_USER     = process.env.INDEXER_USERNAME  || 'admin';
const IDX_PASS     = process.env.INDEXER_PASSWORD  || 'admin';
const API_USER     = process.env.WAZUH_API_USER     || 'wazuh-wui';
const API_PASS     = process.env.WAZUH_API_PASSWORD || 'wazuh-wui';

// ── HTTPS agent — strict TLS in prod, permissive in dev (self-signed certs) ──
// Set WAZUH_TLS_STRICT=true in .env when Wazuh uses a valid/trusted certificate.
const agent = new https.Agent({
  rejectUnauthorized: IS_PROD && process.env.WAZUH_TLS_STRICT === 'true',
});

// ── SEC-001: Whitelist for Ollama URL (prevents SSRF) ────────────────────────
function isSafeLocalUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    const h = u.hostname.toLowerCase();
    return (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      /^10\./.test(h) ||
      /^192\.168\./.test(h) ||
      /^172\.(1[6-9]|2[0-9]|3[01])\./.test(h) ||
      h.endsWith('.local')
    );
  } catch { return false; }
}

// ── SEC-005: Validate IPv4 — each octet must be 0-255 ────────────────────────
function isValidIPv4(ip) {
  if (typeof ip !== 'string') return false;
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every(p => /^\d{1,3}$/.test(p) && parseInt(p, 10) <= 255);
}

// ── Helper: make an HTTPS request, return parsed JSON ────────────────────────
function httpsRequest(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const reqOptions = {
      hostname: url.hostname,
      port:     url.port || 443,
      path:     url.pathname + url.search,
      method:   options.method || 'GET',
      headers:  options.headers || {},
      agent,
    };
    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ── Wazuh API JWT token (cached, refreshed on 401) ───────────────────────────
let wazuhToken = null;
async function getWazuhToken() {
  if (wazuhToken) return wazuhToken;
  const creds = Buffer.from(`${API_USER}:${API_PASS}`).toString('base64');
  const res = await httpsRequest(`${WAZUH_API}/security/user/authenticate`, {
    method: 'GET',
    headers: { 'Authorization': `Basic ${creds}` },
  });
  if (res.status === 200 && res.body?.data?.token) {
    wazuhToken = res.body.data.token;
    setTimeout(() => { wazuhToken = null; }, 14 * 60 * 1000); // expire after 14m
    return wazuhToken;
  }
  throw new Error(`Wazuh auth failed: ${res.status}`);
}

// ── OpenSearch query helper ───────────────────────────────────────────────────
async function osQuery(index, query) {
  const creds = Buffer.from(`${IDX_USER}:${IDX_PASS}`).toString('base64');
  const body  = JSON.stringify(query);
  const res   = await httpsRequest(`${INDEXER_URL}/${index}/_search`, {
    method:  'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type':  'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
    body,
  });
  if (res.status !== 200) throw new Error(`OpenSearch ${res.status}`);
  return res.body;
}

// ── GeoIP cache (ip-api.com — free, no key, 45 req/min) ──────────────────────
const geoCache = new Map();
async function geolocate(ip) {
  if (geoCache.has(ip)) return geoCache.get(ip);
  try {
    const r = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode,country,city,lat,lon`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return null;
    const d = await r.json();
    if (d.status === 'success') {
      const geo = { cc: d.countryCode, city: d.city || d.country, lat: d.lat, lng: d.lon };
      geoCache.set(ip, geo);
      setTimeout(() => geoCache.delete(ip), 24 * 60 * 60 * 1000); // 24h TTL
      return geo;
    }
  } catch { /* timeout or network error */ }
  return null;
}

// ── Map Wazuh rule level → severity label ────────────────────────────────────
function levelToSev(level) {
  if (level >= 13) return 'CRIT';
  if (level >= 10) return 'HIGH';
  if (level >= 7)  return 'HIGH';
  if (level >= 4)  return 'MED';
  return 'LOW';
}

// ── Public auth routes (login / logout / me — auth checked inline) ────────────
app.use('/api', authRoutes);

// ── GLOBAL AUTH GUARD — protects every /api/* route registered below ─────────
app.use('/api', requireAuth);

// ── AUDIT LOG — registra acciones de escritura (POST/PUT/DELETE) ──────────────
app.use('/api', (req, res, next) => {
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) return next();
  const user   = req.user?.username || 'anonymous';
  const ip     = req.socket.remoteAddress || '';
  const target = req.path;
  // Log after response so status code is known
  res.on('finish', () => {
    const detail = `${req.method} ${res.statusCode}`;
    writeAudit(user, req.method.toLowerCase(), target, detail, ip);
  });
  next();
});

// ── /api/dashboard — aggregates all data the HUD needs ───────────────────────
app.get('/api/dashboard', async (req, res) => {
  const result = {};

  // ─ Alerts from OpenSearch ─
  try {
    const osRes = await osQuery('wazuh-alerts-*', {
      size: 50,
      sort: [{ timestamp: { order: 'desc' } }],
      _source: ['timestamp', 'rule.level', 'rule.description', 'rule.id',
                'agent.name', 'data.srcip', 'data.src_ip'],
      query: { match_all: {} },
    });
    result.alerts = (osRes.hits?.hits || []).map(hit => {
      const s = hit._source;
      return {
        sev:    levelToSev(s.rule?.level || 0),
        time:   (s.timestamp || '').slice(11, 19),
        msg:    s.rule?.description || 'Unknown alert',
        rule:   String(s.rule?.id || '0'),
        src:    s.agent?.name || s.data?.srcip || s.data?.src_ip || 'unknown',
        status: 'NUEVA',
      };
    });
  } catch (e) {
    result.alerts = null; // frontend will keep mock
  }

  // ─ Agents from Wazuh API ─
  try {
    const token = await getWazuhToken();
    const agRes = await httpsRequest(`${WAZUH_API}/agents?limit=500&select=id,name,ip,status,os.name,os.platform,version`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const allAgents = agRes.body?.data?.affected_items || [];
    const agents = allAgents.filter(a => a.id !== '000'); // exclude manager itself
    result.agents = agents.map(a => ({
      id:     a.id,
      name:   a.name,
      ip:     a.ip || 'N/A',
      os:     a.os?.name || a.os?.platform || 'Unknown',
      status: a.status === 'active' ? 'up' : (a.status === 'disconnected' ? 'down' : 'warn'),
      agent:  `Wazuh ${(a.version || '').replace('Wazuh v', '')}`,
      type:   'endpoint',
    }));

    const total  = agents.length;
    const online = agents.filter(a => a.status === 'active').length;
    result.agentStats = { online, total };
  } catch (e) {
    result.agents = null;
    result.agentStats = null;
  }

  // ─ Attack origins from cowrie data in OpenSearch ─
  try {
    const attRes = await osQuery('wazuh-alerts-*', {
      size: 0,
      query: { term: { 'rule.groups': 'cowrie' } },
      aggs: {
        by_ip: {
          terms: { field: 'data.src_ip', size: 20 },
          aggs: {
            by_type: { terms: { field: 'rule.description', size: 1 } },
          },
        },
      },
    });
    const buckets = attRes.aggregations?.by_ip?.buckets || [];
    const geoResults = await Promise.all(buckets.map(b => geolocate(b.key)));
    result.attacks = buckets.map((b, i) => {
      const geo = geoResults[i];
      return {
        city:  geo?.city  || b.key,
        cc:    geo?.cc    || '??',
        lat:   geo?.lat   ?? 0,
        lng:   geo?.lng   ?? 0,
        ip:    b.key,
        count: b.doc_count,
        type:  (b.by_type?.buckets?.[0]?.key || 'scan').toLowerCase().includes('login') ? 'brute-force' : 'scan',
      };
    });
  } catch (e) {
    result.attacks = null;
  }

  // ─ Alert count metrics ─
  try {
    const last24 = await osQuery('wazuh-alerts-*', {
      size: 0,
      query: { range: { timestamp: { gte: 'now-24h' } } },
    });
    result.metrics = {
      alerts24h: last24.hits?.total?.value || 0,
    };
  } catch (e) {
    result.metrics = null;
  }

  res.json(result);
});

// ── /api/agent/:id — full detail for a single agent ──────────────────────────
app.get('/api/agent/:id', async (req, res) => {
  const id = String(req.params.id).replace(/[^0-9]/g, '');
  if (!id) return res.status(400).json({ error: 'ID de agente inválido' });
  const result = {};

  try {
    const token = await getWazuhToken();

    // Basic agent info
    const infoRes = await httpsRequest(
      `${WAZUH_API}/agents?agents_list=${id}&select=id,name,ip,status,os.name,os.platform,os.version,version,dateAdd,lastKeepAlive,group`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    result.info = infoRes.body?.data?.affected_items?.[0] || null;

    // SCA results
    try {
      const scaRes = await httpsRequest(
        `${WAZUH_API}/sca/${id}?limit=5`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      result.sca = scaRes.body?.data?.affected_items || [];
    } catch { result.sca = []; }

  } catch (e) {
    result.info = null;
    result.sca  = [];
  }

  // Recent alerts for this agent
  try {
    const alertsRes = await osQuery('wazuh-alerts-*', {
      size: 20,
      sort: [{ timestamp: { order: 'desc' } }],
      _source: ['timestamp', 'rule.level', 'rule.description', 'rule.id', 'rule.mitre'],
      query: { term: { 'agent.id': id } },
    });
    result.alerts = (alertsRes.hits?.hits || []).map(h => ({
      time: (h._source.timestamp || '').slice(11, 19),
      sev:  levelToSev(h._source.rule?.level || 0),
      msg:  h._source.rule?.description || '—',
      rule: String(h._source.rule?.id || '0'),
      mitre: h._source.rule?.mitre?.id?.[0] || '',
    }));
  } catch { result.alerts = []; }

  // MITRE tactics aggregation
  try {
    const mitreRes = await osQuery('wazuh-alerts-*', {
      size: 0,
      query: {
        bool: {
          must: [
            { term: { 'agent.id': id } },
            { exists: { field: 'rule.mitre.tactic' } },
          ],
        },
      },
      aggs: {
        tactics: {
          terms: { field: 'rule.mitre.tactic', size: 8 },
        },
      },
    });
    result.mitre = (mitreRes.aggregations?.tactics?.buckets || []).map(b => ({
      tactic: b.key,
      count:  b.doc_count,
    }));
  } catch { result.mitre = []; }

  // Top triggered rules
  try {
    const rulesRes = await osQuery('wazuh-alerts-*', {
      size: 0,
      query: { term: { 'agent.id': id } },
      aggs: {
        top_rules: {
          terms: { field: 'rule.description', size: 8 },
        },
      },
    });
    result.topRules = (rulesRes.aggregations?.top_rules?.buckets || []).map(b => ({
      desc:  b.key,
      count: b.doc_count,
    }));
  } catch { result.topRules = []; }

  res.json(result);
});

// ── Settings (Ollama config, stored in SQLite) ────────────────────────────────
app.get('/api/settings', (req, res) => {
  const rows = settingsQueries.all.all();
  const obj  = Object.fromEntries(rows.map(r => [r.key, r.value]));
  // Never expose cloud key in full — mask it
  if (obj.ollama_cloud_key) obj.ollama_cloud_key_set = 'true';
  delete obj.ollama_cloud_key;
  res.json(obj);
});

app.post('/api/settings', (req, res) => {
  const allowed = ['ollama_provider', 'ollama_url', 'ollama_model', 'ollama_cloud_key', 'ollama_cloud_model'];
  const body = req.body || {};
  for (const key of allowed) {
    if (!(key in body) || typeof body[key] !== 'string') continue;
    const val = body[key].trim().slice(0, 512);
    // SEC-001: Validate ollama_url against SSRF whitelist before persisting
    if (key === 'ollama_url' && val && !isSafeLocalUrl(val)) {
      return res.status(400).json({ ok: false, error: 'URL Ollama no permitida. Solo redes locales.' });
    }
    const stored = key === 'ollama_cloud_key' ? encryptSetting(val) : val;
    settingsQueries.set.run(key, stored);
  }
  res.json({ ok: true });
});

// ── Ollama proxy routes ───────────────────────────────────────────────────────
app.post('/api/ollama/check', async (req, res) => {
  const provider = req.body?.provider || getSetting('ollama_provider') || 'local';

  if (provider === 'cloud') {
    const raw = req.body?.cloudKey || decryptSetting(getSetting('ollama_cloud_key'));
    const key = raw;
    if (!key) return res.json({ ok: false, error: 'Ollama Cloud API Key no configurada' });
    try {
      const r = await fetch('https://api.ollama.com/api/tags', {
        headers: { 'Authorization': `Bearer ${key}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) return res.json({ ok: false, error: `Ollama Cloud HTTP ${r.status}` });
      const d = await r.json();
      const model = d.models?.[0]?.name || getSetting('ollama_cloud_model') || 'llama3.1:8b';
      res.json({ ok: true, model, provider: 'cloud' });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
    return;
  }

  // Local Ollama
  const url = req.body?.url || getSetting('ollama_url') || 'http://localhost:11434';
  if (!isSafeLocalUrl(url)) {
    return res.json({ ok: false, error: 'URL no permitida. Solo se admiten IPs de red local (localhost, 10.x, 192.168.x, 172.16-31.x).' });
  }
  try {
    const r = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(5000) });
    const d = await r.json();
    const model = d.models?.[0]?.name || getSetting('ollama_model') || '(ninguno instalado)';
    res.json({ ok: true, model, provider: 'local', models: (d.models || []).map(m => m.name) });
  } catch (e) {
    res.json({ ok: false, error: `No se puede conectar con Ollama local: ${e.message}` });
  }
});

app.post('/api/ollama/analyze', async (req, res) => {
  const { query } = req.body || {};
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return res.json({ error: 'Consulta vacía' });
  }

  const provider = getSetting('ollama_provider') || 'local';
  const prompt   = `Eres un analista experto de ciberseguridad SOC (Security Operations Center). Analiza lo siguiente con detalle técnico y responde en español con recomendaciones concretas:\n\n${query.slice(0, 4000)}`;

  if (provider === 'cloud') {
    const key   = decryptSetting(getSetting('ollama_cloud_key'));
    const model = getSetting('ollama_cloud_model') || 'llama3.1:8b';
    if (!key) return res.json({ error: 'Ollama Cloud API Key no configurada. Ve a Ajustes → Ollama AI.' });
    try {
      const r = await fetch('https://api.ollama.com/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body:    JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: false }),
        signal:  AbortSignal.timeout(300000),
      });
      if (!r.ok) {
        const txt = await r.text();
        return res.json({ error: `Ollama Cloud [${r.status}]: ${txt.slice(0, 200)}` });
      }
      const d = await r.json();
      const response = d.message?.content || 'Sin respuesta del modelo';
      aiQueries.insert.run(req.user?.username || '', query.slice(0, 2000), response, model, 'cloud');
      res.json({ response, provider: 'cloud', model });
    } catch (e) {
      res.json({ error: `Error Ollama Cloud: ${e.message}` });
    }
    return;
  }

  // Local
  const url   = getSetting('ollama_url') || 'http://localhost:11434';
  const model = getSetting('ollama_model') || 'llama3.2';
  try {
    const r = await fetch(`${url}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: false }),
      signal:  AbortSignal.timeout(120000),
    });
    const d = await r.json();
    if (d.error) return res.json({ error: d.error });
    const response = d.message?.content || 'Sin respuesta del modelo';
    aiQueries.insert.run(req.user?.username || '', query.slice(0, 2000), response, model, 'local');
    res.json({ response, provider: 'local', model });
  } catch (e) {
    res.json({ error: `Error Ollama local: ${e.message}` });
  }
});

// ── /api/ollama/history — historial de análisis guardados ────────────────────
app.get('/api/ollama/history', (req, res) => {
  try {
    const rows = aiQueries.recent.all(50);
    res.json({ ok: true, analyses: rows });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── /api/audit — ultimas 200 entradas del audit log (solo admin) ─────────────
app.get('/api/audit', (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { auditQueries } = require('./db');
    const rows = auditQueries.recent.all(200);
    res.json({ ok: true, entries: rows });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── VirusTotal proxy (v3 API) ─────────────────────────────────────────────────
app.post('/api/virustotal/check', async (req, res) => {
  const VT_KEY = process.env.VIRUSTOTAL_API_KEY;
  if (!VT_KEY) return res.json({ ok: false, error: 'VIRUSTOTAL_API_KEY no configurada' });

  const { value, type } = req.body || {};
  if (!value || typeof value !== 'string' || value.length > 512) {
    return res.status(400).json({ ok: false, error: 'Valor IOC inválido' });
  }

  const safeVal = encodeURIComponent(value.trim());
  const vtBase  = 'https://www.virustotal.com/api/v3';
  let vtUrl;
  if (type === 'ip' || /^(\d{1,3}\.){3}\d{1,3}$/.test(value)) {
    vtUrl = `${vtBase}/ip_addresses/${safeVal}`;
  } else if (type === 'hash' || /^[a-fA-F0-9]{32,64}$/.test(value)) {
    vtUrl = `${vtBase}/files/${safeVal}`;
  } else {
    vtUrl = `${vtBase}/domains/${safeVal}`;
  }

  try {
    const r = await fetch(vtUrl, {
      headers: { 'x-apikey': VT_KEY, 'Accept': 'application/json' },
    });
    if (r.status === 404) return res.json({ ok: true, malicious: 0, total: 0, reputation: 0, category: 'No encontrado', country: 'N/A', lastAnalysis: 'N/A' });
    if (!r.ok) return res.json({ ok: false, error: `VirusTotal HTTP ${r.status}` });

    const d    = await r.json();
    const attr = d.data?.attributes || {};
    const stats = attr.last_analysis_stats || {};

    res.json({
      ok:          true,
      malicious:   stats.malicious || 0,
      total:       Object.values(stats).reduce((s, v) => s + v, 0),
      reputation:  attr.reputation || 0,
      category:    Object.values(attr.categories || {})[0] || attr.type_description || 'N/A',
      country:     attr.country || 'N/A',
      lastAnalysis: attr.last_analysis_date
        ? new Date(attr.last_analysis_date * 1000).toISOString().slice(0, 10)
        : 'N/A',
      permalink:   `https://www.virustotal.com/gui/search/${encodeURIComponent(value)}`,
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── Cowrie honeypot data ──────────────────────────────────────────────────────
app.get('/api/cowrie', async (req, res) => {
  try {
    const base = { query: { term: { 'rule.groups': 'cowrie' } } };

    const [sessRes, pwRes, cmdRes, srcRes] = await Promise.allSettled([
      // Session count
      osQuery('wazuh-alerts-*', { ...base, size: 0,
        query: { bool: { must: [base.query, { range: { timestamp: { gte: 'now-24h' } } }] } } }),
      // Top passwords
      osQuery('wazuh-alerts-*', { ...base, size: 0,
        aggs: { top_pw: { terms: { field: 'data.password', size: 10 } } } }),
      // Top commands
      osQuery('wazuh-alerts-*', { ...base, size: 0,
        query: { bool: { must: [base.query, { term: { 'rule.description': 'cowrie.command.input' } }] } },
        aggs: { top_cmd: { terms: { field: 'data.input', size: 10 } } } }),
      // Top source IPs
      osQuery('wazuh-alerts-*', { ...base, size: 0,
        aggs: { top_src: { terms: { field: 'data.src_ip', size: 10 } } } }),
    ]);

    const sessions24h = sessRes.status === 'fulfilled' ? (sessRes.value.hits?.total?.value || 0) : null;
    const topPasswords = pwRes.status === 'fulfilled'
      ? (pwRes.value.aggregations?.top_pw?.buckets || []).map(b => ({ val: b.key, count: b.doc_count }))
      : null;
    const topCommands = cmdRes.status === 'fulfilled'
      ? (cmdRes.value.aggregations?.top_cmd?.buckets || []).map(b => ({ val: b.key, count: b.doc_count, risk: 'MED' }))
      : null;
    const topSources = srcRes.status === 'fulfilled'
      ? (srcRes.value.aggregations?.top_src?.buckets || []).map(b => ({ ip: b.key, cc: '??', count: b.doc_count, threat: b.doc_count > 500 ? 'CRIT' : b.doc_count > 200 ? 'HIGH' : 'MED' }))
      : null;

    // Recent sessions
    let recentSessions = null;
    try {
      const recRes = await osQuery('wazuh-alerts-*', {
        size: 20, sort: [{ timestamp: { order: 'desc' } }],
        _source: ['timestamp', 'data.src_ip', 'data.username', 'data.password', 'data.duration', 'rule.description'],
        query: base.query,
      });
      recentSessions = (recRes.hits?.hits || []).map(h => ({
        time:    (h._source.timestamp || '').slice(11, 19),
        ip:      h._source.data?.src_ip || '?',
        user:    h._source.data?.username || '?',
        pass:    h._source.data?.password || '',
        dur:     h._source.data?.duration || '—',
        cmds:    0,
        malware: (h._source.rule?.description || '').includes('download'),
      }));
    } catch { /* keep null */ }

    res.json({ sessions24h, topPasswords, topCommands, topSources, recentSessions });
  } catch (e) {
    res.json({ error: e.message });
  }
});

app.post('/api/cowrie/block', async (req, res) => {
  const { ip } = req.body || {};
  if (!ip || !isValidIPv4(ip)) {
    return res.status(400).json({ ok: false, error: 'IP inválida' });
  }

  let wazuhResult = { tried: false, ok: false, error: null };

  // Try to add IP to Wazuh CDB list "blocked-ips" via API
  try {
    const token = await getWazuhToken();

    // First, get current CDB list content
    let existingContent = '';
    try {
      const getRes = await httpsRequest(`${WAZUH_API}/lists/files/blocked-ips?raw=true`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (getRes.status === 200) existingContent = typeof getRes.body === 'string' ? getRes.body : '';
    } catch { /* list may not exist yet */ }

    // Append new IP (CDB format: "ip:action")
    if (!existingContent.includes(ip)) {
      const newContent = (existingContent.trim() ? existingContent.trim() + '\n' : '') + `${ip}:drop\n`;
      const encoded = Buffer.from(newContent);
      const putRes = await httpsRequest(`${WAZUH_API}/lists/files/blocked-ips`, {
        method:  'PUT',
        headers: {
          'Authorization':  `Bearer ${token}`,
          'Content-Type':   'application/octet-stream',
          'Content-Length': encoded.length,
        },
        body: encoded,
      });
      wazuhResult.tried = true;
      wazuhResult.ok    = putRes.status === 200;
      wazuhResult.error = wazuhResult.ok ? null : `Wazuh HTTP ${putRes.status}`;
    } else {
      wazuhResult.tried = true;
      wazuhResult.ok    = true;
      wazuhResult.error = 'IP ya estaba en lista';
    }
  } catch (e) {
    wazuhResult.tried = true;
    wazuhResult.error = e.message;
  }

  console.log(`[COWRIE BLOCK] IP: ${ip} | Wazuh CDB: ${JSON.stringify(wazuhResult)}`);
  res.json({
    ok:      true,
    ip,
    wazuh:   wazuhResult,
    message: wazuhResult.ok
      ? `IP ${ip} añadida a lista CDB "blocked-ips" de Wazuh. Asegúrate de tener una regla activa que use esta lista para el bloqueo efectivo.`
      : `IP registrada localmente. Wazuh CDB: ${wazuhResult.error || 'no disponible'}. Bloquea manualmente en tu firewall.`,
  });
});

// ── Agent removal ─────────────────────────────────────────────────────────────
app.delete('/api/agents/:id', async (req, res) => {
  const id = String(req.params.id).replace(/[^0-9]/g, '');
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido' });
  try {
    const token = await getWazuhToken();
    const r = await httpsRequest(`${WAZUH_API}/agents?agents_list=${id}&status=all&older_than=0s`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (r.status === 200) {
      res.json({ ok: true, id });
    } else {
      res.json({ ok: false, error: `Wazuh: ${r.status} ${JSON.stringify(r.body)}` });
    }
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── Tickets ───────────────────────────────────────────────────────────────────
app.use('/api/tickets', ticketsRoutes);

// ── Agent enrollment ─────────────────────────────────────────────────────────
// ── User management + export (now under global auth guard) ───────────────────
app.use('/api/users', usersRoutes);
app.use('/api/export', exportRoutes);

// ── Agent enrollment ─────────────────────────────────────────────────────────
app.post('/api/agents/enroll', async (req, res) => {
  const { name, os = 'linux', group = 'default' } = req.body || {};
  if (!name) return res.json({ ok: false, error: 'Nombre requerido' });
  try {
    const token = await getWazuhToken();
    const r = await httpsRequest(`${WAZUH_API}/agents`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, ip: 'any' }),
    });
    if (r.status !== 200) return res.json({ ok: false, error: `Wazuh: ${r.status}` });
    const agentId = r.body?.data?.id;
    const keyRes = await httpsRequest(`${WAZUH_API}/agents/${agentId}/key`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const key = keyRes.body?.data?.affected_items?.[0]?.key || '';
    res.json({ ok: true, id: agentId, key, name });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── /api/vulns — real CVEs from Wazuh Vulnerability Detection module ─────────
// Optional ?agentId=XXX to filter by agent; omit for all agents (summary)
app.get('/api/vulns', async (req, res) => {
  const rawId = req.query.agentId ? String(req.query.agentId).replace(/[^0-9]/g, '') : null;
  try {
    const token = await getWazuhToken();

    // If specific agent requested, query that agent's vulns
    if (rawId) {
      const r = await httpsRequest(
        `${WAZUH_API}/vulnerability/${rawId}?limit=100&sort=-cvss3_score`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (r.status !== 200) return res.json({ ok: false, error: `Wazuh VD: ${r.status}`, vulns: [] });
      const items = r.body?.data?.affected_items || [];
      const vulns = items.map(v => ({
        cve:       v.cve || 'N/A',
        desc:      v.name || v.title || v.cve || '—',
        component: `${v.package?.name || '?'} ${v.package?.version || ''}`.trim(),
        cvss:      v.cvss3_score ?? v.cvss2_score ?? 0,
        affected:  1,
        patch:     v.condition === 'Package unfixed' ? 'sin-parche' : 'pendiente',
        severity:  v.severity || 'Unknown',
        agentId:   rawId,
      }));
      return res.json({ ok: true, vulns });
    }

    // No specific agent — aggregate across all active agents (top 5 most vulnerable)
    const agRes = await httpsRequest(
      `${WAZUH_API}/agents?status=active&limit=100&select=id`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    const agents = (agRes.body?.data?.affected_items || []).filter(a => a.id !== '000');

    // Collect CVEs across agents, deduplicate and count affected hosts
    const cveMap = new Map();
    await Promise.allSettled(agents.slice(0, 20).map(async a => {
      try {
        const r = await httpsRequest(
          `${WAZUH_API}/vulnerability/${a.id}?limit=100&sort=-cvss3_score`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        const items = r.body?.data?.affected_items || [];
        for (const v of items) {
          const cve = v.cve || 'N/A';
          if (!cveMap.has(cve)) {
            cveMap.set(cve, {
              cve,
              desc:      v.name || v.title || v.cve || '—',
              component: `${v.package?.name || '?'} ${v.package?.version || ''}`.trim(),
              cvss:      v.cvss3_score ?? v.cvss2_score ?? 0,
              affected:  0,
              patch:     v.condition === 'Package unfixed' ? 'sin-parche' : 'pendiente',
              severity:  v.severity || 'Unknown',
            });
          }
          cveMap.get(cve).affected++;
        }
      } catch { /* agent may not have VD enabled */ }
    }));

    const vulns = Array.from(cveMap.values())
      .sort((a, b) => b.cvss - a.cvss)
      .slice(0, 50);
    res.json({ ok: true, vulns });
  } catch (e) {
    res.json({ ok: false, error: e.message, vulns: [] });
  }
});

// ── /api/overview — all data needed by the Overview panel in one call ────────
app.get('/api/overview', async (req, res) => {
  const out = {
    kpis:         {},    // alerts24h, incidentsActive, criticalAlerts, mttd, mttr, agentsTotal, agentsOnline, agentsOffline
    criticalFeed: [],   // top 5 CRIT/HIGH alerts for the notification banner
    severityBreak: [],  // [{sev, count}] for severity breakdown KPI
    cowrieMini:   {},   // sessions24h, loginAttempts, uniqueIPs, malwareDownloads
    histogram:    [],   // 48 points × 30min buckets last 24h (event volume chart)
    networkMbps:  [],   // 48 random-walk points replaced with real values when available
  };

  // ── 1. Severity breakdown + alert count ──────────────────────────────────
  try {
    const sevRes = await osQuery('wazuh-alerts-*', {
      size: 0,
      query: { range: { timestamp: { gte: 'now-24h' } } },
      aggs: {
        by_level: {
          ranges: {
            field: 'rule.level',
            ranges: [
              { key: 'LOW',  from: 0,  to: 4  },
              { key: 'MED',  from: 4,  to: 7  },
              { key: 'HIGH', from: 7,  to: 10 },
              { key: 'CRIT', from: 10, to: 20 },
            ],
          },
        },
      },
    });
    const buckets = sevRes.aggregations?.by_level?.buckets || [];
    out.severityBreak = buckets.map(b => ({ sev: b.key, count: b.doc_count }));
    out.kpis.alerts24h = buckets.reduce((s, b) => s + b.doc_count, 0);
    out.kpis.criticalAlerts = (buckets.find(b => b.key === 'CRIT') || {}).doc_count || 0;
  } catch { out.kpis.alerts24h = null; }

  // ── 2. Event histogram — 48 × 30min buckets last 24h ─────────────────────
  try {
    const histRes = await osQuery('wazuh-alerts-*', {
      size: 0,
      query: { range: { timestamp: { gte: 'now-24h' } } },
      aggs: {
        over_time: {
          date_histogram: {
            field: 'rule.level',
            // Wazuh alertas doesn't have a numeric field per bucket; use timestamp
          },
        },
      },
    });
    // Fallback: proper date_histogram on timestamp
    const histRes2 = await osQuery('wazuh-alerts-*', {
      size: 0,
      query: { range: { timestamp: { gte: 'now-24h' } } },
      aggs: {
        over_time: {
          date_histogram: {
            field: 'timestamp',
            fixed_interval: '30m',
          },
        },
      },
    });
    out.histogram = (histRes2.aggregations?.over_time?.buckets || []).map(b => b.doc_count);
  } catch { out.histogram = []; }

  // ── 3. Critical alert feed ────────────────────────────────────────────────
  try {
    const critRes = await osQuery('wazuh-alerts-*', {
      size: 5,
      sort: [{ timestamp: { order: 'desc' } }],
      _source: ['timestamp', 'rule.level', 'rule.description', 'rule.id', 'agent.name', 'rule.mitre'],
      query: {
        bool: {
          must: [
            { range: { timestamp: { gte: 'now-24h' } } },
            { range: { 'rule.level': { gte: 10 } } },
          ],
        },
      },
    });
    out.criticalFeed = (critRes.hits?.hits || []).map(h => ({
      sev:   levelToSev(h._source.rule?.level || 0),
      time:  (h._source.timestamp || '').slice(11, 19),
      msg:   h._source.rule?.description || 'Unknown alert',
      rule:  String(h._source.rule?.id || '0'),
      agent: h._source.agent?.name || 'unknown',
      mitre: h._source.rule?.mitre?.id?.[0] || '',
    }));
  } catch { out.criticalFeed = []; }

  // ── 4. Agents online/offline ─────────────────────────────────────────────
  try {
    const token = await getWazuhToken();
    const agRes = await httpsRequest(
      `${WAZUH_API}/agents?limit=500&select=id,status`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    const agents = (agRes.body?.data?.affected_items || []).filter(a => a.id !== '000');
    out.kpis.agentsTotal   = agents.length;
    out.kpis.agentsOnline  = agents.filter(a => a.status === 'active').length;
    out.kpis.agentsOffline = agents.filter(a => a.status === 'disconnected').length;
  } catch {
    out.kpis.agentsTotal   = null;
    out.kpis.agentsOnline  = null;
    out.kpis.agentsOffline = null;
  }

  // ── 5. Cowrie mini-stats (sessions & logins last 24h) ────────────────────
  try {
    const [sessRes, loginRes, srcRes] = await Promise.allSettled([
      osQuery('wazuh-alerts-*', {
        size: 0,
        query: {
          bool: {
            must: [
              { term: { 'rule.groups': 'cowrie' } },
              { range: { timestamp: { gte: 'now-24h' } } },
            ],
          },
        },
      }),
      osQuery('wazuh-alerts-*', {
        size: 0,
        query: {
          bool: {
            must: [
              { term: { 'rule.groups': 'cowrie' } },
              { term: { 'rule.description': 'cowrie.login.failed' } },
              { range: { timestamp: { gte: 'now-24h' } } },
            ],
          },
        },
      }),
      osQuery('wazuh-alerts-*', {
        size: 0,
        query: {
          bool: {
            must: [
              { term: { 'rule.groups': 'cowrie' } },
              { range: { timestamp: { gte: 'now-24h' } } },
            ],
          },
        },
        aggs: { unique_ips: { cardinality: { field: 'data.src_ip' } } },
      }),
    ]);
    out.cowrieMini.sessions24h    = sessRes.status === 'fulfilled'  ? (sessRes.value.hits?.total?.value || 0)  : 0;
    out.cowrieMini.loginAttempts  = loginRes.status === 'fulfilled' ? (loginRes.value.hits?.total?.value || 0) : 0;
    out.cowrieMini.uniqueIPs      = srcRes.status === 'fulfilled'   ? (srcRes.value.aggregations?.unique_ips?.value || 0) : 0;
    // malware: cowrie.session.file_download
    try {
      const malRes = await osQuery('wazuh-alerts-*', {
        size: 0,
        query: {
          bool: {
            must: [
              { term: { 'rule.groups': 'cowrie' } },
              { match: { 'rule.description': 'file_download' } },
              { range: { timestamp: { gte: 'now-24h' } } },
            ],
          },
        },
      });
      out.cowrieMini.malwareDownloads = malRes.hits?.total?.value || 0;
    } catch { out.cowrieMini.malwareDownloads = 0; }
  } catch { out.cowrieMini = {}; }

  // ── 6. Open incidents from tickets DB ────────────────────────────────────
  try {
    const { db } = require('./db');
    const openTickets = db.prepare(
      `SELECT COUNT(*) as n FROM tickets WHERE status IN ('open','in_progress')`
    ).get();
    out.kpis.incidentsActive = openTickets?.n || 0;
  } catch { out.kpis.incidentsActive = null; }

  res.json(out);
});

// ── /api/metrics — MTTD / MTTR from real ticket data ────────────────────────
app.get('/api/metrics', (req, res) => {
  const { db } = require('./db');

  // MTTD: mean time from ticket creation to first status change (open → in_progress)
  // MTTR: mean time from creation to resolution (open → resolved/closed)
  // We use created_at and updated_at from tickets table
  try {
    const resolved = db.prepare(
      `SELECT created_at, updated_at FROM tickets
       WHERE status IN ('resolved','closed') AND updated_at IS NOT NULL`
    ).all();

    let mttr = null;
    if (resolved.length > 0) {
      const totalMs = resolved.reduce((sum, t) => {
        const open  = new Date(t.created_at).getTime();
        const close = new Date(t.updated_at).getTime();
        return sum + Math.max(0, close - open);
      }, 0);
      const avgMs = totalMs / resolved.length;
      const avgH  = avgMs / 3600000;
      mttr = avgH < 1
        ? `${Math.round(avgMs / 60000)} min`
        : `${avgH.toFixed(1)} h`;
    }

    // Open tickets age (proxy for MTTD — time unresolved)
    const open = db.prepare(
      `SELECT created_at FROM tickets WHERE status IN ('open','in_progress')`
    ).all();
    const now = Date.now();
    let mttd = null;
    if (open.length > 0) {
      const avgAgeMs = open.reduce((sum, t) => {
        return sum + Math.max(0, now - new Date(t.created_at).getTime());
      }, 0) / open.length;
      const avgAgeH = avgAgeMs / 3600000;
      mttd = avgAgeH < 1
        ? `${Math.round(avgAgeMs / 60000)} min`
        : `${avgAgeH.toFixed(1)} h`;
    }

    res.json({
      ok: true,
      mttr:          mttr || 'N/A',
      mttd:          mttd || 'N/A',
      resolvedCount: resolved.length,
      openCount:     open.length,
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── /api/mitre — MITRE ATT&CK heatmap desde alertas Wazuh ───────────────────
// Agrega tácticas y técnicas de los últimos 30 días desde OpenSearch
app.get('/api/mitre', async (req, res) => {
  try {
    const [tacRes, techRes] = await Promise.all([
      // Tactics aggregation
      osQuery('wazuh-alerts-*', {
        size: 0,
        query: {
          bool: {
            must: [
              { range:  { timestamp: { gte: 'now-30d' } } },
              { exists: { field: 'rule.mitre.tactic' } },
            ],
          },
        },
        aggs: {
          tactics: { terms: { field: 'rule.mitre.tactic', size: 20 } },
        },
      }),
      // Techniques aggregation
      osQuery('wazuh-alerts-*', {
        size: 0,
        query: {
          bool: {
            must: [
              { range:  { timestamp: { gte: 'now-30d' } } },
              { exists: { field: 'rule.mitre.id' } },
            ],
          },
        },
        aggs: {
          techniques: {
            terms: { field: 'rule.mitre.id', size: 30 },
            aggs: {
              tactic: { terms: { field: 'rule.mitre.tactic', size: 1 } },
              desc:   { terms: { field: 'rule.mitre.technique', size: 1 } },
            },
          },
        },
      }),
    ]);

    const tactics = (tacRes.aggregations?.tactics?.buckets || []).map(b => ({
      name:  b.key,
      count: b.doc_count,
    }));

    const techniques = (techRes.aggregations?.techniques?.buckets || []).map(b => ({
      id:     b.key,
      tactic: b.tactic?.buckets?.[0]?.key  || 'Unknown',
      desc:   b.desc?.buckets?.[0]?.key    || b.key,
      count:  b.doc_count,
    }));

    res.json({ ok: true, tactics, techniques });
  } catch (e) {
    res.json({ ok: false, error: e.message, tactics: [], techniques: [] });
  }
});

// ── AlienVault OTX — IOC feed (pulses + IP/domain enrichment) ────────────────
// Requires env var: OTX_API_KEY (free at otx.alienvault.com)
const otxIocCache = { data: null, ts: 0 };
const OTX_CACHE_TTL = 60 * 60 * 1000; // 1h

app.get('/api/iocs/feed', async (req, res) => {
  const OTX_KEY = process.env.OTX_API_KEY;
  if (!OTX_KEY) return res.json({ ok: false, error: 'OTX_API_KEY no configurada. Añádela al .env para IOCs reales.', iocs: [] });

  const now = Date.now();
  if (otxIocCache.data && (now - otxIocCache.ts) < OTX_CACHE_TTL) {
    return res.json({ ok: true, iocs: otxIocCache.data, cached: true });
  }

  try {
    // Get recent pulses from subscribed feeds (last 7 days)
    const r = await fetch(
      'https://otx.alienvault.com/api/v1/pulses/subscribed?modified_since=7d&limit=10',
      { headers: { 'X-OTX-API-KEY': OTX_KEY }, signal: AbortSignal.timeout(15000) }
    );
    if (!r.ok) return res.json({ ok: false, error: `OTX HTTP ${r.status}`, iocs: [] });

    const data = await r.json();
    const iocs = [];
    for (const pulse of (data.results || []).slice(0, 10)) {
      for (const ind of (pulse.indicators || []).slice(0, 20)) {
        const type = ind.type; // IPv4, domain, hostname, FileHash-MD5, URL, etc.
        if (!['IPv4','IPv6','domain','hostname','FileHash-MD5','FileHash-SHA256','URL'].includes(type)) continue;
        iocs.push({
          type:   type.startsWith('FileHash') ? 'HASH' : type.startsWith('IP') ? 'IP' : type === 'URL' ? 'URL' : 'DOMAIN',
          val:    ind.indicator,
          score:  pulse.TLP === 'red' ? 95 : pulse.TLP === 'amber' ? 75 : 60,
          source: `OTX · ${(pulse.name || '').slice(0, 40)}`,
          tags:   (pulse.tags || []).slice(0, 3).join(' · ') || pulse.description?.slice(0, 40) || '',
          pulse:  pulse.id,
        });
        if (iocs.length >= 50) break;
      }
      if (iocs.length >= 50) break;
    }

    otxIocCache.data = iocs;
    otxIocCache.ts   = now;
    res.json({ ok: true, iocs });
  } catch (e) {
    res.json({ ok: false, error: `OTX error: ${e.message}`, iocs: [] });
  }
});

// OTX — enrich a single indicator
app.post('/api/iocs/enrich', async (req, res) => {
  const OTX_KEY = process.env.OTX_API_KEY;
  if (!OTX_KEY) return res.json({ ok: false, error: 'OTX_API_KEY no configurada' });

  const { value, type } = req.body || {};
  if (!value || typeof value !== 'string' || value.length > 512) {
    return res.status(400).json({ ok: false, error: 'Valor inválido' });
  }

  const safeVal = encodeURIComponent(value.trim());
  let section;
  if (type === 'IP' || /^(\d{1,3}\.){3}\d{1,3}$/.test(value)) {
    section = `IPv4/${safeVal}/general`;
  } else if (type === 'HASH' || /^[a-fA-F0-9]{32,64}$/.test(value)) {
    section = `file/${safeVal}/general`;
  } else {
    section = `domain/${safeVal}/general`;
  }

  try {
    const r = await fetch(`https://otx.alienvault.com/api/v1/indicators/${section}`, {
      headers: { 'X-OTX-API-KEY': OTX_KEY },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return res.json({ ok: false, error: `OTX HTTP ${r.status}` });
    const d = await r.json();
    res.json({
      ok:          true,
      reputation:  d.reputation ?? 0,
      pulseCount:  d.pulse_info?.count ?? 0,
      malicious:   d.pulse_info?.count > 0,
      country:     d.country_name || 'N/A',
      asn:         d.asn || 'N/A',
      tags:        (d.pulse_info?.pulses || []).flatMap(p => p.tags || []).slice(0, 5).join(', ') || 'N/A',
      lastSeen:    (d.pulse_info?.pulses?.[0]?.modified || '').slice(0, 10) || 'N/A',
      permalink:   `https://otx.alienvault.com/indicator/${type === 'IP' ? 'ip' : type === 'HASH' ? 'file' : 'domain'}/${value}`,
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── Serve frontend static files ───────────────────────────────────────────────
const FRONTEND = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND));
// login.html is public; everything else redirects there if unauthenticated
app.get('*', (req, res) => res.sendFile(path.join(FRONTEND, 'index.html')));

app.listen(PORT, () => {
  console.log(`Valhalla SOC frontend → http://localhost:${PORT}`);
});
