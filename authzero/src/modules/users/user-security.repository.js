import { query } from '#infra/database/pool.js';

export const recordFailedLogin = async (userId, maxAttempts, lockoutMinutes) =>
  (
    await query(
      `UPDATE users
          SET failed_login_attempts = failed_login_attempts + 1,
              locked_until = CASE WHEN failed_login_attempts + 1 >= $2
                                  THEN now() + ($3 || ' minutes')::interval ELSE locked_until END
        WHERE id = $1
        RETURNING failed_login_attempts, locked_until`,
      [userId, maxAttempts, String(lockoutMinutes)],
    )
  ).rows[0];

export const recordSuccessfulLogin = (userId, client = { query }) =>
  client.query(`UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1`, [
    userId,
  ]);

export const unlock = (userId) =>
  query(`UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1`, [userId]);

export const setStatus = (userId, status) => query(`UPDATE users SET status = $2 WHERE id = $1`, [userId, status]);

export const updatePasswordHash = (userId, hash, client = { query }) =>
  client.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [userId, hash]);

export const getPasswordHistory = async (userId, limit, client = { query }) =>
  (
    await client.query(
      `SELECT password_hash FROM password_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit],
    )
  ).rows;

export async function rotatePassword({ userId, previousHash, newHash, historySize }, client) {
  await client.query(`INSERT INTO password_history (user_id, password_hash) VALUES ($1, $2)`, [userId, previousHash]);
  await client.query(
    `DELETE FROM password_history WHERE user_id = $1 AND id NOT IN (
       SELECT id FROM password_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2)`,
    [userId, historySize],
  );
  await client.query(
    `UPDATE users SET password_hash = $2, password_changed_at = now(), failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
    [userId, newHash],
  );
}
