// agent.js — Pritam's brain. Powered by Claude.
// Property knowledge comes entirely from owner WhatsApp messages — no config files.
require("dotenv").config();
const Anthropic = require("@anthropic-ai/sdk");
const db = require("./db");
const { sendMessage } = require("./whatsapp");
const knowledge = require("./knowledge");
const logger = require("./logger");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const OWNER_PHONE = process.env.OWNER_PHONE;
const AGENT_NAME = process.env.AGENT_NAME || "Pritam";

// ─── System Prompt for BUYER conversations ────────────────────────────────────
function buildBuyerSystemPrompt(lead) {
  return `You are ${AGENT_NAME}, a property agent selling a flat in South Pune. You talk to potential buyers on WhatsApp.

YOUR PERSONALITY:
- Warm, genuine, conversational — like a knowledgeable friend, not a salesman
- Smart and patient — you listen carefully and respond to exactly what was said
- Light sense of humour when appropriate
- You build trust before going for the close

YOUR LANGUAGE RULES — MIRROR THE BUYER:
- Default language is always English — clear, friendly, conversational
- If the buyer writes in Hindi or Hinglish, switch to natural Hinglish for your reply
- If they switch back to English, you switch back too
- NEVER force Hindi/Hinglish on someone writing in English

${knowledge.buildKnowledgeBlock()}

YOUR GOALS (in priority order):
1. Build genuine connection first
2. Understand their needs — budget, timeline, family size, requirements
3. Present the flat naturally as a match for their needs
4. Get them to agree to a site visit — this is your main conversion goal
5. Qualify their budget gently during conversation

LEAD CONTEXT:
${lead ? `- Name: ${lead.name || "unknown"}
- Source: ${lead.source || "not specified"}
- Budget hint: ${lead.budget || "unknown"}
- Stage: ${lead.stage || "new"}
- Notes: ${lead.notes || "none"}` : "- New contact"}

RULES:
- Keep messages SHORT — 2-4 sentences max. WhatsApp, not email.
- If something isn't in your property knowledge, use ESCALATE — never make things up
- If buyer confirms appointment → use APPOINTMENT action

SPECIAL ACTIONS (add on new line at end of reply when needed):
[ESCALATE: {"reason": "what to ask owner", "urgency": "high/medium"}]
[APPOINTMENT: {"date": "date and time they said", "buyerName": "their name"}]
[QUALIFY: {"budget": "amount they mentioned", "timeline": "when they want to buy", "score": 1-10}]
[DEAD_LEAD: {"reason": "not interested / wrong budget / etc"}]

Today: ${new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`;
}

// ─── Claude prompt for understanding owner messages ───────────────────────────
const OWNER_LEARNING_SYSTEM = `You are an AI assistant helping Pritam (a property agent) learn about a flat from its owner Pritesh, who sends info via WhatsApp.

Classify the message and extract structured information. Return ONLY valid JSON, no markdown, no explanation:

{
  "type": "property_info" | "command" | "instruction" | "lead_info" | "media_info" | "other",
  "facts": {},
  "command": "status" | "leads" | "appointments" | null,
  "instruction": "string or null",
  "leadPhone": "phone or null",
  "leadInfo": {},
  "confirmationMessage": "short warm reply to owner confirming what you learned"
}

TYPE GUIDE:
- "property_info" — owner sharing flat details (price, size, location, amenities, age, floor, parking, etc.)
- "command" — asking for status/report/leads/appointments
- "instruction" — telling Pritam HOW to behave (e.g. don't go below X price, prioritize certain buyers)
- "lead_info" — info about a specific buyer
- "media_info" — describing photos/videos of the flat
- "other" — general chat, questions, anything else

FACT EXTRACTION EXAMPLES:
"Flat is 3BHK, 1400 sqft" → {"type": "3 BHK", "size": "1400 sq ft"}
"Price is 1.1 Cr, I can go till 1.05" → {"price": "1.1 Crore", "minimum_price": "1.05 Crore"}
"Society is Green Valley, Undri, near NIBM Road" → {"society": "Green Valley", "location": "Undri, South Pune", "nearby": "NIBM Road"}
"East facing, 7th floor, open view" → {"facing": "East", "floor": "7th", "view": "Open, no obstruction"}
"Amenities: pool, gym, security" → {"amenities": "Swimming pool, Gym, 24x7 Security"}
"3 years old flat, vastu compliant" → {"age": "3 years", "vastu": "Yes, Vastu compliant"}
"2 covered parking, modular kitchen, Italian marble" → {"parking": "2 covered", "kitchen": "Modular", "flooring": "Italian marble"}
"HDFC and SBI approved society" → {"loan": "HDFC and SBI approved, loans easily available"}
"Ready to move immediately" → {"possession": "Immediate, ready to move"}

The confirmationMessage must be warm, short, in the same language the owner used (English or Hinglish). Confirm what you've noted.`;

// ─── Parse special actions from Claude's reply ────────────────────────────────
function parseActions(text) {
  const actions = {};
  const clean = text
    .replace(/\[ESCALATE:\s*(\{[\s\S]*?\})\]/g, (_, json) => {
      try { actions.escalate = JSON.parse(json); } catch {}
      return "";
    })
    .replace(/\[APPOINTMENT:\s*(\{[\s\S]*?\})\]/g, (_, json) => {
      try { actions.appointment = JSON.parse(json); } catch {}
      return "";
    })
    .replace(/\[QUALIFY:\s*(\{[\s\S]*?\})\]/g, (_, json) => {
      try { actions.qualify = JSON.parse(json); } catch {}
      return "";
    })
    .replace(/\[DEAD_LEAD:\s*(\{[\s\S]*?\})\]/g, (_, json) => {
      try { actions.deadLead = JSON.parse(json); } catch {}
      return "";
    });
  return { message: clean.trim(), actions };
}

// ─── Handle incoming message from a BUYER ────────────────────────────────────
async function handleBuyerMessage(phone, text, buyerName) {
  logger.info(`📩 Buyer [${phone}] (${buyerName}): ${text}`);

  let lead = db.getLead(phone);
  if (!lead) {
    lead = db.upsertLead(phone, { name: buyerName || null, stage: "new", score: 50, source: "direct" });
  }
  if (buyerName && buyerName !== "Unknown" && !lead.name) {
    db.upsertLead(phone, { name: buyerName });
    lead = db.getLead(phone);
  }

  db.addMessage(phone, "user", text);
  const history = db.getConversation(phone);
  const messages = history.map(m => ({ role: m.role, content: m.content }));

  let reply;
  try {
    response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      system: buildBuyerSystemPrompt(lead),
      messages
    });
    reply = response.content[0].text;
  } catch (err) {
    logger.error("Claude API error:", err.message);
    reply = "Sorry, having a quick connectivity issue — I'll get back to you shortly!";
  }

  const { message, actions } = parseActions(reply);
  db.addMessage(phone, "assistant", message);
  await sendMessage(phone, message);

  if (actions.escalate) await handleEscalation(phone, lead, text, actions.escalate);
  if (actions.appointment) await handleAppointment(phone, lead, actions.appointment);
  if (actions.qualify) {
    const { budget, timeline, score } = actions.qualify;
    db.upsertLead(phone, {
      budget, timeline, score: score * 10,
      stage: score >= 7 ? "hot" : score >= 4 ? "warm" : "cold"
    });
  }
  if (actions.deadLead) {
    db.upsertLead(phone, { stage: "dead", deadReason: actions.deadLead.reason });
  }
}

// ─── Handle messages from OWNER (Pritesh) ────────────────────────────────────
async function handleOwnerMessage(text) {
  logger.info(`👑 Owner: ${text}`);

  let parsed;
  let response;
  try {
    response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      system: OWNER_LEARNING_SYSTEM,
      messages: [{ role: "user", content: text }]
    });

    const raw = response.content[0].text.trim()
      .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    parsed = JSON.parse(raw);
  } catch (err) {
    logger.error("Owner message parse error:", err.message, "RAW:", response?.content?.[0]?.text);
    await sendMessage(OWNER_PHONE, "Got it, noted! 🙏");
    return;
  }

  const { type, facts, command, instruction, leadPhone, leadInfo, confirmationMessage } = parsed;

  switch (type) {
    case "property_info": {
      knowledge.addOwnerMessage(text, facts || {});
      logger.info("🧠 Learned:", facts);
      await sendMessage(OWNER_PHONE, confirmationMessage);
      break;
    }
    case "instruction": {
      if (instruction) {
        knowledge.addOwnerInstruction(instruction);
        knowledge.addOwnerMessage(text, {});
      }
      await sendMessage(OWNER_PHONE, confirmationMessage);
      break;
    }
    case "command": {
      if (command === "status")        await sendDailyReport();
      else if (command === "leads")    await sendLeadSummary();
      else if (command === "appointments") await sendAppointmentList();
      else await sendMessage(OWNER_PHONE, confirmationMessage);
      break;
    }
    case "lead_info": {
      if (leadPhone && leadInfo && Object.keys(leadInfo).length) db.upsertLead(leadPhone, leadInfo);
      knowledge.addOwnerMessage(text, {});
      await sendMessage(OWNER_PHONE, confirmationMessage);
      break;
    }
    case "media_info": {
      knowledge.addMedia(text, "photo");
      knowledge.addOwnerMessage(text, {});
      await sendMessage(OWNER_PHONE, confirmationMessage);
      break;
    }
    default: {
      knowledge.addOwnerMessage(text, facts || {});
      await sendMessage(OWNER_PHONE, confirmationMessage || "Got it, noted! 🙏");
    }
  }
}

// ─── Escalate to owner ────────────────────────────────────────────────────────
async function handleEscalation(buyerPhone, lead, buyerMessage, escalation) {
  const leadName = lead?.name || buyerPhone;
  await sendMessage(OWNER_PHONE,
    `Hey Pritesh! 🙋 Need your input.\n\n👤 *${leadName}* (${buyerPhone})\nBudget: ${lead?.budget || "unknown"}\n\nThey asked: _"${buyerMessage}"_\n\n❓ ${escalation.reason}\n\nJust reply here and I'll handle it with them!`
  );
  db.addOwnerNote({ leadPhone: buyerPhone, leadName, reason: escalation.reason });
}

// ─── Book appointment ─────────────────────────────────────────────────────────
async function handleAppointment(buyerPhone, lead, apptData) {
  const appointment = {
    buyerPhone, buyerName: lead?.name || apptData.buyerName || buyerPhone,
    phone: buyerPhone, date: apptData.date, stage: "pending_confirmation"
  };
  db.addAppointment(appointment);
  db.upsertLead(buyerPhone, { stage: "appointment", appointmentDate: apptData.date });
  await sendMessage(OWNER_PHONE,
    `🎉 New appointment!\n\n👤 *${appointment.buyerName}*\n📱 ${buyerPhone}\n📅 ${apptData.date}\n\nWorks for you?`
  );
}

// ─── Owner-facing reports ─────────────────────────────────────────────────────
async function sendLeadSummary() {
  const leads = db.getAllLeads();
  await sendMessage(OWNER_PHONE,
    `Pipeline:\n🔥 Hot: ${leads.filter(l=>l.stage==="hot").length}\n🌡 Warm: ${leads.filter(l=>l.stage==="warm").length}\n📅 Appointments: ${leads.filter(l=>l.stage==="appointment").length}\n📁 Total: ${leads.length}`
  );
}

async function sendAppointmentList() {
  const appts = db.getAppointments();
  if (!appts.length) { await sendMessage(OWNER_PHONE, "No appointments yet — working on it! 💪"); return; }
  await sendMessage(OWNER_PHONE, `Upcoming visits:\n\n${appts.map(a=>`📅 ${a.date} — ${a.buyerName} (${a.phone})`).join("\n")}`);
}

async function sendDailyReport() {
  const leads = db.getAllLeads();
  const appts = db.getAppointments();
  const k = knowledge.getKnowledge();
  const byStage = (s) => leads.filter(l=>l.stage===s).length;
  const knowledgeStatus = knowledge.isKnowledgeEmpty()
    ? "⚠️ No property info yet — send me the flat details!"
    : `✅ ${k.ownerMessages.length} property info messages stored`;

  await sendMessage(OWNER_PHONE,
    `🏠 *Pritam's Daily Report*\n${new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"short"})}\n\nPipeline:\n🔥 Hot: ${byStage("hot")}\n🌡 Warm: ${byStage("warm")}\n💬 Contacted: ${byStage("contacted")}\n📅 Appointment: ${byStage("appointment")}\n📁 Total: ${leads.length}\n\n🧠 ${knowledgeStatus}`
  );
}

// ─── Cold outreach ────────────────────────────────────────────────────────────
async function startOutreach(lead) {
  logger.info(`🚀 Outreach to ${lead.phone}`);

  if (knowledge.isKnowledgeEmpty()) {
    await sendMessage(OWNER_PHONE,
      "Hey Pritesh, can't start outreach yet — you haven't told me about the property! Send me the flat details (price, size, location, amenities) and I'll be ready 🙏"
    );
    return false;
  }

  try {
    response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      system: buildBuyerSystemPrompt(lead),
      messages: [{
        role: "user",
        content: `Write the very first cold outreach WhatsApp message to this buyer.
Name: ${lead.name || "unknown"} | Found via: ${lead.source || "portal"} | Budget: ${lead.budget || "unknown"} | Area interest: ${lead.areaInterest || "South Pune"}
Rules: English only, 3-4 lines max, warm and natural, NOT a sales pitch, end with one question.`
      }]
    });

    const msg = response.content[0].text.trim();
    db.addMessage(lead.phone, "assistant", msg);
    const result = await sendMessage(lead.phone, msg);

    if (result.success) {
      db.upsertLead(lead.phone, { stage: "contacted", outreachSentToday: true, outreachDate: new Date().toISOString(), lastContactAt: new Date().toISOString() });
    }
    return result.success;
  } catch (err) {
    logger.error(`Outreach failed for ${lead.phone}: ${err.message}`);
    return false;
  }
}

module.exports = { handleBuyerMessage, handleOwnerMessage, startOutreach, sendDailyReport };
