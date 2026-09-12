/**
 * lib/auth.js
 * ------------------------------------------------------------------
 * Autenticação e sessão do ADM CONFIG. Sem dependências externas:
 * - Hash de senha: crypto.scrypt (nativo do Node, padrão moderno
 *   recomendado pela OWASP, equivalente em segurança ao bcrypt).
 * - Sessão: token aleatório (crypto.randomBytes) guardado em memória
 *   no servidor e entregue ao navegador como cookie HttpOnly.
 * - Rate limiting de login: contador em memória por IP.
 * ------------------------------------------------------------------
 */
const crypto = require('crypto');

const SESSION_COOKIE_NAME = 'zezao_admin_session';
const SESSION_DURATION_MS = 4 * 60 * 60 * 1000; // 4 horas de sessão absoluta
const IDLE_TIMEOUT_MS = 45 * 60 * 1000;         // 45 min sem atividade expira a sessão

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutos

const sessions = new Map();       // token -> { username, createdAt, lastSeenAt }
const loginAttempts = new Map();  // ip -> [timestamps]

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(plain, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hashHex] = stored.split(':');
  const candidate = crypto.scryptSync(plain, salt, 64);
  const stored_ = Buffer.from(hashHex, 'hex');
  if (candidate.length !== stored_.length) return false;
  return crypto.timingSafeEqual(candidate, stored_);
}

function isRateLimited(ip) {
  const now = Date.now();
  const attempts = (loginAttempts.get(ip) || []).filter(t => now - t < LOGIN_WINDOW_MS);
  loginAttempts.set(ip, attempts);
  return attempts.length >= LOGIN_MAX_ATTEMPTS;
}

function recordFailedAttempt(ip) {
  const now = Date.now();
  const attempts = (loginAttempts.get(ip) || []).filter(t => now - t < LOGIN_WINDOW_MS);
  attempts.push(now);
  loginAttempts.set(ip, attempts);
}

function clearAttempts(ip) {
  loginAttempts.delete(ip);
}

function createSession(username) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  sessions.set(token, { username, createdAt: now, lastSeenAt: now });
  return token;
}

/** Valida o token, checa expiração absoluta e por inatividade, e renova lastSeenAt. */
function getSession(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  const now = Date.now();
  if (now - session.createdAt > SESSION_DURATION_MS) {
    sessions.delete(token);
    return null;
  }
  if (now - session.lastSeenAt > IDLE_TIMEOUT_MS) {
    sessions.delete(token);
    return null;
  }
  session.lastSeenAt = now;
  return session;
}

function destroySession(token) {
  sessions.delete(token);
}

function destroyAllSessionsForUser(username) {
  for (const [token, session] of sessions.entries()) {
    if (session.username === username) sessions.delete(token);
  }
}

function countActiveSessions(username) {
  let count = 0;
  for (const session of sessions.values()) {
    if (session.username === username) count++;
  }
  return count;
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  });
  return out;
}

function buildSessionCookie(token, { secure }) {
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_DURATION_MS / 1000)}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function buildClearCookie({ secure }) {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

module.exports = {
  SESSION_COOKIE_NAME,
  hashPassword,
  verifyPassword,
  isRateLimited,
  recordFailedAttempt,
  clearAttempts,
  createSession,
  getSession,
  destroySession,
  destroyAllSessionsForUser,
  countActiveSessions,
  parseCookies,
  buildSessionCookie,
  buildClearCookie,
};
