import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const leadCategorySchema = z.enum([
  "REFERRAL_EMAIL_FOUND",
  "HIRING_POST",
  "SERVICE_PROSPECT",
  "PEER_NETWORKING",
  "FOUNDER_OR_DECISION_MAKER",
  "COLLABORATION",
  "RESOURCE_OR_COMMUNITY",
  "LOW_SIGNAL",
  "IGNORE",
]);

const reviewStatusSchema = z.enum(["PENDING_REVIEW", "APPROVED", "DISCARDED"]);
const emailTypeSchema = z.enum(["REFERRAL", "APPLICATION", "INTEREST"]);

const optionalTextSchema = z.string().trim().min(1).nullable().optional();
const textListSchema = z.array(z.string().trim().min(1)).optional();

const leadAnalysisSchema = z.object({
  category: leadCategorySchema,
  tags: textListSchema,
  confidence: z.number().min(0).max(1),
  personName: optionalTextSchema,
  companyName: optionalTextSchema,
  role: optionalTextSchema,
  location: optionalTextSchema,
  emails: textListSchema,
  phones: textListSchema,
  linkedinUrls: textListSchema,
  websiteUrls: textListSchema,
  twitterUrls: textListSchema,
  githubUrls: textListSchema,
  portfolioUrls: textListSchema,
  recommendedAction: optionalTextSchema,
  outreachChannel: optionalTextSchema,
  emailType: emailTypeSchema.nullable().optional(),
  notes: optionalTextSchema,
  reviewStatus: reviewStatusSchema.optional(),
});

const analysisItemSchema = z.object({
  messageId: z.string().trim().min(1).optional(),
  waMessageId: z.string().trim().min(1).optional(),
  analysis: leadAnalysisSchema,
  createEmailEntry: z.boolean().optional(),
}).refine((value) => value.messageId || value.waMessageId, {
  message: "messageId or waMessageId is required",
});

type AnalysisItem = z.infer<typeof analysisItemSchema>;

type AnalysisResult = {
  waMessageId?: string;
  messageId?: string;
  leadId?: string;
  emailEntryId?: string;
  duplicateEmailEntryIds?: string[];
  duplicateLeadIds?: string[];
  status: "saved" | "invalid" | "not_found" | "error";
  error?: string;
};

const emailPattern = /^[\w.%+\-]+@[\w.\-]+\.[a-zA-Z]{2,}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeNullable(value: string | null | undefined) {
  return value?.trim() || null;
}

function normalizeList(values: string[] | undefined, normalizeValue: (value: string) => string = (value) => value.trim()) {
  return Array.from(new Set((values ?? []).map(normalizeValue).filter(Boolean)));
}

function normalizeEmails(values: string[] | undefined) {
  return normalizeList(values, (value) => value.trim().toLowerCase()).filter((value) => emailPattern.test(value));
}

async function maybeCreateEmailEntry(item: AnalysisItem, message: { id: string; text: string }, emails: string[], existingEmailEntryId: string | null | undefined) {
  const { analysis } = item;

  if (!item.createEmailEntry || existingEmailEntryId || analysis.reviewStatus !== "APPROVED") {
    return undefined;
  }

  const hrEmail = emails[0];
  if (!hrEmail || !analysis.emailType) {
    return undefined;
  }

  const duplicate = await prisma.emailEntry.findFirst({
    where: { hrEmail },
    select: { id: true },
  });

  if (duplicate) {
    return undefined;
  }

  return prisma.emailEntry.create({
    data: {
      hrEmail,
      companyName: normalizeNullable(analysis.companyName) ?? undefined,
      role: normalizeNullable(analysis.role) ?? "Unknown",
      name: normalizeNullable(analysis.personName) ?? undefined,
      emailType: analysis.emailType,
      notes: normalizeNullable(analysis.notes) ?? normalizeNullable(analysis.recommendedAction) ?? undefined,
      status: "PENDING",
      source: "WHATSAPP",
      reviewStatus: "APPROVED",
      rawText: message.text,
    },
  });
}

async function processAnalysis(rawItem: unknown): Promise<AnalysisResult> {
  const parsed = analysisItemSchema.safeParse(rawItem);
  if (!parsed.success) {
    return { status: "invalid", error: "Invalid analysis payload" };
  }

  const item = parsed.data;

  try {
    const message = item.messageId
      ? await prisma.whatsAppMessage.findUnique({ where: { id: item.messageId } })
      : await prisma.whatsAppMessage.findUnique({ where: { waMessageId: item.waMessageId } });

    if (!message) {
      return { status: "not_found", messageId: item.messageId, waMessageId: item.waMessageId };
    }

    const emails = normalizeEmails(item.analysis.emails);
    const duplicateEmailEntries = emails.length > 0
      ? await prisma.emailEntry.findMany({
        where: { hrEmail: { in: emails } },
        select: { id: true },
      })
      : [];

    const existingDuplicateLeads = emails.length > 0
      ? await prisma.whatsAppLead.findMany({
        where: {
          messageId: { not: message.id },
          emails: { hasSome: emails },
        },
        select: { id: true },
      })
      : [];

    const leadData = {
      category: item.analysis.category,
      tags: normalizeList(item.analysis.tags),
      confidence: item.analysis.confidence,
      personName: normalizeNullable(item.analysis.personName),
      companyName: normalizeNullable(item.analysis.companyName),
      role: normalizeNullable(item.analysis.role),
      location: normalizeNullable(item.analysis.location),
      emails,
      phones: normalizeList(item.analysis.phones),
      linkedinUrls: normalizeList(item.analysis.linkedinUrls),
      websiteUrls: normalizeList(item.analysis.websiteUrls),
      twitterUrls: normalizeList(item.analysis.twitterUrls),
      githubUrls: normalizeList(item.analysis.githubUrls),
      portfolioUrls: normalizeList(item.analysis.portfolioUrls),
      recommendedAction: normalizeNullable(item.analysis.recommendedAction),
      outreachChannel: normalizeNullable(item.analysis.outreachChannel),
      emailType: item.analysis.emailType ?? null,
      notes: normalizeNullable(item.analysis.notes),
      reviewStatus: item.analysis.reviewStatus ?? "PENDING_REVIEW",
    };

    let lead = await prisma.whatsAppLead.upsert({
      where: { messageId: message.id },
      create: {
        messageId: message.id,
        ...leadData,
      },
      update: leadData,
    });

    const emailEntry = await maybeCreateEmailEntry(item, message, emails, lead.emailEntryId);
    if (emailEntry) {
      lead = await prisma.whatsAppLead.update({
        where: { id: lead.id },
        data: { emailEntryId: emailEntry.id },
      });
    }

    await prisma.whatsAppMessage.update({
      where: { id: message.id },
      data: { analyzedAt: new Date() },
    });

    return {
      status: "saved",
      messageId: message.id,
      waMessageId: message.waMessageId,
      leadId: lead.id,
      emailEntryId: emailEntry?.id ?? lead.emailEntryId ?? undefined,
      duplicateEmailEntryIds: duplicateEmailEntries.map((entry) => entry.id),
      duplicateLeadIds: existingDuplicateLeads.map((duplicateLead) => duplicateLead.id),
    };
  } catch (error) {
    console.error("WhatsApp lead analysis save failed:", error);
    return { status: "error", messageId: item.messageId, waMessageId: item.waMessageId, error: "Failed to save analysis" };
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

  const rawItems = isRecord(body) && Array.isArray(body.analyses) ? body.analyses : [body];
  const results = await Promise.all(rawItems.map(processAnalysis));

  const saved = results.filter((result) => result.status === "saved").length;
  const invalid = results.filter((result) => result.status === "invalid").length;
  const notFound = results.filter((result) => result.status === "not_found").length;
  const errors = results.filter((result) => result.status === "error").length;

  return NextResponse.json({
    message: "WhatsApp lead analyses processed",
    saved,
    invalid,
    notFound,
    errors,
    results,
  }, { status: errors > 0 ? 207 : 200 });
}