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
const CAPTURE_HISTORY_ON_START = process.env.CAPTURE_HISTORY_ON_START !== "false";
const CAPTURE_SINCE_HOURS = Number(process.env.CAPTURE_SINCE_HOURS ?? process.env.ANALYZE_SINCE_HOURS ?? "24");
const DEBUG_CAPTURE = process.env.DEBUG_CAPTURE === "true";

const WATCHED_GROUP_JIDS = (process.env.WATCHED_GROUP_JIDS || "")
  .split(",")
  .map((j) => j.trim())
  .filter(Boolean);

const groupNames = new Map<string, string>();
const stats = {
  received: 0,
  historyReceived: 0,
  captured: 0,
  duplicates: 0,
  invalid: 0,
  failed: 0,
  skipped: {
    fromMe: 0,
    noJid: 0,
    nonGroup: 0,
    unwatchedGroup: 0,
    tooOld: 0,
    noText: 0,
    noMessageIdOrSender: 0,
  },
};

const seenGroups = new Set<string>();
const capturedByGroup = new Map<string, number>();
const historyByGroup = new Map<string, number>();

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

function getCaptureSinceDate() {
  const safeHours = Number.isFinite(CAPTURE_SINCE_HOURS) && CAPTURE_SINCE_HOURS > 0 ? CAPTURE_SINCE_HOURS : 24;
  return new Date(Date.now() - safeHours * 60 * 60 * 1000);
}

function printSummary() {
  console.log("\nWhatsApp capture summary:");
  console.log(`  Received: ${stats.received}`);
  console.log(`  History received: ${stats.historyReceived}`);
  console.log(`  Captured: ${stats.captured}`);
  console.log(`  Duplicates: ${stats.duplicates}`);
  console.log(`  Invalid: ${stats.invalid}`);
  console.log(`  Failed: ${stats.failed}`);
  console.log("  Skipped:");
  Object.entries(stats.skipped).forEach(([reason, count]) => console.log(`    ${reason}: ${count}`));

  if (historyByGroup.size > 0 || capturedByGroup.size > 0) {
    console.log("  Group activity:");
    Array.from(new Set([...historyByGroup.keys(), ...capturedByGroup.keys()]))
      .sort()
      .forEach((jid) => {
        console.log(`    ${groupNames.get(jid) ?? jid}: history=${historyByGroup.get(jid) ?? 0}, captured=${capturedByGroup.get(jid) ?? 0}`);
      });
  }

  console.log("");
}

function incrementMap(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function debugSkip(reason: keyof typeof stats.skipped, jid?: string, detail?: string) {
  stats.skipped[reason] += 1;
  if (DEBUG_CAPTURE) {
    console.log(`[skip:${reason}] ${jid ?? "unknown"}${detail ? ` — ${detail}` : ""}`);
  }
}

async function processMessage(msg: proto.IWebMessageInfo, source: "live" | "history") {
  if (source === "live") {
    stats.received += 1;
  } else {
    stats.historyReceived += 1;
  }

  if (msg.key.fromMe) {
    debugSkip("fromMe", msg.key.remoteJid ?? undefined);
    return;
  }

  const jid = msg.key.remoteJid;
  if (!jid) {
    debugSkip("noJid");
    return;
  }

  seenGroups.add(jid);
  if (source === "history") incrementMap(historyByGroup, jid);

  if (!jid.endsWith("@g.us")) {
    debugSkip("nonGroup", jid);
    return;
  }

  if (WATCHED_GROUP_JIDS.length > 0 && !WATCHED_GROUP_JIDS.includes(jid)) {
    debugSkip("unwatchedGroup", jid);
    return;
  }

  const messageAt = getMessageDate(msg.messageTimestamp);
  if (messageAt < getCaptureSinceDate()) {
    debugSkip("tooOld", jid, messageAt.toISOString());
    return;
  }

  const text = getMessageText(msg.message).trim();

  if (!text) {
    debugSkip("noText", jid);
    return;
  }

  const messageId = msg.key.id;
  const senderJid = msg.key.participant || msg.participant;
  if (!messageId || !senderJid) {
    debugSkip("noMessageIdOrSender", jid);
    return;
  }

  console.log(`[${source === "history" ? "history" : "msg"}] ${jid} → ${text.slice(0, 100)}${text.length > 100 ? "..." : ""}`);
  await sendToCapture({
    waMessageId: `${jid}:${messageId}`,
    groupJid: jid,
    groupName: groupNames.get(jid),
    senderJid,
    senderName: msg.pushName || undefined,
    text,
    messageAt: messageAt.toISOString(),
  });
  incrementMap(capturedByGroup, jid);
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
    syncFullHistory: CAPTURE_HISTORY_ON_START,
    shouldSyncHistoryMessage: () => CAPTURE_HISTORY_ON_START,
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
      const replaced = reason === DisconnectReason.connectionReplaced;
      const badSession = reason === DisconnectReason.badSession;

      if (replaced) {
        console.error("Connection replaced by another WhatsApp Web/Baileys session. Stop other collectors or linked web sessions, then restart this service.");
        printSummary();
        process.exit(1);
      }

      if (loggedOut || badSession) {
        console.error(`Connection closed (reason: ${reason}). Delete or move ./session, unlink this device in WhatsApp, then pair again.`);
        printSummary();
        process.exit(1);
      }

      console.log(`Connection closed (reason: ${reason}). Reconnecting in 3s...`);
      setTimeout(connectToWhatsApp, 3000);
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
      Object.values(groups as Record<string, GroupMetadata>).forEach((group) => groupNames.set(group.id, group.subject || group.id));
      console.log(`Participating groups: ${groupNames.size}`);
      if (DEBUG_CAPTURE) {
        Object.entries(groups as Record<string, GroupMetadata>)
          .sort(([, left], [, right]) => (left.subject || left.id).localeCompare(right.subject || right.id))
          .forEach(([jid, group]) => {
            const watched = WATCHED_GROUP_JIDS.length === 0 || WATCHED_GROUP_JIDS.includes(jid);
            console.log(`  ${watched ? "watching" : "not watching"} ${jid} ${group.subject || "(no subject)"}`);
          });
      }

      if (WATCHED_GROUP_JIDS.length === 0) {
        console.warn("[warn] WATCHED_GROUP_JIDS is empty — all group messages will be processed.");
        console.warn("[warn] Run `npm run list-groups` to find your group JIDs.");
      } else {
        console.log(`Watching ${WATCHED_GROUP_JIDS.length} group(s): ${WATCHED_GROUP_JIDS.join(", ")}`);
      }

      if (CAPTURE_HISTORY_ON_START) {
        console.log(`History capture enabled for messages from the last ${Number.isFinite(CAPTURE_SINCE_HOURS) ? CAPTURE_SINCE_HOURS : 24} hour(s), when WhatsApp/Baileys provides history sync events.`);
      }
    }
  });

  sock.ev.on("messaging-history.set", async ({ messages }) => {
    if (!CAPTURE_HISTORY_ON_START) return;

    for (const msg of messages) {
      await processMessage(msg, "history");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify" && (!CAPTURE_HISTORY_ON_START || type !== "append")) return;

    for (const msg of messages) {
      await processMessage(msg, type === "append" ? "history" : "live");
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
