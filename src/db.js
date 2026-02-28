const { MongoClient } = require("mongodb");
const logger = require("./logger");

const MONGODB_URL = process.env.MONGODB_URL;
let db;

async function getDb() {
  if (!db) {
    const client = new MongoClient(MONGODB_URL);
    await client.connect();
    db = client.db("pritam");
    logger.info("✅ MongoDB connected");
  }
  return db;
}

async function getLead(phone) {
  const db = await getDb();
  return db.collection("leads").findOne({ phone });
}

async function upsertLead(phone, data) {
  const db = await getDb();
  await db.collection("leads").updateOne(
    { phone },
    { $set: { ...data, phone, updatedAt: new Date().toISOString() }, $setOnInsert: { createdAt: new Date().toISOString() } },
    { upsert: true }
  );
  return getLead(phone);
}

async function getAllLeads() {
  const db = await getDb();
  return db.collection("leads").find().toArray();
}

async function addMessage(phone, role, content) {
  const db = await getDb();
  await db.collection("messages").insertOne({ phone, role, content, createdAt: new Date().toISOString() });
}

async function getConversation(phone) {
  const db = await getDb();
  return db.collection("messages").find({ phone }).sort({ createdAt: 1 }).limit(20).toArray();
}

async function addAppointment(data) {
  const db = await getDb();
  await db.collection("appointments").insertOne({ ...data

cat > src/knowledge.js << 'EOF'
const { MongoClient } = require("mongodb");
const logger = require("./logger");

const MONGODB_URL = process.env.MONGODB_URL;
let db;

async function getDb() {
  if (!db) {
    const client = new MongoClient(MONGODB_URL);
    await client.connect();
    db = client.db("pritam");
  }
  return db;
}

async function getKnowledge() {
  const db = await getDb();
  const doc = await db.collection("knowledge").findOne({ _id: "main" });
  return doc || { facts: {}, ownerMessages: [], media: [], instructions: [] };
}

async function saveKnowledge(k) {
  const db = await getDb();
  await db.collection("knowledge").updateOne(
    { _id: "main" },
    { $set: { ...k, updatedAt: new Date().toISOString() } },
    { upsert: true }
  );
}

async function addOwnerMessage(text, facts) {
  const k = await getKnowledge();
  k.facts = { ...k.facts, ...facts };
  k.ownerMessages = k.ownerMessages || [];
  k.ownerMessages.push({ text, facts, at: new Date().toISOString() });
  await saveKnowledge(k);
}

async function addOwnerInstruction(instruction) {
  const k = await getKnowledge();
  k.instructions = k.instructions || [];
  k.instructions.push(instruction);
  await saveKnowledge(k);
}

async function addMedia(text, type) {
  const k = await getKnowledge();
  k.media = k.media || [];
  k.media.push({ text, type, at: new Date().toISOString() });
  await saveKnowledge(k);
}

async function isKnowledgeEmpty() {
  const k = await getKnowledge();
  return !k.ownerMessages || k.ownerMessages.length === 0;
}

async function buildKnowledgeBlock() {
  const k = await getKnowledge();
  if (!k.ownerMessages || k.ownerMessages.length === 0) {
    return "PROPERTY KNOWLEDGE: Not yet provided. Ask owner for details.";
  }
  const facts = Object.entries(k.facts || {}).map(([key, val]) => `- ${key}: ${val}`).join("\n");
  const instructions = (k.instructions || []).map(i => `- ${i}`).join("\n");
  return `PROPERTY KNOWLEDGE:\n${facts}\n\nOWNER INSTRUCTIONS:\n${instructions || "None yet"}`;
}

module.exports = { getKnowledge, addOwnerMessage, addOwnerInstruction, addMedia, isKnowledgeEmpty, buildKnowledgeBlock };
