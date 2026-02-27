// whatsapp.js — Meta Cloud API wrapper
const axios = require("axios");
const logger = require("./logger");

const BASE_URL = "https://graph.facebook.com/v19.0";

/**
 * Send a plain text WhatsApp message
 */
async function sendMessage(to, text) {
  try {
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const token = process.env.WHATSAPP_TOKEN;

    const response = await axios.post(
      `${BASE_URL}/${phoneId}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: sanitizePhone(to),
        type: "text",
        text: { body: text, preview_url: false }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    logger.info(`✅ Message sent to ${to}: "${text.substring(0, 60)}..."`);
    return { success: true, messageId: response.data.messages[0].id };

  } catch (err) {
    const errMsg = err.response?.data?.error?.message || err.message;
    logger.error(`❌ Failed to send to ${to}: ${errMsg}`);
    return { success: false, error: errMsg };
  }
}

/**
 * Mark a message as read (shows blue ticks)
 */
async function markRead(messageId) {
  try {
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    await axios.post(
      `${BASE_URL}/${phoneId}/messages`,
      {
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (err) {
    // Non-critical, don't throw
    logger.warn(`Could not mark message ${messageId} as read`);
  }
}

/**
 * Parse incoming webhook payload → extract messages
 */
function parseIncomingWebhook(body) {
  const messages = [];
  try {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value?.messages) return messages;

    for (const msg of value.messages) {
      if (msg.type === "text") {
        messages.push({
          messageId: msg.id,
          from: msg.from,          // phone number (no +)
          text: msg.text.body,
          timestamp: new Date(parseInt(msg.timestamp) * 1000),
          name: value.contacts?.[0]?.profile?.name || "Unknown"
        });
      }
    }
  } catch (err) {
    logger.error("Error parsing webhook:", err.message);
  }
  return messages;
}

/**
 * Normalize phone number — remove spaces, dashes, +
 */
function sanitizePhone(phone) {
  return String(phone).replace(/[\s\-\+]/g, "");
}

module.exports = { sendMessage, markRead, parseIncomingWebhook, sanitizePhone };
