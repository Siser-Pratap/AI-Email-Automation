import "dotenv/config";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";

const logger = pino({ level: "silent" });

const MAIN_APP_URL = process.env.MAIN_APP_URL;
const CRON_SECRET = process.env.CRON_SECRET;
const WA_PHONE_NUMBER = process.env.WA_PHONE_NUMBER;
const LIST_GROUPS = process.env.LIST_GROUPS === "true";

const WATCHED_GROUP_JIDS = (process.env.WATCHED_GROUP_JIDS || "")
  .split(",")
  .map((j) => j.trim())
  .filter(Boolean);

if (!MAIN_APP_URL || !CRON_SECRET) {
  console.error("Missing required env vars: MAIN_APP_URL, CRON_SECRET");
  process.exit(1);
}

async function sendToIngest(rawText: string) {
  try {
    const res = await fetch(`${MAIN_APP_URL}/api/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CRON_SECRET}`,
      },
      body: JSON.stringify({ rawText, source: "WHATSAPP" }),
    });
    const data = await res.json() as { message?: string };
    console.log(`[ingest] ${res.status} — ${data.message ?? ""}`);
  } catch (err) {
    console.error("[ingest] Request failed:", err);
  }
}

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("./session");
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`Using WA v${version.join(".")}${isLatest ? "" : " (update available)"}`);

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    // Print QR in terminal if no phone number is set for pairing code
    printQRInTerminal: !WA_PHONE_NUMBER,
  });

  // Pairing code auth — preferred for headless servers
  if (!sock.authState.creds.registered && WA_PHONE_NUMBER) {
    const digits = WA_PHONE_NUMBER.replace(/[^0-9]/g, "");
    const code = await sock.requestPairingCode(digits);
    console.log(`\nPairing code: ${code}`);
    console.log("Enter this in WhatsApp → Settings → Linked Devices → Link with Phone Number\n");
  }

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const loggedOut = reason === DisconnectReason.loggedOut;
      console.log(`Connection closed (reason: ${reason}). ${loggedOut ? "Logged out — delete ./session and restart." : "Reconnecting in 3s..."}`);
      if (!loggedOut) setTimeout(connectToWhatsApp, 3000);
      return;
    }

    if (connection === "open") {
      console.log("Connected to WhatsApp.");

      if (LIST_GROUPS) {
        console.log("\nFetching groups...");
        const groups = await sock.groupFetchAllParticipating();
        const rows = Object.values(groups).map((g: any) => ({ name: g.subject, jid: g.id }));
        console.log("\nGroups you are in:\n");
        rows.forEach((r) => console.log(`  ${r.jid}  ${r.name}`));
        console.log(`\nSet WATCHED_GROUP_JIDS=${rows.map((r) => r.jid).join(",")} in .env, then restart without LIST_GROUPS=true\n`);
        process.exit(0);
      }

      if (WATCHED_GROUP_JIDS.length === 0) {
        console.warn("[warn] WATCHED_GROUP_JIDS is empty — all group messages will be processed.");
        console.warn("[warn] Run `npm run list-groups` to find your group JIDs.");
      } else {
        console.log(`Watching ${WATCHED_GROUP_JIDS.length} group(s): ${WATCHED_GROUP_JIDS.join(", ")}`);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;

      const jid = msg.key.remoteJid;
      if (!jid) continue;

      // Only process group messages
      if (!jid.endsWith("@g.us")) continue;

      // Filter to watched groups if configured
      if (WATCHED_GROUP_JIDS.length > 0 && !WATCHED_GROUP_JIDS.includes(jid)) continue;

      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        "";

      if (!text) continue;

      // Quick pre-filter: skip if no @ symbol (unlikely to contain an email)
      if (!text.includes("@")) continue;

      console.log(`[msg] ${jid} → ${text.slice(0, 100)}${text.length > 100 ? "..." : ""}`);
      await sendToIngest(text);
    }
  });
}

connectToWhatsApp().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
