import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { groq, type GroqLanguageModelOptions } from "@ai-sdk/groq";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  extractWhatsAppContacts,
  formatWhatsAppContactHints,
  type ExtractedWhatsAppContacts,
} from "@/lib/whatsapp-contact-extractor";

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

const emailTypes = ["REFERRAL", "APPLICATION", "INTEREST"] as const;
type EmailType = (typeof emailTypes)[number];
const leadTags = [
  "software-development",
  "web-development",
  "mobile-app",
  "ai-automation",
  "saas",
  "job-referral",
  "recruiter",
  "agency",
  "startup",
  "founder",
  "remote",
  "india",
  "urgent",
  "cold-outreach",
  "warm-intro",
] as const;
type LeadTag = (typeof leadTags)[number];
type ReviewStatus = "PENDING_REVIEW" | "APPROVED" | "DISCARDED";
type OutreachChannel = "email" | "WhatsApp" | "LinkedIn" | "website form" | "X/Twitter" | "manual research";

const optionalTextSchema = z.string().trim().min(1).nullable().optional();
const textListSchema = z.array(z.string().trim().min(1)).nullable().optional();
const leadTagsSchema = z.array(z.string().trim().min(1)).nullable().optional();

const leadAnalysisSchema = z.object({
  category: leadCategorySchema,
  tags: leadTagsSchema,
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
  outreachChannel: z.string().trim().min(1).nullable().optional(),
  emailType: z.string().trim().min(1).nullable().optional(),
  notes: optionalTextSchema,
  reviewStatus: z.string().trim().min(1).nullable().optional(),
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
  analysisSource?: "provided" | "ai" | "fallback";
  category?: z.infer<typeof leadCategorySchema>;
  confidence?: number;
  status: "saved" | "invalid" | "not_found" | "error";
  error?: string;
};

const emailPattern = /^[\w.%+\-]+@[\w.\-]+\.[a-zA-Z]{2,}$/;
const minLeadConfidence = Number(process.env.MIN_LEAD_CONFIDENCE ?? "0.55");
const whatsAppAnalyzerModel = process.env.WHATSAPP_ANALYZER_MODEL ?? "llama-3.3-70b-versatile";
const useGroqStructuredOutputs = process.env.WHATSAPP_ANALYZER_STRUCTURED_OUTPUTS === "true";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeNullable(value: string | null | undefined) {
  return value?.trim() || null;
}

function normalizeList(values: string[] | null | undefined, normalizeValue: (value: string) => string = (value) => value.trim()) {
  return Array.from(new Set((values ?? []).map(normalizeValue).filter(Boolean)));
}

function normalizeEmails(values: string[] | null | undefined) {
  return normalizeList(values, (value) => value.trim().toLowerCase()).filter((value) => emailPattern.test(value));
}

const leadTagSet = new Set<string>(leadTags);

function normalizeTags(values: string[] | null | undefined) {
  return normalizeList(values, (value) => {
    const tag = value.trim().toLowerCase().replace(/[\s_]+/g, "-");
    if (leadTagSet.has(tag)) return tag;
    if (/react|next|frontend|backend|full-stack|website|web/.test(tag)) return "web-development";
    if (/mobile|android|ios|flutter|react-native/.test(tag)) return "mobile-app";
    if (/ai|automation|agent|llm/.test(tag)) return "ai-automation";
    if (/job|hiring|career|opening/.test(tag)) return "job-referral";
    if (/remote/.test(tag)) return "remote";
    if (/india|indian/.test(tag)) return "india";
    if (/urgent|immediate/.test(tag)) return "urgent";
    return "";
  }).filter((tag): tag is LeadTag => leadTagSet.has(tag));
}

function mergeContactLists(first: string[] | null | undefined, second: string[] | null | undefined) {
  return normalizeList([...(first ?? []), ...(second ?? [])]);
}

function normalizeEmailType(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!normalized) return null;
  if ((emailTypes as readonly string[]).includes(normalized)) return normalized as EmailType;
  if (/REFERRAL|REFER/.test(normalized)) return "REFERRAL";
  if (/APPLICATION|APPLY|JOB/.test(normalized)) return "APPLICATION";
  if (/INTEREST|INTRO|SERVICE/.test(normalized)) return "INTEREST";
  return null;
}

function normalizeOutreachChannel(value: string | null | undefined): OutreachChannel | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "email") return "email";
  if (normalized === "whatsapp" || normalized === "wa") return "WhatsApp";
  if (normalized === "linkedin") return "LinkedIn";
  if (normalized === "website form" || normalized === "web form" || normalized === "contact form") return "website form";
  if (normalized === "x/twitter" || normalized === "twitter" || normalized === "x") return "X/Twitter";
  if (normalized === "manual research" || normalized === "manual") return "manual research";
  return null;
}

function normalizeReviewStatus(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized === "APPROVED" || normalized === "DISCARDED" || normalized === "PENDING_REVIEW") {
    return normalized as ReviewStatus;
  }
  return "PENDING_REVIEW";
}

function buildAnalysis(analysis: LeadAnalysis | undefined, extractedContacts: ExtractedWhatsAppContacts): LeadAnalysis {
  const hasContacts = extractedContacts.emails.length > 0 || extractedContacts.phones.length > 0 || extractedContacts.urls.length > 0;

  return {
    category: analysis?.category ?? (hasContacts ? "LOW_SIGNAL" : "IGNORE"),
    tags: normalizeTags(analysis?.tags),
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
    outreachChannel: normalizeOutreachChannel(analysis?.outreachChannel),
    emailType: normalizeEmailType(analysis?.emailType),
    notes: analysis?.notes ?? (hasContacts ? `Deterministic contacts extracted. Raw phone matches: ${extractedContacts.phoneRawTexts.join(", ") || "none"}.` : "No deterministic contacts found."),
    reviewStatus: normalizeReviewStatus(analysis?.reviewStatus),
  };
}

function hasExtractedContacts(extractedContacts: ExtractedWhatsAppContacts) {
  return extractedContacts.emails.length > 0 || extractedContacts.phones.length > 0 || extractedContacts.urls.length > 0;
}

function applyConfidencePolicy(analysis: LeadAnalysis, extractedContacts: ExtractedWhatsAppContacts): LeadAnalysis {
  if (analysis.category === "IGNORE" || analysis.category === "LOW_SIGNAL" || analysis.confidence >= minLeadConfidence) {
    return analysis;
  }

  return {
    ...analysis,
    category: "LOW_SIGNAL",
    emailType: null,
    recommendedAction: analysis.recommendedAction ?? "Review manually before outreach.",
    notes: [analysis.notes, `Model confidence ${analysis.confidence} is below threshold ${minLeadConfidence}.`]
      .filter(Boolean)
      .join(" "),
    reviewStatus: "PENDING_REVIEW",
    tags: hasExtractedContacts(extractedContacts) ? analysis.tags : [],
  };
}

async function generateLeadAnalysis(message: {
  groupName: string | null;
  senderName: string | null;
  text: string;
  messageAt: Date;
}, extractedContacts: ExtractedWhatsAppContacts) {
  const { object } = await generateObject({
    model: groq(whatsAppAnalyzerModel),
    providerOptions: {
      groq: {
        structuredOutputs: useGroqStructuredOutputs,
      } satisfies GroqLanguageModelOptions,
    },
    schema: leadAnalysisSchema,
    temperature: 0,
    prompt: `Classify this WhatsApp group message for lead intelligence and return valid JSON matching the schema.

  Return a single JSON object. Use these exact key names only: category, tags, confidence, personName, companyName, role, location, emails, phones, linkedinUrls, websiteUrls, twitterUrls, githubUrls, portfolioUrls, recommendedAction, outreachChannel, emailType, notes, reviewStatus.
  Do not use alternate keys such as lead_category, normalized_email, message_summary, contactPoints, or summary.
  Do not invent names, companies, roles, locations, or contact details. Use null or empty arrays when unknown.

Primary category rules:
- REFERRAL_EMAIL_FOUND: message contains an email suitable for referral, job, or application outreach.
- HIRING_POST: someone is hiring or sharing an opening, even if no email is present.
- SERVICE_PROSPECT: person or company may need software development, web, mobile, SaaS, or AI automation services.
- PEER_NETWORKING: person works in a similar field and is worth connecting with.
- FOUNDER_OR_DECISION_MAKER: founder, owner, manager, recruiter, HR, agency lead, or decision maker.
- COLLABORATION: potential partner, freelancer, agency, consultant, or project collaborator.
- RESOURCE_OR_COMMUNITY: useful resource, event, community, or learning signal, but not an immediate lead.
- LOW_SIGNAL: maybe relevant but not enough actionable information.
- IGNORE: spam, unrelated, duplicate-looking forwards, job seeker spam, jokes, or messages with no useful contact path.

Allowed tags: software-development, web-development, mobile-app, ai-automation, saas, job-referral, recruiter, agency, startup, founder, remote, india, urgent, cold-outreach, warm-intro.

Suggested outreach channel must be one of: email, WhatsApp, LinkedIn, website form, X/Twitter, manual research.
Suggested emailType must be REFERRAL, APPLICATION, or INTEREST only when a valid email exists and email outreach is appropriate; otherwise use null.
Confidence must be 0 to 1. Use LOW_SIGNAL or IGNORE for weak messages.
Keep recommendedAction short and directly actionable.

Deterministic contact hints from regex extraction:
${formatWhatsAppContactHints(extractedContacts)}

Message metadata:
Group: ${message.groupName ?? "Unknown"}
Sender: ${message.senderName ?? "Unknown"}
Message time: ${message.messageAt.toISOString()}

Raw message:
"""
${message.text}
"""`,
  });

  return object;
}

function canCreateEmailEntry(analysis: LeadAnalysis, emails: string[]) {
  return emails.length > 0 &&
    Boolean(analysis.emailType) &&
    analysis.reviewStatus === "APPROVED" &&
    analysis.confidence >= minLeadConfidence &&
    analysis.category !== "LOW_SIGNAL" &&
    analysis.category !== "IGNORE";
}

async function maybeCreateEmailEntry(createEmailEntry: boolean | undefined, analysis: LeadAnalysis, message: { id: string; text: string }, emails: string[], existingEmailEntryId: string | null | undefined) {
  if (!createEmailEntry || existingEmailEntryId || !canCreateEmailEntry(analysis, emails)) {
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
    let analysisSource: AnalysisResult["analysisSource"] = item.analysis ? "provided" : "ai";
    let generatedAnalysis = item.analysis;

    if (!generatedAnalysis) {
      try {
        generatedAnalysis = await generateLeadAnalysis(message, extractedContacts);
      } catch (error) {
        analysisSource = "fallback";
        console.error("WhatsApp AI categorization failed, saving deterministic fallback:", error);
      }
    }

    const analysis = applyConfidencePolicy(buildAnalysis(generatedAnalysis, extractedContacts), extractedContacts);
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
      tags: normalizeTags(analysis.tags),
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
      analysisSource,
      category: analysis.category,
      confidence: analysis.confidence,
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