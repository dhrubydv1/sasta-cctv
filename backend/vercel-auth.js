const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'sasta_session';
const MAX_AGE_SECONDS = 60 * 60 * 24;

function secret() {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters in Vercel');
  }
  return process.env.SESSION_SECRET;
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(value => {
    const index = value.indexOf('=');
    return index < 0 ? [] : [value.slice(0, index).trim(), decodeURIComponent(value.slice(index + 1).trim())];
  }).filter(pair => pair.length));
}

function getUser(req) {
  try {
    return jwt.verify(parseCookies(req.headers.cookie)[COOKIE_NAME], secret(), { algorithms: ['HS256'] });
  } catch (_) {
    return null;
  }
}

function setSession(res, user) {
  const token = jwt.sign({ id: user.id, username: user.username }, secret(), {
    algorithm: 'HS256', expiresIn: MAX_AGE_SECONDS
  });
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; Max-Age=${MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`);
}

function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
}

function requireAuth(req, res, next) {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = user;
  return next();
}

module.exports = { getUser, setSession, clearSession, requireAuth };
