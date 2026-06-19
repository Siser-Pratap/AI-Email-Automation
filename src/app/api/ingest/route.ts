import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { groq } from "@ai-sdk/groq";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const parsedDataSchema = z.object({
  hrEmail: z.string().nullable(),
  companyName: z.string().nullable(),
  role: z.string().nullable(),
  name: z.string().nullable(),
  emailType: z.enum(["REFERRAL", "APPLICATION", "INTEREST"]),
  notes: z.string().nullable(),
});

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { rawText?: string; source?: string; parsedData?: z.infer<typeof parsedDataSchema> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { rawText, source = "MANUAL", parsedData } = body;

  if (!rawText && !parsedData) {
    return NextResponse.json({ error: "rawText or parsedData required" }, { status: 400 });
  }

  // Rate limit: max 20 auto-ingested entries per hour per source
  if (source !== "MANUAL") {
    const key = `rate_limit_${source}`;
    const now = Date.now();
    const windowMs = 60 * 60 * 1000;

    const setting = await prisma.appSetting.findUnique({ where: { key } });
    let count = 0;
    let windowStart = now;

    if (setting) {
      const stored = JSON.parse(setting.value) as { count: number; windowStart: number };
      if (now - stored.windowStart < windowMs) {
        count = stored.count;
        windowStart = stored.windowStart;
      }
    }

    if (count >= 20) {
      return NextResponse.json({ message: "Rate limit exceeded for this source, try again later" }, { status: 429 });
    }

    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value: JSON.stringify({ count: count + 1, windowStart }) },
      update: { value: JSON.stringify({ count: count + 1, windowStart }) },
    });
  }

  let extracted: z.infer<typeof parsedDataSchema>;

  if (parsedData) {
    const result = parsedDataSchema.safeParse(parsedData);
    if (!result.success) {
      return NextResponse.json({ error: "Invalid parsedData", details: result.error.flatten() }, { status: 400 });
    }
    extracted = result.data;
  } else {
    try {
      const { object } = await generateObject({
        model: groq("llama-3.3-70b-versatile"),
        schema: parsedDataSchema,
        prompt: `Extract the following from this message. Recruiters often write emails as "name[at]company[dot]com" or "name AT company DOT com" — normalize these to standard email format.
Fields: hrEmail (string or null), companyName (string or null), role (string or null), name (string or null), emailType ("REFERRAL" | "APPLICATION" | "INTEREST"), notes (string or null)

Message:
"""
${rawText}
"""`,
      });
      extracted = object;
    } catch (err) {
      console.error("GPT-4o parsing failed:", err);
      return NextResponse.json({ error: "Failed to parse message" }, { status: 500 });
    }
  }

  if (!extracted.hrEmail || !/^[\w.%+\-]+@[\w.\-]+\.[a-zA-Z]{2,}$/.test(extracted.hrEmail)) {
    return NextResponse.json({ message: "No valid email found, entry discarded" }, { status: 200 });
  }

  const duplicate = await prisma.emailEntry.findFirst({
    where: {
      hrEmail: extracted.hrEmail,
      status: { in: ["PENDING", "SENT"] },
    },
  });

  if (duplicate) {
    return NextResponse.json({ message: "Duplicate entry, skipped" }, { status: 200 });
  }

  const entry = await prisma.emailEntry.create({
    data: {
      hrEmail: extracted.hrEmail,
      companyName: extracted.companyName ?? undefined,
      role: extracted.role ?? "Unknown",
      name: extracted.name ?? undefined,
      emailType: extracted.emailType,
      notes: extracted.notes ?? undefined,
      status: "PENDING",
      source,
      reviewStatus: "PENDING_REVIEW",
      rawText: rawText ?? undefined,
    },
  });

  return NextResponse.json({ message: "Entry created", id: entry.id }, { status: 201 });
}
