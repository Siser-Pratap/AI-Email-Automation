/**
 * One-time setup: opens LinkedIn in a real browser window, lets you log in
 * manually, then saves the session cookies to linkedin_cookies.json.
 *
 * Run once before deploying:
 *   npm run setup
 */
import "dotenv/config";
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";

chromium.use(StealthPlugin());

const COOKIES_FILE = "./linkedin_cookies.json";

async function setup() {
  console.log("Opening LinkedIn — log in with your secondary account, then wait.");
  console.log("The browser will close automatically once you reach the feed.\n");

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://www.linkedin.com/login");

  // Poll until the user is on any authenticated LinkedIn page (not login/checkpoint)
  const LOGIN_PAGES = ["/login", "/checkpoint", "/uas/", "/authwall"];
  const deadline = Date.now() + 120_000;
  let loggedIn = false;

  while (Date.now() < deadline) {
    await page.waitForTimeout(1500);
    const url = page.url();
    if (LOGIN_PAGES.every((p) => !url.includes(p)) && url.includes("linkedin.com")) {
      loggedIn = true;
      break;
    }
  }

  if (!loggedIn) {
    console.error("Timed out waiting for login. Please try again.");
    await browser.close();
    process.exit(1);
  }

  const cookies = await context.cookies();
  fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));

  console.log(`\nCookies saved to ${COOKIES_FILE}`);
  console.log("You can now start the scraper with: npm start\n");

  await browser.close();
}

setup().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
