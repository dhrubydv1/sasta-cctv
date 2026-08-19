const express = require('express');
const crypto = require('crypto');
const { put, get, del } = require('@vercel/blob');
const db = require('../backend/vercel-db');
const auth = require('../backend/vercel-auth');
const realtime = require('../backend/realtime');

const app = express();
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

app.disable('x-powered-by');
app.use(express.json({ limit: '3mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

const validCredentials = (username, password) => username && password && username.length >= 3 && password.length >= 6;
const alertResponse = alert => ({
  id: alert.id,
  cameraName: alert.camera_name,
  timestamp: alert.created_at,
  imagePath: `/api/alerts/${encodeURIComponent(alert.id)}/image`
});

app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!validCredentials(username, password)) return res.status(400).json({ error: 'Username must be at least 3 characters and password at least 6 characters' });
  try {
    const user = await db.createUser(username, password);
    auth.setSession(res, user);
    return res.status(201).json({ success: true, user });
  } catch (error) {
    return res.status(error.message === 'Username already exists' ? 409 : 500).json({ error: error.message === 'Username already exists' ? error.message : 'Unable to create account' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
  try {
    const user = await db.verifyUser(username, password);
    if (!user) return res.status(401).json({ error: 'Invalid username or password' });
    auth.setSession(res, user);
    return res.json({ success: true, user });
  } catch (_) {
    return res.status(500).json({ error: 'Unable to sign in' });
  }
});

app.post('/api/auth/logout', (_req, res) => {
  try {
    auth.clearSession(res);
  } catch (error) {
    console.error('Logout error:', error);
  }
  res.json({ success: true });
});
app.get('/api/auth/session', (req, res) => {
  const user = auth.getUser(req);
  return res.json(user ? { loggedIn: true, user: { id: user.id, username: user.username } } : { loggedIn: false });
});

app.get('/api/realtime-token', auth.requireAuth, async (req, res) => {
  try { return res.json(await realtime.createTokenRequest(req.user.id)); }
  catch (error) { console.error('Ably token error:', error); return res.status(503).json({ error: 'Realtime service unavailable' }); }
});

app.get('/api/devices/active-cameras', auth.requireAuth, async (req, res) => {
  try {
    const cameras = await realtime.getActiveCameras(req.user.id);
    res.json({ count: cameras.length, cameras });
  } catch (error) {
    console.error('Camera presence error:', error);
    res.status(503).json({ error: 'Realtime service unavailable' });
  }
});

app.get('/api/alerts', auth.requireAuth, async (req, res) => {
  try { res.json({ alerts: (await db.getAlertsForUser(req.user.id)).map(alertResponse) }); }
  catch (error) { console.error('Alert list error:', error); res.status(500).json({ error: 'Unable to load alerts' }); }
});

app.post('/api/alerts/upload', auth.requireAuth, async (req, res) => {
  const { cameraName, image } = req.body || {};
  const match = typeof image === 'string' && image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return res.status(400).json({ error: 'Only JPEG, PNG, and WebP image uploads are supported' });
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return res.status(400).json({ error: 'Image must be between 1 byte and 2 MB' });
  const extension = match[1] === 'jpeg' ? 'jpg' : match[1];
  const contentType = `image/${match[1]}`;
  try {
    const blob = await put(`alerts/${req.user.id}/${crypto.randomUUID()}.${extension}`, buffer, { access: 'private', contentType, addRandomSuffix: false });
    const stored = await db.addAlert(req.user.id, cameraName, blob.url, contentType);
    const alert = alertResponse(stored);
    await realtime.publishMotionAlert(req.user.id, alert);
    return res.status(201).json({ success: true, alert });
  } catch (error) {
    console.error('Alert upload error:', error);
    return res.status(500).json({ error: 'Unable to save alert' });
  }
});

app.get('/api/alerts/:id/image', auth.requireAuth, async (req, res) => {
  try {
    const alert = await db.getAlertForUser(req.user.id, req.params.id);
    if (!alert) return res.status(404).json({ error: 'Alert image not found' });
    const result = await get(alert.blob_url, { access: 'private' });
    if (!result) return res.status(404).json({ error: 'Alert image not found' });
    res.setHeader('Content-Type', alert.content_type);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.end(Buffer.from(await new Response(result.stream).arrayBuffer()));
  } catch (error) {
    console.error('Alert image error:', error);
    return res.status(500).json({ error: 'Unable to load alert image' });
  }
});

app.delete('/api/alerts/:id', auth.requireAuth, async (req, res) => {
  try {
    const alert = await db.deleteAlert(req.user.id, req.params.id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    await del(alert.blob_url);
    return res.json({ success: true });
  } catch (error) {
    console.error('Alert delete error:', error);
    return res.status(500).json({ error: 'Unable to delete alert' });
  }
});

module.exports = app;
