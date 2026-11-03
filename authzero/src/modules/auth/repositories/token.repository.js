import { query } from '#infra/database/pool.js';
import { randomToken, sha256 } from '#infra/security/crypto.js';

export async function issue({ userId, purpose, ttlMinutes }, client = { query }) {
  const token = randomToken(32);
  await client.query(
    `UPDATE one_time_tokens SET used_at = now() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`,
    [userId, purpose],
  );
  await client.query(
    `INSERT INTO one_time_tokens (user_id, purpose, token_hash, expires_at) VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
    [userId, purpose, sha256(token), String(ttlMinutes)],
  );
  return token;
}

export const consume = async ({ token, purpose }, client) =>
  (
    await client.query(
      `UPDATE one_time_tokens SET used_at = now()
        WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now() RETURNING user_id`,
      [sha256(token), purpose],
    )
  ).rows[0]?.user_id ?? null;

export const deleteExpired = () =>
  query(
    `DELETE FROM one_time_tokens WHERE expires_at < now() - interval '1 day' OR used_at < now() - interval '1 day'`,
  );
