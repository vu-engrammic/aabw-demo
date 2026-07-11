const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const USERS_PATH = path.join(__dirname, '..', '..', '..', 'seed', 'users.json');
const COOKIE_NAME = 'aabw_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function sessionSecret() {
  return process.env.SESSION_SECRET || process.env.WORKOS_COOKIE_PASSWORD || 'aabw-dev-session-secret';
}

function workosConfigured() {
  return Boolean(process.env.WORKOS_API_KEY && process.env.WORKOS_CLIENT_ID);
}

function loadPersonas() {
  try {
    return JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function publicUser(user) {
  if (!user) return null;
  return {
    userId: user.userId || user.user_id,
    fullName: user.fullName || user.full_name,
    email: user.email,
    role: user.role,
    department: user.department,
  };
}

function signSession(user) {
  const payload = {
    ...publicUser(user),
    exp: Date.now() + SESSION_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function readSession(cookieHeader) {
  if (!cookieHeader) return null;
  const match = String(cookieHeader).match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  const raw = match[1];
  const [body, sig] = raw.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  if (sig !== expected) return null;
  try {
    const user = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (user.exp && user.exp < Date.now()) return null;
    return user;
  } catch {
    return null;
  }
}

function setSessionCookie(res, user) {
  const token = signSession(user);
  res.setHeader(
    'set-cookie',
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    'set-cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  );
}

function getWorkOS() {
  if (!workosConfigured()) return null;
  try {
    const { WorkOS } = require('@workos-inc/node');
    return new WorkOS(process.env.WORKOS_API_KEY);
  } catch {
    return null;
  }
}

function mapWorkOSUser(profile) {
  const groups = profile.groups || profile.groupNames || [];
  const groupSlugs = groups.map((g) => (typeof g === 'string' ? g : g.slug || g.name || '')).map((s) => s.toLowerCase());

  let role = 'employee';
  const execGroup = (process.env.WORKOS_GROUP_EXECUTIVE || 'org-memory-executives').toLowerCase();
  const mgrGroup = (process.env.WORKOS_GROUP_MANAGER || 'org-memory-managers').toLowerCase();
  const dirGroup = (process.env.WORKOS_GROUP_DIRECTOR || 'org-memory-directors').toLowerCase();

  if (groupSlugs.some((g) => g.includes(execGroup) || g.includes('executive'))) role = 'executive';
  else if (groupSlugs.some((g) => g.includes(dirGroup) || g.includes('director'))) role = 'director';
  else if (groupSlugs.some((g) => g.includes(mgrGroup) || g.includes('manager'))) role = 'manager';

  const deptFromGroup = groupSlugs.find((g) => g.startsWith('dept-'));
  const department = deptFromGroup
    ? deptFromGroup.replace(/^dept-/, '').replace(/-/g, ' ')
    : profile.department || 'Company';

  return {
    userId: profile.id || profile.userId,
    fullName: [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.email,
    email: profile.email,
    role,
    department: department.charAt(0).toUpperCase() + department.slice(1),
    authProvider: 'workos',
  };
}

function authorizationUrl() {
  const workos = getWorkOS();
  if (!workos) throw new Error('WorkOS is not configured');
  return workos.userManagement.getAuthorizationUrl({
    provider: 'authkit',
    clientId: process.env.WORKOS_CLIENT_ID,
    redirectUri: process.env.WORKOS_REDIRECT_URI || 'http://127.0.0.1:5173/api/auth/callback',
  });
}

async function authenticateCode(code) {
  const workos = getWorkOS();
  if (!workos) throw new Error('WorkOS is not configured');
  const result = await workos.userManagement.authenticateWithCode({
    clientId: process.env.WORKOS_CLIENT_ID,
    code,
  });
  return mapWorkOSUser(result.user || result.profile || result);
}

function devLogin(personaId) {
  const persona = loadPersonas().find((p) => p.userId === personaId);
  if (!persona) throw new Error('Unknown persona');
  return { ...persona, authProvider: 'dev' };
}

module.exports = {
  COOKIE_NAME,
  workosConfigured,
  loadPersonas,
  publicUser,
  readSession,
  setSessionCookie,
  clearSessionCookie,
  authorizationUrl,
  authenticateCode,
  devLogin,
};
