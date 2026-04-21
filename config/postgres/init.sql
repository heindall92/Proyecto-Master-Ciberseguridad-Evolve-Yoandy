-- Valhalla SOC - minimal schema for demo

CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_ip INET NULL,
  attack_type TEXT NULL,
  payload JSONB NULL,
  raw_log JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_source_ip ON events (source_ip);
CREATE INDEX IF NOT EXISTS idx_events_attack_type ON events (attack_type);

CREATE TABLE IF NOT EXISTS alerts (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NULL REFERENCES events(id) ON DELETE SET NULL,
  severity TEXT NOT NULL,
  rule_id TEXT NULL,
  description TEXT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_alert JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts (severity);
CREATE INDEX IF NOT EXISTS idx_alerts_event_id ON alerts (event_id);

CREATE TABLE IF NOT EXISTS ai_analysis (
  id BIGSERIAL PRIMARY KEY,
  alert_id BIGINT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  attack_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  summary TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_response JSONB NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_analysis_alert_id ON ai_analysis (alert_id);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_created_at ON ai_analysis (created_at DESC);

