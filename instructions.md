# Auto-Ingestion from WhatsApp & LinkedIn — Implementation Phases

## Overview

The goal is to automatically detect HR email addresses (and job context) from WhatsApp group messages and LinkedIn feed posts, then push them into the AutoMail.ai pipeline as `PENDING` email entries — ready to send.

**Architecture summary:**
- A separate long-running Node.js service (not Vercel) handles WhatsApp listening and LinkedIn scraping
- It sends extracted data to a new `/api/ingest` endpoint on this app
- GPT-4o parses the unstructured message text into structured fields (email, company, role, name)
- A review queue in the dashboard lets you approve entries before they're sent

---

## Phase 1 — Backend: Ingestion Endpoint + Schema

**Goal:** Prepare the main app to receive auto-detected entries from external sources.

### 1.1 Add `source` and `reviewStatus` to `EmailEntry` in `prisma/schema.prisma`

```prisma
source       String  @default("MANUAL")  // "MANUAL", "WHATSAPP", "LINKEDIN"
reviewStatus String  @default("AUTO")    // "AUTO", "PENDING_REVIEW", "APPROVED"
rawText      String? // original message/post text for audit
```

Run `npx prisma generate` after updating the schema.

### 1.2 Create `POST /api/ingest`

This endpoint accepts raw or pre-parsed data from the external service. It should:

1. Accept `{ rawText, source, parsedData? }` — `parsedData` is optional (the external service may pre-parse or leave it to GPT-4o here)
2. Call GPT-4o to extract `{ hrEmail, companyName, role, name, emailType, notes }` from `rawText` if `parsedData` is not provided
3. Skip if no email address is found in the extracted data
4. Check for duplicates — skip if `hrEmail` already exists with status `PENDING` or `SENT`
5. Create an `EmailEntry` with `status: "PENDING"`, `reviewStatus: "PENDING_REVIEW"`, and `source` set to the incoming source
6. Secure with the same `CRON_SECRET` bearer token

### 1.3 GPT-4o Parsing Prompt (inside `/api/ingest`)

```
Extract the following from this message. Return JSON only, no explanation.
Fields: hrEmail (string or null), companyName (string or null), role (string or null), name (string or null), emailType ("REFERRAL" | "APPLICATION" | "INTEREST"), notes (string or null)

Message:
"""
{rawText}
"""
```

If `hrEmail` is null in the response, discard the entry.

### 1.4 Add Review Queue to Dashboard

- Add a "Needs Review" tab/filter showing entries where `reviewStatus === "PENDING_REVIEW"`
- Add **Approve** button → sets `reviewStatus: "APPROVED"`, keeps `status: "PENDING"`
- Add **Discard** button → deletes the entry
- Show `source` badge (WhatsApp / LinkedIn) and `rawText` in an expandable row

---

## Phase 2 — WhatsApp Listener Service

**Why not Vercel:** `whatsapp-web.js` and Baileys both need a persistent WebSocket connection and a running process. Deploy this as a separate service on **Railway**, **Render**, or **Fly.io** (free tiers available).

**Library choice:**

| Library | Auth | Ban risk | Notes |
|---|---|---|---|
| `whatsapp-web.js` | QR scan (Puppeteer) | Medium | Well-documented, active community |
| `@whiskeysockets/baileys` | QR scan or pairing code | Lower | Lighter, no Puppeteer dependency |

Recommend **Baileys** for production — no Puppeteer overhead and slightly lower ban risk.

### 2.1 Set Up the Service (new repo or `/services/whatsapp/`)

```bash
npm init -y
npm install @whiskeysockets/baileys @hapi/boom qrcode-terminal
```

### 2.2 Auth Flow

Two options — use the pairing code approach for headless servers (no terminal/display needed):

**Option A — Phone pairing code (recommended for servers):**
```typescript
const code = await sock.requestPairingCode("91XXXXXXXXXX") // your number with country code
console.log("Pairing code:", code) // enter this in WhatsApp → Linked Devices
```

**Option B — QR scan:**
```typescript
// printQRInTerminal: true in makeWASocket options
// Scan the printed QR with your phone
```

In both cases, credentials are saved via `useMultiFileAuthState('./session')` and reloaded on every restart — no re-auth needed. Store the session directory in a persistent volume on Railway/Render.

### 2.3 Group Listener Logic

```typescript
// Pseudocode
sock.ev.on('messages.upsert', async ({ messages }) => {
  for (const msg of messages) {
    // Filter to specific groups only
    const jid = msg.key.remoteJid
    if (!WATCHED_GROUP_JIDS.includes(jid)) continue
    if (msg.key.fromMe) continue

    const text = msg.message?.conversation 
               || msg.message?.extendedTextMessage?.text 
               || ""

    // Quick pre-filter: only process if message contains @ (likely has email)
    if (!text.includes("@")) continue

    await fetch(`${MAIN_APP_URL}/api/ingest`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CRON_SECRET}`
      },
      body: JSON.stringify({ rawText: text, source: "WHATSAPP" })
    })
  }
})
```

### 2.4 Get Group JIDs

Run this once to list all your groups and their JIDs:
```typescript
const groups = await sock.groupFetchAllParticipating()
console.log(Object.values(groups).map(g => ({ name: g.subject, jid: g.id })))
```

Paste the target JIDs into an env variable `WATCHED_GROUP_JIDS=jid1,jid2`.

### 2.5 Environment Variables for this service

```
MAIN_APP_URL=https://your-vercel-app.vercel.app
CRON_SECRET=same_secret_as_main_app
WATCHED_GROUP_JIDS=120363xxxxxx@g.us,120363yyyyyy@g.us
```

---

## Phase 3 — LinkedIn Feed Scraper

**Reality check:** LinkedIn has no official API for personal feed posts. The `r_member_social` scope that would allow reading posts is a private partner-only permission — not available to regular developers. The only viable path is Playwright browser automation.

**Risks to accept upfront:**
- This violates LinkedIn's ToS (Section 8.2)
- Account ban sequence: CAPTCHA lock → phone verify prompt → 24-hour restriction → permanent ban
- LinkedIn detects headless browsers via TLS fingerprinting, canvas fingerprinting, and behavioral biometrics
- Datacenter IPs (AWS, GCP, Railway, Render) are heavily blocklisted by LinkedIn

**Mitigations:**
- Use a **dedicated secondary LinkedIn account** — never your personal profile
- Use **residential proxies** (Smartproxy, Oxylabs) — datacenter IPs get flagged immediately
- Use **stealth plugins** to mask headless browser fingerprints
- Use **human-paced delays** with random variance between actions

### 3.1 Install Dependencies

```bash
npm install playwright-extra puppeteer-extra-plugin-stealth
npx playwright install chromium
```

### 3.2 Session Auth (Cookie Persistence)

Log in manually once, save the `li_at` session cookie, and reuse it. Repeated programmatic logins trigger verification prompts.

```typescript
import fs from "fs"

const COOKIES_FILE = "./linkedin_cookies.json"

async function loadSession(page: Page) {
  if (fs.existsSync(COOKIES_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, "utf-8"))
    await page.context().addCookies(cookies)
  }
}

async function saveSession(page: Page) {
  const cookies = await page.context().cookies()
  fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies))
}
```

### 3.3 Scraper Logic (Voyager API Interception)

Intercepting LinkedIn's internal Voyager API responses is more reliable than DOM parsing — selectors break on redesigns, JSON structure is more stable.

```typescript
import { chromium } from "playwright-extra"
import StealthPlugin from "puppeteer-extra-plugin-stealth"

chromium.use(StealthPlugin())

async function scrapeLinkedInFeed() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  const collectedPosts: string[] = []

  // Intercept Voyager API feed responses
  page.route("**/voyager/api/feed/updatesV2**", async (route) => {
    const response = await route.fetch()
    const json = await response.json().catch(() => null)
    if (json?.elements) {
      for (const el of json.elements) {
        try {
          // Path may vary — LinkedIn changes this without notice
          const text = el?.value?.["com.linkedin.voyager.feed.render.UpdateV2"]
                         ?.commentary?.text?.text
          if (text) collectedPosts.push(text)
        } catch {}
      }
    }
    route.fulfill({ response })
  })

  await loadSession(page)
  // Target content search for hiring posts — better signal than home feed
  await page.goto("https://www.linkedin.com/search/results/content/?keywords=hiring")

  if (page.url().includes("login")) {
    // Session expired — needs manual re-login and cookie re-save
    console.error("LinkedIn session expired. Re-login required.")
    await browser.close()
    return
  }

  // DOM fallback for posts not captured via Voyager
  const postElements = await page.$$('.feed-shared-update-v2__description-wrapper span[dir="ltr"]')
  for (const el of postElements) {
    const text = await el.innerText().catch(() => "")
    if (text) collectedPosts.push(text)
  }

  await browser.close()

  for (const text of collectedPosts) {
    if (!containsEmail(text)) continue
    await fetch(`${process.env.MAIN_APP_URL}/api/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.CRON_SECRET}`
      },
      body: JSON.stringify({ rawText: text, source: "LINKEDIN" })
    })
  }
}

// Handle obfuscated emails like "name[at]company.com" or "name AT company DOT com"
function containsEmail(text: string): boolean {
  const directEmail = /[\w.%+\-]+@[\w.\-]+\.[a-zA-Z]{2,}/
  const obfuscated = /[\w.%+\-]+\s*[\[\(]?\s*at\s*[\]\)]?\s*[\w.\-]+\s*[\[\(]?\s*dot\s*[\]\)]?\s*[a-z]{2,}/i
  return directEmail.test(text) || obfuscated.test(text)
}
```

### 3.4 Pass Obfuscated Emails to GPT-4o

In `/api/ingest`, the GPT-4o prompt should explicitly handle obfuscated formats:

```
Extract the email address from this text. Recruiters often write emails as
"name[at]company[dot]com" or "name AT company DOT com" — normalize these to
standard format. Return JSON: { hrEmail, companyName, role, name, emailType, notes }
```

### 3.5 Schedule the Scraper

```typescript
// 8:30 AM IST and 1:00 PM IST (3:00 AM UTC and 7:30 AM UTC), weekdays only
cron.schedule("0 3 * * 1-5", scrapeLinkedInFeed)
cron.schedule("30 7 * * 1-5", scrapeLinkedInFeed)
```

### 3.6 Deployment — Dockerfile Required

Playwright needs Chromium binaries. Railway and Render support this via Docker:

```dockerfile
FROM mcr.microsoft.com/playwright:v1.44.0-jammy
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npx", "tsx", "index.ts"]
```

### 3.7 Environment Variables

```
LINKEDIN_EMAIL=your-secondary-account@gmail.com   # for reference only — use cookie auth
MAIN_APP_URL=https://your-vercel-app.vercel.app
CRON_SECRET=same_secret_as_main_app
```

---

## Phase 4 — Deduplication & Safety Guards

Implement these in `/api/ingest` to prevent spam:

1. **Email dedup:** Before creating an entry, query `prisma.emailEntry.findFirst({ where: { hrEmail } })`. If found with status `SENT` or `PENDING`, skip.
2. **Rate limit per source:** Store last-ingested timestamp per source in `AppSetting`. Reject if more than 20 entries/hour from a single source.
3. **Minimum confidence:** If GPT-4o returns `hrEmail: null` or the email fails a basic regex check, discard silently.
4. **Review buffer:** All auto-ingested entries go to `reviewStatus: "PENDING_REVIEW"` — they do NOT get picked up by the cron job until you approve them. Add this filter to the cron query:

```typescript
// In /api/cron and scripts/cron.ts — add to the where clause:
where: {
  status: "PENDING",
  scheduledAt: { lte: now },
  OR: [
    { reviewStatus: "AUTO" },      // manually created entries
    { reviewStatus: "APPROVED" },  // approved auto-ingested entries
  ]
}
```

---

## Phase 5 — Dashboard Review UI

Add to the existing dashboard:

1. **Source badge** on each row: `WHATSAPP` (green), `LINKEDIN` (blue), `MANUAL` (gray)
2. **"Needs Review" count** in the sidebar as a notification badge
3. **Review panel** — clicking a PENDING_REVIEW entry shows:
   - The original `rawText` (what the WhatsApp message or LinkedIn post said)
   - The GPT-4o-extracted fields (pre-filled, editable before approving)
   - **Approve** and **Discard** buttons
4. **Bulk approve** — select all and approve at once

---

## Deployment Summary

| Component | Platform | Why |
|---|---|---|
| Main Next.js app | Vercel | Already deployed |
| WhatsApp listener + LinkedIn scraper | Railway / Render / Fly.io | Needs persistent process + Chromium |

The external service talks to the main Vercel app only via the `/api/ingest` HTTP endpoint — no shared code or database connection needed from the service side (the main app owns the DB).

---

## Phase Order Recommendation

1. **Phase 1 first** — get the ingestion endpoint and schema ready; test it with manual curl requests
2. **Phase 4 dedup guards** — add these before connecting any live source
3. **Phase 2 (WhatsApp)** — faster to set up, higher signal quality (group messages are targeted)
4. **Phase 5 review UI** — build this before going live so you can vet entries
5. **Phase 3 (LinkedIn)** — add last; more setup complexity and higher maintenance overhead
