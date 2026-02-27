// db.js — Simple JSON database for leads + conversations
const path = require("path");
const fs = require("fs");

const DB_PATH = path.join(__dirname, "../data/db.json");

// Ensure data dir and file exist
function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({
      leads: [],
      conversations: {},
      appointments: [],
      ownerNotes: [],
      dailyStats: []
    }, null, 2));
  }
}

function read() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function write(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ─── Leads ────────────────────────────────────────────────────────────────────

function getAllLeads() {
  return read().leads;
}

function getLead(phone) {
  const { leads } = read();
  return leads.find(l => l.phone === phone) || null;
}

function upsertLead(phone, updates) {
  const db = read();
  const idx = db.leads.findIndex(l => l.phone === phone);
  const now = new Date().toISOString();

  if (idx === -1) {
    db.leads.push({ phone, createdAt: now, updatedAt: now, ...updates });
  } else {
    db.leads[idx] = { ...db.leads[idx], ...updates, updatedAt: now };
  }
  write(db);
  return getLead(phone);
}

function getHotLeads(limit = 10) {
  const { leads } = read();
  return leads
    .filter(l => l.stage !== "dead" && l.stage !== "sold" && !l.outreachSentToday)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, limit);
}

function getTodayLeadsCount() {
  const { leads } = read();
  const today = new Date().toDateString();
  return leads.filter(l => l.outreachDate && new Date(l.outreachDate).toDateString() === today).length;
}

// ─── Conversations ────────────────────────────────────────────────────────────

function getConversation(phone) {
  const db = read();
  return db.conversations[phone] || [];
}

function addMessage(phone, role, text) {
  const db = read();
  if (!db.conversations[phone]) db.conversations[phone] = [];
  db.conversations[phone].push({
    role,            // "user" | "assistant"
    content: text,
    timestamp: new Date().toISOString()
  });
  // Keep last 40 messages per conversation to control token usage
  if (db.conversations[phone].length > 40) {
    db.conversations[phone] = db.conversations[phone].slice(-40);
  }
  write(db);
}

// ─── Appointments ─────────────────────────────────────────────────────────────

function addAppointment(appointment) {
  const db = read();
  db.appointments.push({ ...appointment, id: Date.now(), createdAt: new Date().toISOString() });
  write(db);
}

function getAppointments() {
  return read().appointments;
}

// ─── Owner Notes (when agent escalates to Pritesh) ───────────────────────────

function addOwnerNote(note) {
  const db = read();
  db.ownerNotes.push({ ...note, id: Date.now(), timestamp: new Date().toISOString() });
  write(db);
}

// ─── Daily Stats ──────────────────────────────────────────────────────────────

function recordDailyStat(stat) {
  const db = read();
  db.dailyStats.push({ ...stat, date: new Date().toISOString() });
  write(db);
}

module.exports = {
  getAllLeads, getLead, upsertLead, getHotLeads, getTodayLeadsCount,
  getConversation, addMessage,
  addAppointment, getAppointments,
  addOwnerNote, recordDailyStat
};
