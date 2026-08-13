const { neon } = require('@neondatabase/serverless');
const bcrypt = require('bcryptjs');

function sql() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  return neon(process.env.DATABASE_URL);
}

function publicUser(row) {
  return { id: row.id, username: row.username };
}

async function createUser(username, password) {
  const normalized = username.toLowerCase().trim();
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const rows = await sql()`INSERT INTO users (username, password_hash)
      VALUES (${normalized}, ${passwordHash}) RETURNING id, username`;
    return publicUser(rows[0]);
  } catch (error) {
    if (error.code === '23505') throw new Error('Username already exists');
    throw error;
  }
}

async function verifyUser(username, password) {
  const normalized = username.toLowerCase().trim();
  const rows = await sql()`SELECT id, username, password_hash FROM users WHERE username = ${normalized} LIMIT 1`;
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return null;
  return publicUser(user);
}

async function getAlertsForUser(userId) {
  return sql()`SELECT id, camera_name, created_at FROM alerts
    WHERE user_id = ${userId} ORDER BY created_at DESC`;
}

async function getAlertForUser(userId, alertId) {
  const rows = await sql()`SELECT id, blob_url, content_type FROM alerts
    WHERE id = ${alertId} AND user_id = ${userId} LIMIT 1`;
  return rows[0] || null;
}

async function addAlert(userId, cameraName, blobUrl, contentType) {
  const name = typeof cameraName === 'string' && cameraName.trim()
    ? cameraName.trim().slice(0, 64) : 'Unknown Camera';
  const rows = await sql()`INSERT INTO alerts (user_id, camera_name, blob_url, content_type)
    VALUES (${userId}, ${name}, ${blobUrl}, ${contentType})
    RETURNING id, camera_name, created_at`;
  return rows[0];
}

async function deleteAlert(userId, alertId) {
  const rows = await sql()`DELETE FROM alerts WHERE id = ${alertId} AND user_id = ${userId}
    RETURNING blob_url`;
  return rows[0] || null;
}

module.exports = { createUser, verifyUser, getAlertsForUser, getAlertForUser, addAlert, deleteAlert };
