const { MongoClient } = require("mongodb");
const logger = require("./logger");

let db;

async function getDb() {
  if (!db) {
    const client = new MongoClient(process.env.MONGODB_URL);
    await client.connect();
    db = client.db("pritam");
    logger.info("✅ MongoDB connected");
  }
  return db;
}

async function getLead(phone) {
  const d = await getDb();
  return d.collection("leads").findOne({ phone });
}

async function upsertLead(phone, data) {
  const d = await getDb();
  await d.collection("leads").updateOne(
    { phone },
    { $set: { ...data, phone, updatedAt: new Date().toISOString() }, $setOnInsert: { createdAt: new Date().toISOString() } },
    { upsert: true }
  );
  return getLead(phone);
}

async function getAllLeads() {
  const d = await getDb();
  return d.collection("leads").find().toArray();
}

async function addMessage(phone, role, content) {
  const d = await getDb();
  await d.collection("messages").insertOne({ phone, role, content, createdAt: new Date().toISOString() });
}

async function getConversation(phone) {
  const d = await getDb();
  return d.collection("messages").find({ phone }).sort({ createdAt: 1 }).limit(20).toArray();
}

async function addAppointment(data) {
  const d = await getDb();
  await d.collection("appointments").insertOne({ ...data, createdAt: new Date().toISOString() });
}

async function getAppointments() {
  const d = await getDb();
  return d.collection("appointments").find().toArray();
}

async function addOwnerNote(data) {
  const d = await getDb();
  await d.collection("owner_notes").insertOne({ ...data, createdAt: new Date().toISOString() });
}

module.exports = { getLead, upsertLead, getAllLeads, addMessage, getConversation, addAppointment, getAppointments, addOwnerNote };
