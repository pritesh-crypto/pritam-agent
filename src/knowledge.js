const { MongoClient } = require("mongodb");
const logger = require("./logger");

let db;

async function getDb() {
  if (!db) {
    const client = new MongoClient(process.env.MONGODB_URL);
    await client.connect();
    db = client.db("pritam");
  }
  return db;
}

async function getKnowledge() {
  const d = await getDb();
  const doc = await d.collection("knowledge").findOne({ _id: "main" });
  return doc || { facts: {}, ownerMessages: [], media: [], instructions: [] };
}

async function saveKnowledge(k) {
  const d = await getDb();
  await d.collection("knowledge").updateOne(
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
    return "PROPERTY KNOWLEDGE: Not yet provided.";
  }
  const facts = Object.entries(k.facts || {}).map(([key, val]) => `- ${key}: ${val}`).join("\n");
  const instructions = (k.instructions || []).map(i => `- ${i}`).join("\n");
  return `PROPERTY KNOWLEDGE:\n${facts}\n\nOWNER INSTRUCTIONS:\n${instructions || "None yet"}`;
}

module.exports = { getKnowledge, addOwnerMessage, addOwnerInstruction, addMedia, isKnowledgeEmpty, buildKnowledgeBlock };
