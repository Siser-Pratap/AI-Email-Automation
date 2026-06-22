import "dotenv/config";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  type GroupMetadata,
  makeCacheableSignalKeyStore,
  proto,
  useMultiFileAuthState as createMultiFileAuthState,
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

const groupNames = new Map<string, string>();
const stats = {
  received: 0,
  captured: 0,
  duplicates: 0,
  invalid: 0,
  failed: 0,
  skipped: 0,
};

if (!MAIN_APP_URL || !CRON_SECRET) {
  console.error("Missing required env vars: MAIN_APP_URL, CRON_SECRET");
  process.exit(1);
}

type CaptureResponse = {
  created?: number;
  duplicates?: number;
  invalid?: number;
  errors?: number;
  message?: string;
};

function unwrapMessage(message: proto.IMessage | null | undefined): proto.IMessage | null | undefined {
  return message?.ephemeralMessage?.message ||
    message?.viewOnceMessage?.message ||
    message?.viewOnceMessageV2?.message ||
    message?.documentWithCaptionMessage?.message ||
    message;
}

function getMessageText(message: proto.IMessage | null | undefined) {
  const content = unwrapMessage(message);

  return content?.conversation ||
    content?.extendedTextMessage?.text ||
    content?.imageMessage?.caption ||
    content?.videoMessage?.caption ||
    content?.documentMessage?.caption ||
    "";
}

function getMessageDate(timestamp: proto.IWebMessageInfo["messageTimestamp"]) {
  if (typeof timestamp === "number") return new Date(timestamp * 1000);
  if (timestamp && typeof timestamp === "object" && "toNumber" in timestamp) {
    return new Date(timestamp.toNumber() * 1000);
  }
  return new Date();
}

function printSummary() {
  console.log("\nWhatsApp capture summary:");
  console.log(`  Received: ${stats.received}`);
  console.log(`  Captured: ${stats.captured}`);
  console.log(`  Duplicates: ${stats.duplicates}`);
  console.log(`  Invalid: ${stats.invalid}`);
  console.log(`  Failed: ${stats.failed}`);
  console.log(`  Skipped: ${stats.skipped}\n`);
}

async function sendToCapture(message: {
  waMessageId: string;
  groupJid: string;
  groupName?: string;
  senderJid: string;
  senderName?: string;
  text: string;
  messageAt: string;
}) {
  try {
    const res = await fetch(`${MAIN_APP_URL}/api/whatsapp/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CRON_SECRET}`,
      },
      body: JSON.stringify(message),
    });
    const data = await res.json() as CaptureResponse;

    stats.captured += data.created ?? 0;
    stats.duplicates += data.duplicates ?? 0;
    stats.invalid += data.invalid ?? 0;
    stats.failed += data.errors ?? 0;

    console.log(`[capture] ${res.status} — ${data.message ?? ""} (${message.waMessageId})`);
  } catch (err) {
    stats.failed += 1;
    console.error("[capture] Request failed:", err);
  }
}

async function connectToWhatsApp() {
  const { state, saveCreds } = await createMultiFileAuthState("./session");
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`Using WA v${version.join(".")}${isLatest ? "" : " (update available)"}`);

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    // Never print QR — we either use pairing code or handle QR manually
    printQRInTerminal: false,
  });

  let pairingCodeRequested = false;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Request pairing code on first QR emission — WS is open and ready at this point
    if (qr && WA_PHONE_NUMBER && !pairingCodeRequested && !sock.authState.creds.registered) {
      pairingCodeRequested = true;
      try {
        const digits = WA_PHONE_NUMBER.replace(/[^0-9]/g, "");
        const code = await sock.requestPairingCode(digits);
        console.log(`\nPairing code: ${code}`);
        console.log("Enter this in WhatsApp → Settings → Linked Devices → Link with Phone Number\n");
      } catch (err) {
        console.error("Failed to request pairing code:", err);
      }
      return;
    }

    // If no phone number configured, print QR manually
    if (qr && !WA_PHONE_NUMBER) {
      const { default: qrcode } = await import("qrcode-terminal");
      qrcode.generate(qr, { small: true });
    }

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
        const rows = Object.values(groups as Record<string, GroupMetadata>).map((group) => ({ name: group.subject, jid: group.id }));
        console.log("\nGroups you are in:\n");
        rows.forEach((r) => console.log(`  ${r.jid}  ${r.name}`));
        console.log(`\nSet WATCHED_GROUP_JIDS=${rows.map((r) => r.jid).join(",")} in .env, then restart without LIST_GROUPS=true\n`);
        process.exit(0);
      }

      const groups = await sock.groupFetchAllParticipating();
  Object.values(groups as Record<string, GroupMetadata>).forEach((group) => groupNames.set(group.id, group.subject));

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
      stats.received += 1;

      if (msg.key.fromMe) continue;

      const jid = msg.key.remoteJid;
      if (!jid) continue;

      // Only process group messages
      if (!jid.endsWith("@g.us")) continue;

      // Filter to watched groups if configured
      if (WATCHED_GROUP_JIDS.length > 0 && !WATCHED_GROUP_JIDS.includes(jid)) continue;

      const text = getMessageText(msg.message).trim();

      if (!text) {
        stats.skipped += 1;
        continue;
      }

      const messageId = msg.key.id;
      const senderJid = msg.key.participant || msg.participant;
      if (!messageId || !senderJid) {
        stats.skipped += 1;
        continue;
      }

      console.log(`[msg] ${jid} → ${text.slice(0, 100)}${text.length > 100 ? "..." : ""}`);
      await sendToCapture({
        waMessageId: `${jid}:${messageId}`,
        groupJid: jid,
        groupName: groupNames.get(jid),
        senderJid,
        senderName: msg.pushName || undefined,
        text,
        messageAt: getMessageDate(msg.messageTimestamp).toISOString(),
      });
    }
  });
}

process.on("SIGINT", () => {
  printSummary();
  process.exit(0);
});

process.on("SIGTERM", () => {
  printSummary();
  process.exit(0);
});

connectToWhatsApp().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
