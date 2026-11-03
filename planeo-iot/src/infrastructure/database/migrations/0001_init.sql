CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE device_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  metrics JSONB NOT NULL DEFAULT '[]',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER device_types_updated_at BEFORE UPDATE ON device_types FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  device_type_id UUID NOT NULL REFERENCES device_types (id) ON DELETE RESTRICT,
  owner_id UUID NOT NULL,
  owner_email TEXT,
  status TEXT NOT NULL DEFAULT 'provisioning' CHECK (status IN ('provisioning', 'active', 'disabled')),
  connection_status TEXT NOT NULL DEFAULT 'unknown' CHECK (connection_status IN ('online', 'offline', 'unknown')),
  claim_code_hash TEXT,
  firmware TEXT,
  site TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  last_seen_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX devices_external_id_idx ON devices (lower(external_id)) WHERE deleted_at IS NULL;
CREATE INDEX devices_owner_idx ON devices (owner_id, id) WHERE deleted_at IS NULL;
CREATE INDEX devices_type_idx ON devices (device_type_id) WHERE deleted_at IS NULL;
CREATE INDEX devices_sweep_idx ON devices (last_seen_at) WHERE deleted_at IS NULL AND connection_status = 'online';
CREATE UNIQUE INDEX devices_claim_code_idx ON devices (claim_code_hash) WHERE claim_code_hash IS NOT NULL;
CREATE TRIGGER devices_updated_at BEFORE UPDATE ON devices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE device_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'primary',
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX device_credentials_device_idx ON device_credentials (device_id) WHERE revoked_at IS NULL;

CREATE TABLE device_state (
  device_id UUID PRIMARY KEY REFERENCES devices (id) ON DELETE CASCADE,
  desired JSONB NOT NULL DEFAULT '{}',
  reported JSONB NOT NULL DEFAULT '{}',
  desired_version INT NOT NULL DEFAULT 0,
  reported_version INT NOT NULL DEFAULT 0,
  desired_updated_at TIMESTAMPTZ,
  reported_updated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE telemetry (
  id BIGSERIAL PRIMARY KEY,
  device_id UUID NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX telemetry_dedupe_idx ON telemetry (device_id, metric, ts);
CREATE INDEX telemetry_series_idx ON telemetry (device_id, metric, ts DESC);
CREATE INDEX telemetry_retention_idx ON telemetry (ts);

CREATE TABLE commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dispatched', 'acknowledged', 'failed', 'expired', 'cancelled')),
  result JSONB,
  error TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  dispatched_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  issued_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX commands_pending_idx ON commands (device_id, created_at) WHERE status = 'pending';
CREATE INDEX commands_device_idx ON commands (device_id, created_at DESC);
CREATE INDEX commands_expiry_idx ON commands (expires_at) WHERE status IN ('pending', 'dispatched');
CREATE TRIGGER commands_updated_at BEFORE UPDATE ON commands FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  device_type_id UUID REFERENCES device_types (id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices (id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  operator TEXT NOT NULL CHECK (operator IN ('gt', 'gte', 'lt', 'lte', 'eq', 'neq')),
  threshold DOUBLE PRECISION NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  cooldown_seconds INT NOT NULL DEFAULT 300,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (device_type_id IS NOT NULL OR device_id IS NOT NULL)
);
CREATE INDEX rules_lookup_idx ON rules (metric) WHERE enabled;
CREATE TRIGGER rules_updated_at BEFORE UPDATE ON rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES rules (id) ON DELETE SET NULL,
  device_id UUID NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  threshold DOUBLE PRECISION NOT NULL,
  operator TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  message TEXT NOT NULL,
  raised_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  resolved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX alerts_device_idx ON alerts (device_id, raised_at DESC);
CREATE INDEX alerts_open_idx ON alerts (rule_id, device_id, raised_at DESC) WHERE status <> 'resolved';
CREATE TRIGGER alerts_updated_at BEFORE UPDATE ON alerts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE outbox_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  idempotency_key TEXT NOT NULL UNIQUE,
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  remote_event_id UUID,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX outbox_events_pending_idx ON outbox_events (next_attempt_at) WHERE published_at IS NULL;

INSERT INTO device_types (key, name, description, metrics) VALUES
  ('environment-sensor', 'Environment sensor', 'Temperature, humidity and battery reporting sensor',
   '[{"key":"temperature","unit":"C","min":-40,"max":85},{"key":"humidity","unit":"%","min":0,"max":100},{"key":"battery","unit":"%","min":0,"max":100}]'),
  ('energy-meter', 'Energy meter', 'Three phase energy meter',
   '[{"key":"voltage","unit":"V","min":0,"max":500},{"key":"current","unit":"A","min":0,"max":200},{"key":"power","unit":"W","min":0,"max":100000}]');
