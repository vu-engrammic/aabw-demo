const auth = require('./auth');

let sessionLivePersonaId = null;

function setSessionLivePersona(userId) {
  sessionLivePersonaId = userId || null;
}

function resolveLiveUser(personaId) {
  if (sessionLivePersonaId) {
    const persona = auth.loadPersonas().find((p) => p.userId === sessionLivePersonaId);
    if (persona) return persona;
  }
  if (personaId) {
    try {
      return auth.devLogin(personaId);
    } catch {
      // fall through
    }
  }
  const fallback = process.env.LIVE_DEFAULT_PERSONA || 'emp_maya';
  const persona = auth.loadPersonas().find((p) => p.userId === fallback);
  if (persona) return persona;
  return {
    userId: 'emp_maya',
    role: 'employee',
    department: 'Engineering',
    fullName: 'Maya Chen',
  };
}

module.exports = { setSessionLivePersona, resolveLiveUser, sessionLivePersonaId };
