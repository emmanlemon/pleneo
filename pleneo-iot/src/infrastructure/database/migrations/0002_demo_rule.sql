INSERT INTO rules (name, description, device_type_id, metric, operator, threshold, severity, cooldown_seconds, created_by)
SELECT
  'Temperature above range',
  'Raises a warning when an environment sensor reports above 10 C.',
  id,
  'temperature',
  'gt',
  10,
  'warning',
  300,
  'migration'
FROM device_types
WHERE key = 'environment-sensor'
  AND NOT EXISTS (
    SELECT 1 FROM rules r WHERE r.device_type_id = device_types.id AND r.metric = 'temperature'
  );
