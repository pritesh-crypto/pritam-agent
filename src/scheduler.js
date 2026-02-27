// scheduler.js — Runs Pritam's daily routine automatically
require("dotenv").config();
const cron = require("node-cron");
const db = require("./db");
const agent = require("./agent");
const scraper = require("./scraper");
const { sendMessage } = require("./whatsapp");
const logger = require("./logger");

const OWNER_PHONE = process.env.OWNER_PHONE;
const DAILY_LEAD_TARGET = parseInt(process.env.DAILY_LEAD_TARGET) || 10;

/**
 * DAILY ROUTINE:
 * 08:30 AM — Scrape new leads from portals
 * 10:00 AM — Start outreach to top 10 hot leads
 * 06:00 PM — Send follow-ups to non-responsive leads
 * 08:00 PM — Daily summary report to owner
 */

// ─── 08:30 AM: Morning lead scrape ──────────────────────────────────────────
cron.schedule("30 8 * * *", async () => {
  logger.info("⏰ 08:30 AM — Starting morning lead scrape");
  try {
    const newLeads = await scraper.runDailyScrape();
    if (newLeads > 0) {
      await sendMessage(OWNER_PHONE,
        `Good morning Pritesh! 🌅\n\nI found ${newLeads} new leads this morning from portals and social media. Starting outreach at 10 AM. 🚀`
      );
    }
  } catch (err) {
    logger.error("Morning scrape failed:", err.message);
  }
}, { timezone: "Asia/Kolkata" });

// ─── 10:00 AM: Daily outreach to hot leads ───────────────────────────────────
cron.schedule("0 10 * * *", async () => {
  logger.info("⏰ 10:00 AM — Starting daily outreach");
  await runDailyOutreach();
}, { timezone: "Asia/Kolkata" });

// ─── 06:00 PM: Follow up with silent leads ────────────────────────────────────
cron.schedule("0 18 * * *", async () => {
  logger.info("⏰ 06:00 PM — Running evening follow-ups");
  await runEveningFollowUp();
}, { timezone: "Asia/Kolkata" });

// ─── 08:00 PM: Daily report to owner ─────────────────────────────────────────
cron.schedule("0 20 * * *", async () => {
  logger.info("⏰ 08:00 PM — Sending daily report to owner");
  await agent.sendDailyReport();
}, { timezone: "Asia/Kolkata" });

// ─── Outreach function ────────────────────────────────────────────────────────
async function runDailyOutreach() {
  const alreadySentToday = db.getTodayLeadsCount();
  const remaining = DAILY_LEAD_TARGET - alreadySentToday;

  if (remaining <= 0) {
    logger.info("Daily outreach target already met");
    return;
  }

  // Get top N hot leads not yet contacted today
  const hotLeads = db.getHotLeads(remaining);

  if (hotLeads.length === 0) {
    logger.info("No leads available for outreach today");
    await sendMessage(OWNER_PHONE,
      `Pritesh, I don't have enough leads in the pipeline today to reach the target of ${DAILY_LEAD_TARGET}. Could you add some leads manually? I can also try scraping more sources. 🙏`
    );
    return;
  }

  logger.info(`📱 Starting outreach to ${hotLeads.length} leads...`);

  let successCount = 0;
  let failCount = 0;

  for (const lead of hotLeads) {
    // Stagger messages — don't blast all at once (WhatsApp may rate limit)
    await sleep(getRandomDelay(30000, 90000)); // 30-90 sec between each

    const success = await agent.startOutreach(lead);
    if (success) successCount++;
    else failCount++;
  }

  logger.info(`✅ Outreach complete: ${successCount} sent, ${failCount} failed`);
  await sendMessage(OWNER_PHONE,
    `Outreach done! 📤\n\nSent messages to ${successCount} leads today.\n${failCount > 0 ? `⚠️ ${failCount} failed (number invalid or blocked)` : ""}\n\nI'll update you on responses as they come in!`
  );
}

// ─── Evening follow-up ────────────────────────────────────────────────────────
async function runEveningFollowUp() {
  const allLeads = db.getAllLeads();

  // Leads who were contacted 3+ days ago but haven't replied
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const silentLeads = allLeads.filter(l =>
    l.stage === "contacted" &&
    l.lastContactAt &&
    new Date(l.lastContactAt) < threeDaysAgo &&
    !l.followUpSent
  );

  if (silentLeads.length === 0) {
    logger.info("No silent leads to follow up with");
    return;
  }

  logger.info(`📞 Following up with ${silentLeads.length} silent leads`);

  for (const lead of silentLeads.slice(0, 5)) { // Max 5 follow-ups per evening
    await sleep(getRandomDelay(20000, 60000));

    // Generate a natural follow-up using Claude
    const followUpMsg = await generateFollowUp(lead);
    if (followUpMsg) {
      const result = await sendMessage(lead.phone, followUpMsg);
      if (result.success) {
        db.addMessage(lead.phone, "assistant", followUpMsg);
        db.upsertLead(lead.phone, { followUpSent: true, lastContactAt: new Date().toISOString() });
      }
    }
  }
}

async function generateFollowUp(lead) {
  const Anthropic = require("@anthropic-ai/sdk");
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const property = require("./property");
  const history = db.getConversation(lead.phone);
  const lastMsg = history[history.length - 1];

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 150,
      messages: [{
        role: "user",
        content: `You are Pritam, a Pune-based property agent. You messaged ${lead.name || "this buyer"} about a 3BHK in Undri a few days ago but got no reply.

Write a SHORT follow-up (2-3 lines max). Use English by default — it's a follow-up to a cold outreach where you don't know their language preference. Casual, friendly, NOT pushy. Light humour is fine. End with one soft open question.

Your last message to them: "${lastMsg?.content || "intro about the flat"}"

Good examples:
"Hey, just checking in — still on the lookout for a flat in South Pune? 😊"
"No worries if you're busy! Just wanted to make sure you got my last message about the Undri flat. Happy to answer any questions."
"The flat's still available if you're interested — happy to arrange a quick visit whenever works for you!"`
      }]
    });
    return response.content[0].text.trim();
  } catch {
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── Manual trigger (for testing) ────────────────────────────────────────────
if (process.argv[2] === "--run-now") {
  logger.info("🧪 Manual trigger: running outreach now");
  runDailyOutreach().then(() => {
    logger.info("Done!");
  });
}

module.exports = { runDailyOutreach, runEveningFollowUp };
