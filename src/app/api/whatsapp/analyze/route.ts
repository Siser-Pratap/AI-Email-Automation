import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { extractWhatsAppContacts, type ExtractedWhatsAppContacts } from "@/lib/whatsapp-contact-extractor";

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
  analysis: leadAnalysisSchema.optional(),
  createEmailEntry: z.boolean().optional(),
}).refine((value) => value.messageId || value.waMessageId, {
  message: "messageId or waMessageId is required",
});

type LeadAnalysis = z.infer<typeof leadAnalysisSchema>;

type AnalysisResult = {
  waMessageId?: string;
  messageId?: string;
  leadId?: string;
  emailEntryId?: string;
  duplicateEmailEntryIds?: string[];
  duplicateLeadIds?: string[];
  extractedContacts?: ExtractedWhatsAppContacts;
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

function mergeContactLists(first: string[] | undefined, second: string[] | undefined) {
  return normalizeList([...(first ?? []), ...(second ?? [])]);
}

function buildAnalysis(analysis: LeadAnalysis | undefined, extractedContacts: ExtractedWhatsAppContacts): LeadAnalysis {
  const hasContacts = extractedContacts.emails.length > 0 || extractedContacts.phones.length > 0 || extractedContacts.urls.length > 0;

  return {
    category: analysis?.category ?? (hasContacts ? "LOW_SIGNAL" : "IGNORE"),
    tags: normalizeList(analysis?.tags),
    confidence: analysis?.confidence ?? (hasContacts ? 0.35 : 0.1),
    personName: analysis?.personName,
    companyName: analysis?.companyName,
    role: analysis?.role,
    location: analysis?.location,
    emails: normalizeEmails([...(extractedContacts.emails ?? []), ...(analysis?.emails ?? [])]),
    phones: mergeContactLists(extractedContacts.phones, analysis?.phones),
    linkedinUrls: mergeContactLists(extractedContacts.linkedinUrls, analysis?.linkedinUrls),
    websiteUrls: mergeContactLists(extractedContacts.websiteUrls, analysis?.websiteUrls),
    twitterUrls: mergeContactLists(extractedContacts.twitterUrls, analysis?.twitterUrls),
    githubUrls: mergeContactLists(extractedContacts.githubUrls, analysis?.githubUrls),
    portfolioUrls: mergeContactLists(extractedContacts.portfolioUrls, analysis?.portfolioUrls),
    recommendedAction: analysis?.recommendedAction ?? (hasContacts ? "Review extracted contact details manually." : null),
    outreachChannel: analysis?.outreachChannel,
    emailType: analysis?.emailType,
    notes: analysis?.notes ?? (hasContacts ? `Deterministic contacts extracted. Raw phone matches: ${extractedContacts.phoneRawTexts.join(", ") || "none"}.` : "No deterministic contacts found."),
    reviewStatus: analysis?.reviewStatus ?? "PENDING_REVIEW",
  };
}

async function maybeCreateEmailEntry(createEmailEntry: boolean | undefined, analysis: LeadAnalysis, message: { id: string; text: string }, emails: string[], existingEmailEntryId: string | null | undefined) {
  if (!createEmailEntry || existingEmailEntryId || analysis.reviewStatus !== "APPROVED") {
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

    const extractedContacts = extractWhatsAppContacts(message.text);
    const analysis = buildAnalysis(item.analysis, extractedContacts);
    const emails = normalizeEmails(analysis.emails);
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
      category: analysis.category,
      tags: normalizeList(analysis.tags),
      confidence: analysis.confidence,
      personName: normalizeNullable(analysis.personName),
      companyName: normalizeNullable(analysis.companyName),
      role: normalizeNullable(analysis.role),
      location: normalizeNullable(analysis.location),
      emails,
      phones: normalizeList(analysis.phones),
      linkedinUrls: normalizeList(analysis.linkedinUrls),
      websiteUrls: normalizeList(analysis.websiteUrls),
      twitterUrls: normalizeList(analysis.twitterUrls),
      githubUrls: normalizeList(analysis.githubUrls),
      portfolioUrls: normalizeList(analysis.portfolioUrls),
      recommendedAction: normalizeNullable(analysis.recommendedAction),
      outreachChannel: normalizeNullable(analysis.outreachChannel),
      emailType: analysis.emailType ?? null,
      notes: normalizeNullable(analysis.notes),
      reviewStatus: analysis.reviewStatus ?? "PENDING_REVIEW",
    };

    let lead = await prisma.whatsAppLead.upsert({
      where: { messageId: message.id },
      create: {
        messageId: message.id,
        ...leadData,
      },
      update: leadData,
    });

    const emailEntry = await maybeCreateEmailEntry(item.createEmailEntry, analysis, message, emails, lead.emailEntryId);
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
      extractedContacts,
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