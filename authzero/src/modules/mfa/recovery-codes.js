import { query } from '#infra/database/pool.js';
import { keyedHash, recoveryCode } from '#infra/security/crypto.js';

const COUNT = 10;

export async function regenerate(userId, client) {
  await client.query(`DELETE FROM mfa_recovery_codes WHERE user_id = $1`, [userId]);
  const codes = Array.from({ length: COUNT }, recoveryCode);
  await client.query(`INSERT INTO mfa_recovery_codes (user_id, code_hash) SELECT $1, unnest($2::text[])`, [
    userId,
    codes.map(keyedHash),
  ]);
  return codes;
}

export const consume = async (userId, code) =>
  (
    await query(
      `UPDATE mfa_recovery_codes SET used_at = now() WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL`,
      [userId, keyedHash(code)],
    )
  ).rowCount === 1;

export const removeAll = (userId, client = { query }) =>
  client.query(`DELETE FROM mfa_recovery_codes WHERE user_id = $1`, [userId]);
