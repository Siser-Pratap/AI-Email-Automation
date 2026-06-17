import "dotenv/config";
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Page } from "playwright";
import cron from "node-cron";
import fs from "fs";

chromium.use(StealthPlugin());

const COOKIES_FILE = "./linkedin_cookies.json";
const MAIN_APP_URL = process.env.MAIN_APP_URL;
const CRON_SECRET = process.env.CRON_SECRET;

if (!MAIN_APP_URL || !CRON_SECRET) {
  console.error("Missing required env vars: MAIN_APP_URL, CRON_SECRET");
  process.exit(1);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Random delay to mimic human pacing
function randomDelay(minMs: number, maxMs: number) {
  return sleep(minMs + Math.random() * (maxMs - minMs));
}

async function loadSession(page: Page) {
  if (fs.existsSync(COOKIES_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, "utf-8"));
    await page.context().addCookies(cookies);
  }
}

async function saveSession(page: Page) {
  const cookies = await page.context().cookies();
  fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
}

// Detects both direct emails and obfuscated formats like "name AT company DOT com"
function containsEmail(text: string): boolean {
  const direct = /[\w.%+\-]+@[\w.\-]+\.[a-zA-Z]{2,}/;
  const obfuscated =
    /[\w.%+\-]+\s*[\[\(]?\s*at\s*[\]\)]?\s*[\w.\-]+\s*[\[\(]?\s*dot\s*[\]\)]?\s*[a-z]{2,}/i;
  return direct.test(text) || obfuscated.test(text);
}

async function sendToIngest(rawText: string) {
  try {
    const res = await fetch(`${MAIN_APP_URL}/api/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CRON_SECRET}`,
      },
      body: JSON.stringify({ rawText, source: "LINKEDIN" }),
    });
    const data = (await res.json()) as { message?: string };
    console.log(`[ingest] ${res.status} — ${data.message ?? ""}`);
  } catch (err) {
    console.error("[ingest] Request failed:", err);
  }
}

async function scrapeLinkedInFeed() {
  console.log(`[scrape] Starting at ${new Date().toISOString()}`);

  if (!fs.existsSync(COOKIES_FILE)) {
    console.error("[scrape] No session cookies. Run `npm run setup` first.");
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const page = (await browser.newPage()) as unknown as Page;

  // Use a Set to deduplicate posts captured by both Voyager and DOM fallback
  const collectedPosts = new Set<string>();

  // Intercept Voyager API — more stable than DOM selectors
  await page.route("**/voyager/api/feed/updatesV2**", async (route) => {
    const response = await route.fetch();
    const json = await response.json().catch(() => null);
    if (json?.elements) {
      for (const el of json.elements) {
        try {
          const text =
            el?.value?.["com.linkedin.voyager.feed.render.UpdateV2"]
              ?.commentary?.text?.text;
          if (text) collectedPosts.add(text);
        } catch {
          // path changed — DOM fallback will cover it
        }
      }
    }
    await route.fulfill({ response });
  });

  await loadSession(page);
  await randomDelay(1000, 2500);

  try {
    await page.goto(
      "https://www.linkedin.com/search/results/content/?keywords=hiring",
      { waitUntil: "domcontentloaded", timeout: 30000 }
    );
  } catch (err) {
    console.error("[scrape] Navigation failed:", err);
    await browser.close();
    return;
  }

  const currentUrl = page.url();
  if (currentUrl.includes("login") || currentUrl.includes("checkpoint")) {
    console.error(
      "[scrape] Session expired or checkpoint hit. Run `npm run setup` to re-authenticate."
    );
    await browser.close();
    return;
  }

  // Wait for feed content with human-paced delay
  await randomDelay(3000, 6000);

  // DOM fallback — Voyager interception captures API calls made during page load;
  // some posts rendered server-side only appear in the DOM
  const postElements = await page.$$(
    '.feed-shared-update-v2__description-wrapper span[dir="ltr"]'
  );
  for (const el of postElements) {
    const text = await el.innerText().catch(() => "");
    if (text) collectedPosts.add(text);
  }

  // Refresh cookies to extend session lifetime
  await saveSession(page);
  await browser.close();

  const emailPosts = [...collectedPosts].filter(containsEmail);
  console.log(
    `[scrape] ${collectedPosts.size} posts found, ${emailPosts.length} contain emails`
  );

  for (const text of emailPosts) {
    await sendToIngest(text);
    await randomDelay(500, 1500); // stagger ingest requests
  }

  console.log("[scrape] Done.");
}

if (process.argv.includes("--run-now")) {
  scrapeLinkedInFeed().catch(console.error);
} else {
  // 8:30 AM IST = 3:00 AM UTC, weekdays only
  cron.schedule("0 3 * * 1-5", () => {
    scrapeLinkedInFeed().catch(console.error);
  });
  // 1:00 PM IST = 7:30 AM UTC, weekdays only
  cron.schedule("30 7 * * 1-5", () => {
    scrapeLinkedInFeed().catch(console.error);
  });
  console.log(
    "LinkedIn scraper scheduled: 8:30 AM IST and 1:00 PM IST (weekdays)"
  );
}
