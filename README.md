# 🏠 Pritam — WhatsApp AI Property Agent

Pritam is your personal AI property agent. Your **only interface is WhatsApp** — you teach him everything about your flat by chatting with him, and he handles all buyer conversations 24/7.

---

## 🚀 SETUP (3 steps)

### Step 1 — Get a WhatsApp number for Pritam
- New Jio/Airtel SIM (~₹200), OR
- Virtual number via TextLocal / MSG91

### Step 2 — Meta WhatsApp Cloud API (free)
1. Go to https://developers.facebook.com → Create App → Business type
2. Add WhatsApp product → Add Pritam's number
3. Copy: **Phone Number ID**, **Access Token**, **WABA ID**

### Step 3 — Fill .env and deploy
```bash
cp .env.example .env
# Fill in your keys, then:
npm install
npm start
```

Register your webhook URL in Meta Console:
- URL: `https://your-server.com/webhook`
- Verify Token: same as `WEBHOOK_VERIFY_TOKEN` in your .env

---

## 💬 HOW TO TEACH PRITAM (just WhatsApp him!)

After setup, just message Pritam's number. He learns everything from you.

### Tell him about the flat — send anything, in any order:

```
Flat is 3BHK, 1420 sqft, 7th floor, east facing
```
```
Society name is Green Valley, Undri, South Pune
```
```
Price is 1.15 Crore, I can negotiate till 1.05 Cr
```
```
Amenities: swimming pool, gym, clubhouse, 24x7 security, power backup
```
```
5 mins from NIBM Road, 10 mins from Magarpatta
```
```
Vastu compliant, modular kitchen, Italian marble flooring
```
```
2 covered parking, flat is 3 years old
```
```
HDFC and SBI approved society, loans easily available
```
```
Ready to move immediately, no waiting
```
```
Don't negotiate below 1.05 Cr — that's the bottom line
```

Pritam will reply confirming what he learned each time. ✅

### Give him special instructions:
```
If someone asks about OC certificate, tell them to escalate to me
```
```
For NRI buyers, give them extra time and be more detailed
```
```
Rahul Mehta (9820011234) is a serious buyer — prioritize him
```

### Check status anytime:
| You say | Pritam does |
|---|---|
| `status` or `report` | Full pipeline report |
| `leads` | Quick lead count |
| `appointments` | All booked visits |

---

## 🧠 How Pritam learns

Every message you send goes through Claude, which:
1. Classifies it (property info / command / instruction / lead info)
2. Extracts structured facts automatically
3. Stores everything in `data/knowledge.json`
4. Immediately uses it in all buyer conversations

You can send info in any format — structured or casual, English or Hinglish. Pritam figures it out.

---

## 📅 Daily Auto-Schedule (IST)

| Time | Action |
|---|---|
| 8:30 AM | Scrape portals for new leads |
| 10:00 AM | Send natural outreach to 10 hot leads |
| 6:00 PM | Follow up with silent leads (3+ days) |
| 8:00 PM | Send you daily pipeline report |

---

## 🗂 Files

```
pritam-agent/
├── src/
│   ├── server.js      ← Webhook + API server
│   ├── agent.js       ← Pritam's brain (Claude)
│   ├── knowledge.js   ← Dynamic property knowledge store
│   ├── scheduler.js   ← Daily cron jobs
│   ├── scraper.js     ← Lead scraping
│   ├── whatsapp.js    ← Meta API wrapper
│   ├── db.js          ← Leads + conversations DB
│   └── logger.js      ← Logging
├── data/
│   ├── db.json        ← Leads & conversations (auto-created)
│   └── knowledge.json ← Everything Pritam knows (auto-created)
├── .env.example
└── package.json
```

---

## 💰 Cost

| Item | Cost |
|---|---|
| WhatsApp Cloud API (1000 msg/mo free) | ₹0 |
| Claude API (~10 leads/day) | ~₹500–1500/month |
| Railway hosting (free tier) | ₹0 |
| **Total** | **~₹500–1500/month** |
