const fs = require('fs');
const path = require('path');

// Keep registration persistence isolated so this storage can be replaced later.
const dataDirectory = path.join(__dirname, 'data');
const registrationsFile = path.join(dataDirectory, 'program-registrations.json');

function readRegistrations() {
  try {
    const value = JSON.parse(fs.readFileSync(registrationsFile, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function writeRegistrations(registrations) {
  fs.mkdirSync(dataDirectory, { recursive: true });
  const temporary = `${registrationsFile}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(registrations, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, registrationsFile);
}

function listRegistrations(programId = '') {
  return readRegistrations()
    .filter(item => !programId || item.programId === programId)
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}

function createRegistration(registration) {
  const registrations = readRegistrations();
  const duplicate = registrations.some(item => item.programId === registration.programId
    && String(item.email || '').toLowerCase() === registration.email.toLowerCase());
  if (duplicate) return { duplicate: true };
  registrations.unshift(registration);
  writeRegistrations(registrations);
  return { registration };
}

function deleteRegistration(id) {
  const registrations = readRegistrations();
  const remaining = registrations.filter(item => item.id !== id);
  if (remaining.length === registrations.length) return false;
  writeRegistrations(remaining);
  return true;
}

module.exports = { listRegistrations, createRegistration, deleteRegistration };
