import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type CaptureResult = {
  waMessageId?: string;
  status: "created" | "duplicate" | "invalid" | "error";
  error?: string;
};

type WhatsAppMessageInput = {
  waMessageId: string;
  groupJid: string;
  groupName?: string;
  senderJid: string;
  senderName?: string;
  text: string;
  messageAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseMessageInput(value: unknown): WhatsAppMessageInput | null {
  if (!isRecord(value)) return null;

  const waMessageId = toOptionalString(value.waMessageId);
  const groupJid = toOptionalString(value.groupJid);
  const senderJid = toOptionalString(value.senderJid);
  const text = toOptionalString(value.text);
  const messageAt = toOptionalString(value.messageAt);

  if (!waMessageId || !groupJid || !senderJid || !text || !messageAt) {
    return null;
  }

  const parsedDate = new Date(messageAt);
  if (Number.isNaN(parsedDate.getTime())) return null;

  return {
    waMessageId,
    groupJid,
    groupName: toOptionalString(value.groupName),
    senderJid,
    senderName: toOptionalString(value.senderName),
    text,
    messageAt: parsedDate.toISOString(),
  };
}

async function saveMessage(input: WhatsAppMessageInput): Promise<CaptureResult> {
  try {
    await prisma.whatsAppMessage.create({
      data: {
        waMessageId: input.waMessageId,
        groupJid: input.groupJid,
        groupName: input.groupName,
        senderJid: input.senderJid,
        senderName: input.senderName,
        text: input.text,
        messageAt: new Date(input.messageAt),
      },
    });

    return { waMessageId: input.waMessageId, status: "created" };
  } catch (error: unknown) {
    if (isRecord(error) && error.code === "P2002") {
      return { waMessageId: input.waMessageId, status: "duplicate" };
    }

    console.error("WhatsApp message capture failed:", error);
    return { waMessageId: input.waMessageId, status: "error", error: "Failed to save message" };
  }
}

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawMessages = isRecord(body) && Array.isArray(body.messages) ? body.messages : [body];
  const results: CaptureResult[] = [];

  for (const rawMessage of rawMessages) {
    const input = parseMessageInput(rawMessage);
    if (!input) {
      results.push({ status: "invalid", error: "Missing or invalid message fields" });
      continue;
    }

    results.push(await saveMessage(input));
  }

  const created = results.filter((result) => result.status === "created").length;
  const duplicates = results.filter((result) => result.status === "duplicate").length;
  const invalid = results.filter((result) => result.status === "invalid").length;
  const errors = results.filter((result) => result.status === "error").length;

  return NextResponse.json({
    message: "WhatsApp messages processed",
    created,
    duplicates,
    invalid,
    errors,
    results,
  }, { status: errors > 0 ? 207 : 200 });
}