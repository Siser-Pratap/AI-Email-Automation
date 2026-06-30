import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

const serviceDir = __dirname;
config({ path: resolve(serviceDir, "../../.env") });
config({ path: resolve(serviceDir, ".env") });

type MessageListResponse = {
  messages?: WhatsAppMessage[];
  count?: number;
  since?: string;
  error?: string;
};

type WhatsAppMessage = {
  id: string;
  waMessageId: string;
  groupJid: string;
  groupName: string | null;
  senderJid: string;
  senderName: string | null;
  text: string;
  messageAt: string;
  analyzedAt: string | null;
};

type AnalyzeResult = {
  status: "saved" | "dry_run" | "invalid" | "not_found" | "error";
  category?: string;
  confidence?: number;
  leadId?: string;
  emailEntryId?: string;
  error?: string;
};

type AnalyzeResponse = {
  saved?: number;
  dryRun?: number;
  invalid?: number;
  notFound?: number;
  errors?: number;
  results?: AnalyzeResult[];
  error?: string;
};

const MAIN_APP_URL = process.env.MAIN_APP_URL ?? "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET;
const ANALYZE_SINCE_HOURS = process.env.ANALYZE_SINCE_HOURS ?? "24";
const ANALYZE_LIMIT = process.env.ANALYZE_LIMIT ?? "100";
const dryRun = process.argv.includes("--dry-run") || process.env.DRY_RUN === "true";
const createEmailEntry = process.argv.includes("--create-email-entry") || process.env.CREATE_EMAIL_ENTRY === "true";

function requireEnv() {
  if (!CRON_SECRET) {
    console.error("Missing required env var: CRON_SECRET");
    process.exit(1);
  }
}

function checkSession() {
  const credsPath = resolve(serviceDir, "session", "creds.json");
  if (!existsSync(credsPath)) {
    console.warn(`[warn] WhatsApp session not found at ${credsPath}. Daily analysis can still run on already captured DB messages.`);
    return false;
  }

  return true;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${MAIN_APP_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CRON_SECRET}`,
      ...(init?.headers ?? {}),
    },
  });

  const responseText = await response.text();
  let data: T;
  try {
    data = JSON.parse(responseText) as T;
  } catch {
    throw new Error(`${response.status} Expected JSON from ${MAIN_APP_URL}${path}, received: ${responseText.slice(0, 120)}`);
  }

  if (!response.ok) {
    const errorMessage = data && typeof data === "object" && "error" in data ? String(data.error) : response.statusText;
    throw new Error(`${response.status} ${errorMessage}`);
  }

  return data;
}

function summarize(messages: WhatsAppMessage[], analysis: AnalyzeResponse) {
  const results = analysis.results ?? [];
  const analyzed = results.filter((result) => result.status === "saved" || result.status === "dry_run").length;
  const ignored = results.filter((result) => result.category === "IGNORE" || result.category === "LOW_SIGNAL").length;
  const emailReady = results.filter((result) => Boolean(result.emailEntryId)).length;
  const byCategory = new Map<string, number>();

  for (const result of results) {
    if (!result.category) continue;
    byCategory.set(result.category, (byCategory.get(result.category) ?? 0) + 1);
  }

  console.log("\nWhatsApp daily analysis summary:");
  console.log(`  Mode: ${dryRun ? "dry-run" : "write"}`);
  console.log(`  Window: last ${ANALYZE_SINCE_HOURS} hour(s)`);
  console.log(`  Messages fetched: ${messages.length}`);
  console.log(`  Analyzed: ${analyzed}`);
  console.log(`  Leads saved: ${analysis.saved ?? 0}`);
  console.log(`  Dry-run results: ${analysis.dryRun ?? 0}`);
  console.log(`  Email entries created: ${emailReady}`);
  console.log(`  Low-signal/ignored: ${ignored}`);
  console.log(`  Invalid: ${analysis.invalid ?? 0}`);
  console.log(`  Not found: ${analysis.notFound ?? 0}`);
  console.log(`  Errors: ${analysis.errors ?? 0}`);

  if (byCategory.size > 0) {
    console.log("  Categories:");
    Array.from(byCategory.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .forEach(([category, count]) => console.log(`    ${category}: ${count}`));
  }
}

async function runDailyAnalysis() {
  requireEnv();
  const sessionExists = checkSession();

  console.log(`Starting WhatsApp daily analysis${dryRun ? " (dry-run)" : ""}...`);
  console.log(`Main app: ${MAIN_APP_URL}`);
  console.log(`WhatsApp session: ${sessionExists ? "found" : "missing"}`);

  const query = new URLSearchParams({
    sinceHours: ANALYZE_SINCE_HOURS,
    limit: ANALYZE_LIMIT,
  });

  const list = await requestJson<MessageListResponse>(`/api/whatsapp/messages?${query}`);
  const messages = list.messages ?? [];

  if (messages.length === 0) {
    console.log("No unanalyzed WhatsApp messages found for this window.");
    summarize([], { saved: 0, dryRun: 0, invalid: 0, notFound: 0, errors: 0, results: [] });
    return;
  }

  const analysis = await requestJson<AnalyzeResponse>("/api/whatsapp/analyze", {
    method: "POST",
    body: JSON.stringify({
      dryRun,
      analyses: messages.map((message) => ({
        waMessageId: message.waMessageId,
        createEmailEntry,
      })),
    }),
  });

  summarize(messages, analysis);

  if ((analysis.errors ?? 0) > 0) {
    process.exitCode = 1;
  }
}

runDailyAnalysis().catch((error) => {
  console.error("WhatsApp daily analysis failed:", error);
  process.exit(1);
});