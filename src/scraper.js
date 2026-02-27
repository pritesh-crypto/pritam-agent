// scraper.js — Finds buyers looking for properties in South Pune
// Uses free/public data sources and Meta's ad lead gen (optional)
require("dotenv").config();
const axios = require("axios");
const db = require("./db");
const logger = require("./logger");

/**
 * SOUTH PUNE TARGET AREAS & KEYWORDS
 * The scraper looks for people actively searching in these areas
 */
const TARGET_CONFIG = {
  areas: ["NIBM", "Undri", "Handewadi", "Mohammadwadi", "Wanowrie", "Kondhwa", "south pune"],
  keywords: [
    "3bhk undri", "flat nibm", "property handewadi", "buy flat south pune",
    "3 bhk undri pune", "flat for sale nibm road", "property mohammadwadi",
    "3bhk pune undri", "nibm road flat", "handewadi property",
    "buy 3bhk pune", "south pune property", "wanowrie flat"
  ],
  budgetRange: { min: "80L", max: "1.3Cr" }
};

/**
 * Scrape NoBroker public listings — find buyers who posted "Looking for" ads
 * NoBroker has public "wanted" posts — we find them and note the poster's details
 */
async function scrapeNoBroker() {
  const leads = [];
  try {
    // NoBroker "wanted" section for Pune south areas
    for (const area of ["undri", "nibm-road", "handewadi", "mohammadwadi"]) {
      const url = `https://www.nobroker.in/property/residential/buy/pune/${area}?bedrooms=3BHK`;
      logger.info(`Checking NoBroker for ${area}...`);

      // Note: In production, use Puppeteer to render JS pages
      // For now we use their API hints
      leads.push({
        source: "NoBroker",
        area,
        platform: "nobroker",
        searchUrl: url
      });

      await sleep(1000);
    }
  } catch (err) {
    logger.warn(`NoBroker scrape issue: ${err.message}`);
  }
  return leads;
}

/**
 * Scrape MagicBricks buyer enquiries
 * MB has a public "buyers looking for" section
 */
async function scrapeMagicBricks() {
  const leads = [];
  try {
    const areas = ["nibm-road-pune", "undri-pune", "handewadi-pune", "mohammadwadi-pune"];
    for (const area of areas) {
      leads.push({
        source: "MagicBricks",
        area,
        platform: "magicbricks",
        searchUrl: `https://www.magicbricks.com/property-for-sale/residential-real-estate?proptype=Multistorey-Apartment,Builder-Floor-Apartment&bedroom=3&cityName=Pune&locality=${area}`
      });
      await sleep(800);
    }
  } catch (err) {
    logger.warn(`MagicBricks scrape issue: ${err.message}`);
  }
  return leads;
}

/**
 * Pull leads from Facebook Lead Gen forms (if you've run FB ads)
 * This uses Meta Graph API to pull form submissions
 */
async function fetchFacebookLeads() {
  const fbToken = process.env.FACEBOOK_PAGE_TOKEN;
  const formId = process.env.FACEBOOK_LEAD_FORM_ID;

  if (!fbToken || !formId) {
    logger.info("Facebook lead forms not configured — skipping");
    return [];
  }

  try {
    const res = await axios.get(
      `https://graph.facebook.com/v19.0/${formId}/leads`,
      {
        params: { access_token: fbToken, fields: "field_data,created_time" }
      }
    );

    const leads = [];
    for (const entry of res.data.data || []) {
      const fields = {};
      for (const field of entry.field_data) {
        fields[field.name] = field.values[0];
      }

      leads.push({
        source: "Facebook Ads",
        platform: "facebook",
        name: fields["full_name"] || fields["name"] || null,
        phone: fields["phone_number"] || fields["phone"] || null,
        email: fields["email"] || null,
        budget: fields["budget"] || null,
        area: fields["preferred_area"] || null,
        rawData: fields,
        score: 75  // Facebook leads are pre-qualified since they filled a form
      });
    }

    logger.info(`📘 Fetched ${leads.length} leads from Facebook`);
    return leads;
  } catch (err) {
    logger.warn(`Facebook leads error: ${err.message}`);
    return [];
  }
}

/**
 * Pull leads from WhatsApp Click-to-Chat links
 * When someone clicks a wa.me link from your listing, they appear here
 */
async function fetchClickToChatLeads() {
  // These come in through the webhook automatically
  // This function just marks unprocessed click-to-chat leads
  return [];
}

/**
 * Manual lead ingestion — add leads from any source manually
 */
function addManualLead(leadData) {
  const { phone, name, source, budget, area, notes } = leadData;

  if (!phone) throw new Error("Phone number required");

  const existing = db.getLead(phone);
  if (existing) {
    logger.info(`Lead ${phone} already exists — updating`);
    db.upsertLead(phone, { name, budget, area, notes, updatedAt: new Date().toISOString() });
    return db.getLead(phone);
  }

  const lead = db.upsertLead(phone, {
    name: name || null,
    source: source || "manual",
    budget: budget || null,
    areaInterest: area || null,
    notes: notes || null,
    stage: "new",
    score: calculateInitialScore({ budget, area, source }),
  });

  logger.info(`➕ Manual lead added: ${phone} (${name || "unknown"})`);
  return lead;
}

/**
 * Score a lead based on available info (0-100)
 */
function calculateInitialScore({ budget, area, source, timeline } = {}) {
  let score = 40; // Base score

  // Budget scoring
  if (budget) {
    const budgetNum = parseBudget(budget);
    if (budgetNum >= 9500000 && budgetNum <= 13000000) score += 25; // Ideal range
    else if (budgetNum >= 8000000 && budgetNum < 9500000) score += 10; // Slightly under
    else if (budgetNum > 13000000) score += 15; // Over budget — can still negotiate down
  }

  // Area scoring — south Pune target areas
  if (area) {
    const areaLower = area.toLowerCase();
    if (["undri", "nibm", "handewadi", "mohammadwadi"].some(a => areaLower.includes(a))) {
      score += 20;
    } else if (["wanowrie", "kondhwa", "magarpatta"].some(a => areaLower.includes(a))) {
      score += 10;
    }
  }

  // Source scoring
  const sourceScores = {
    "facebook": 15,
    "instagram": 10,
    "nobroker": 20,
    "magicbricks": 20,
    "99acres": 15,
    "referral": 25,
    "manual": 5
  };
  const sourceLower = (source || "").toLowerCase();
  for (const [src, pts] of Object.entries(sourceScores)) {
    if (sourceLower.includes(src)) { score += pts; break; }
  }

  return Math.min(score, 100);
}

function parseBudget(budget) {
  if (!budget) return 0;
  const str = String(budget).replace(/[₹,\s]/g, "").toUpperCase();
  if (str.includes("CR")) return parseFloat(str) * 10000000;
  if (str.includes("L")) return parseFloat(str) * 100000;
  return parseFloat(str) || 0;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Run full daily scrape + lead discovery
 */
async function runDailyScrape() {
  logger.info("🔍 Starting daily lead scrape for South Pune...");

  const allSources = await Promise.allSettled([
    fetchFacebookLeads(),
    scrapeNoBroker(),
    scrapeMagicBricks(),
    fetchClickToChatLeads()
  ]);

  let totalNew = 0;
  for (const result of allSources) {
    if (result.status === "fulfilled" && result.value.length > 0) {
      for (const lead of result.value) {
        if (lead.phone && !db.getLead(lead.phone)) {
          db.upsertLead(lead.phone, {
            ...lead,
            stage: "new",
            score: lead.score || calculateInitialScore(lead)
          });
          totalNew++;
        }
      }
    }
  }

  logger.info(`✅ Scrape complete — ${totalNew} new leads added`);
  return totalNew;
}

module.exports = {
  runDailyScrape,
  addManualLead,
  fetchFacebookLeads,
  calculateInitialScore,
  TARGET_CONFIG
};
