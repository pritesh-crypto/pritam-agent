// server.js — Main Express server for Pritam
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { parseIncomingWebhook, markRead, sanitizePhone } = require("./whatsapp");
const agent = require("./agent");
const db = require("./db");
const scraper = require("./scraper");
const logger = require("./logger");

// Load scheduler (registers all cron jobs)
require("./scheduler");

const app = express();
app.use(cors());
app.use(express.json());

const OWNER_PHONE = sanitizePhone(process.env.OWNER_PHONE || "");
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || "pritam_verify_2024";

// ─── WhatsApp Webhook Verification (Meta requires this on setup) ──────────────
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === WEBHOOK_VERIFY_TOKEN) {
    logger.info("✅ Webhook verified by Meta");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ─── Incoming WhatsApp Messages ───────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  // Acknowledge immediately (Meta requires <200ms response)
  res.sendStatus(200);

  try {
    const messages = parseIncomingWebhook(req.body);

    for (const msg of messages) {
      // Mark as read (blue ticks)
      markRead(msg.messageId);

      const senderPhone = sanitizePhone(msg.from);
      const isOwner = senderPhone === OWNER_PHONE;

      logger.info(`📩 ${isOwner ? "👑 OWNER" : "👤 Buyer"} [${senderPhone}]: ${msg.text}`);

      if (isOwner) {
        // Message from Pritesh — handle as owner command/guidance
        await agent.handleOwnerMessage(msg.text);
      } else {
        // Message from a buyer — run through Pritam AI
        await agent.handleBuyerMessage(senderPhone, msg.text, msg.name);
      }
    }
  } catch (err) {
    logger.error("Webhook error:", err.message, err.stack);
  }
});

// ─── Admin REST API ───────────────────────────────────────────────────────────

// Root
app.get("/", (req, res) => res.json({ status: "ok", agent: "Pritam" }));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", agent: "Pritam", time: new Date().toISOString() });
});

// Get all leads
app.get("/api/leads", (req, res) => {
  const leads = db.getAllLeads();
  res.json({ count: leads.length, leads });
});

// Add a manual lead
app.post("/api/leads", async (req, res) => {
  try {
    const lead = scraper.addManualLead(req.body);
    res.json({ success: true, lead });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Get conversation with a lead
app.get("/api/leads/:phone/conversation", (req, res) => {
  const conversation = db.getConversation(req.params.phone);
  res.json({ phone: req.params.phone, messages: conversation });
});

// Manually trigger outreach to a specific lead
app.post("/api/leads/:phone/outreach", async (req, res) => {
  const lead = db.getLead(req.params.phone);
  if (!lead) return res.status(404).json({ error: "Lead not found" });

  const success = await agent.startOutreach(lead);
  res.json({ success });
});

// Get all appointments
app.get("/api/appointments", (req, res) => {
  res.json({ appointments: db.getAppointments() });
});

// Trigger daily outreach manually (for testing)
app.post("/api/run-outreach", async (req, res) => {
  res.json({ message: "Outreach started" });
  const { runDailyOutreach } = require("./scheduler");
  await runDailyOutreach();
});

// Get stats
app.get("/api/stats", (req, res) => {
  const leads = db.getAllLeads();
  res.json({
    total: leads.length,
    byStage: {
      new: leads.filter(l => l.stage === "new").length,
      contacted: leads.filter(l => l.stage === "contacted").length,
      hot: leads.filter(l => l.stage === "hot").length,
      warm: leads.filter(l => l.stage === "warm").length,
      appointment: leads.filter(l => l.stage === "appointment").length,
      dead: leads.filter(l => l.stage === "dead").length,
    },
    appointments: db.getAppointments().length
  });
});

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
console.log("ENV PORT IS:", process.env.PORT);
app.listen(PORT, "0.0.0.0", () => {
  logger.info(`\n🏠 Pritam Property Agent is LIVE on port ${PORT}`);
  logger.info(`📡 Webhook URL: ${process.env.WEBHOOK_URL || `http://localhost:${PORT}`}/webhook`);
  logger.info(`👑 Owner phone: ${OWNER_PHONE}`);
  logger.info(`⏰ Daily outreach scheduled at 10:00 AM IST\n`);
});

module.exports = app;
