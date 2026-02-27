// knowledge.js — Pritam's living property brain.
// Everything Pritam knows about the property comes from WhatsApp messages
// sent by the owner (Pritesh). No config files needed.

const fs = require("fs");
const path = require("path");
const logger = require("./logger");

const KNOWLEDGE_PATH = path.join(__dirname, "../data/knowledge.json");

// ─── Default empty knowledge state ───────────────────────────────────────────
const DEFAULT_KNOWLEDGE = {
  // Core property facts — filled in by owner via WhatsApp
  facts: {},

  // Raw notes from owner messages (full history)
  ownerMessages: [],

  // Media links/captions shared by owner
  media: [],

  // Owner instructions about how to handle buyers
  instructions: [],

  // Last updated
  updatedAt: null
};

// ─── Load / Save ─────────────────────────────────────────────────────────────

function load() {
  if (!fs.existsSync(KNOWLEDGE_PATH)) {
    const dir = path.dirname(KNOWLEDGE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(KNOWLEDGE_PATH, JSON.stringify(DEFAULT_KNOWLEDGE, null, 2));
  }
  return JSON.parse(fs.readFileSync(KNOWLEDGE_PATH, "utf8"));
}

function save(knowledge) {
  knowledge.updatedAt = new Date().toISOString();
  fs.writeFileSync(KNOWLEDGE_PATH, JSON.stringify(knowledge, null, 2));
}

// ─── Add a raw owner message to the knowledge base ───────────────────────────

function addOwnerMessage(text, extractedFacts = {}) {
  const knowledge = load();

  // Store the raw message
  knowledge.ownerMessages.push({
    text,
    timestamp: new Date().toISOString()
  });

  // Merge extracted facts into the facts store
  // Newer info overwrites older info for the same key
  knowledge.facts = { ...knowledge.facts, ...extractedFacts };

  save(knowledge);
  return knowledge;
}

function addOwnerInstruction(instruction) {
  const knowledge = load();
  knowledge.instructions.push({
    instruction,
    timestamp: new Date().toISOString()
  });
  save(knowledge);
}

function addMedia(caption, type = "photo") {
  const knowledge = load();
  knowledge.media.push({ caption, type, timestamp: new Date().toISOString() });
  save(knowledge);
}

// ─── Build the knowledge block that goes into Pritam's system prompt ──────────

function buildKnowledgeBlock() {
  const knowledge = load();
  const { facts, ownerMessages, instructions, media } = knowledge;

  // If we have no knowledge yet, return a placeholder
  if (ownerMessages.length === 0 && Object.keys(facts).length === 0) {
    return `PROPERTY KNOWLEDGE:
No property details yet. You are still learning about the property from your owner Pritesh.
If a buyer asks details, say something like "Let me just confirm that detail with the owner, I'll get back to you shortly!" and use ESCALATE action.`;
  }

  // Build a clean knowledge block from extracted facts + all raw messages
  let block = `PROPERTY KNOWLEDGE (learned from your owner Pritesh via WhatsApp):\n\n`;

  // Structured facts first
  if (Object.keys(facts).length > 0) {
    block += `KNOWN FACTS:\n`;
    for (const [key, value] of Object.entries(facts)) {
      block += `- ${key}: ${value}\n`;
    }
    block += "\n";
  }

  // All raw owner messages (this gives Pritam full context)
  if (ownerMessages.length > 0) {
    block += `EVERYTHING OWNER TOLD YOU (use this to answer any buyer query):\n`;
    for (const msg of ownerMessages) {
      block += `• "${msg.text}"\n`;
    }
    block += "\n";
  }

  // Media
  if (media.length > 0) {
    block += `MEDIA AVAILABLE:\n`;
    for (const m of media) {
      block += `• ${m.type}: ${m.caption}\n`;
    }
    block += "\n";
  }

  // Special owner instructions
  if (instructions.length > 0) {
    block += `OWNER'S SPECIAL INSTRUCTIONS:\n`;
    for (const i of instructions) {
      block += `• ${i.instruction}\n`;
    }
    block += "\n";
  }

  block += `IMPORTANT: If a buyer asks something not covered above, use ESCALATE — don't make things up.`;

  return block;
}

function getKnowledge() {
  return load();
}

function isKnowledgeEmpty() {
  const k = load();
  return k.ownerMessages.length === 0 && Object.keys(k.facts).length === 0;
}

module.exports = {
  addOwnerMessage,
  addOwnerInstruction,
  addMedia,
  buildKnowledgeBlock,
  getKnowledge,
  isKnowledgeEmpty
};
