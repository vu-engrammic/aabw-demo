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
  const fallback = process.env.LIVE_DEFAULT_PERSONA || 'u004';
  const persona = auth.loadPersonas().find((p) => p.userId === fallback);
  if (persona) return persona;
  return {
    userId: 'u004',
    role: 'employee',
    department: 'Engineering',
    departmentCode: 'ENG',
    fullName: 'Phạm Quốc Dũng',
  };
}

module.exports = { setSessionLivePersona, resolveLiveUser, sessionLivePersonaId };
