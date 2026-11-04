ALTER TABLE devices ADD COLUMN project_id UUID;
CREATE INDEX devices_project_idx ON devices (project_id, id) WHERE deleted_at IS NULL AND project_id IS NOT NULL;

CREATE TABLE processed_webhooks (
  event_id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
