ALTER TABLE users DROP CONSTRAINT users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('invited', 'active', 'disabled'));

ALTER TABLE one_time_tokens DROP CONSTRAINT one_time_tokens_purpose_check;
ALTER TABLE one_time_tokens ADD CONSTRAINT one_time_tokens_purpose_check
  CHECK (purpose IN ('email_verify', 'password_reset', 'invite'));
