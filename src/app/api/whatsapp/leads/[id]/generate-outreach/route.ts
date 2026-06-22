import { NextResponse } from "next/server";
import { generateText } from "ai";
import { groq } from "@ai-sdk/groq";
import { prisma } from "@/lib/prisma";

type OutreachPlan = {
  type: string;
  channel: string;
  instruction: string;
  includeSubject: boolean;
};

function getOutreachPlan(category: string, emailType: string | null, outreachChannel: string | null): OutreachPlan {
  if (category === "REFERRAL_EMAIL_FOUND" || category === "HIRING_POST") {
    return {
      type: emailType ?? "APPLICATION",
      channel: "email",
      includeSubject: true,
      instruction: "Write a concise referral or job application email. Keep it warm, specific, and under 150 words.",
    };
  }

  if (category === "SERVICE_PROSPECT") {
    return {
      type: "SERVICE_INTRO",
      channel: outreachChannel === "LinkedIn" ? "LinkedIn" : "WhatsApp",
      includeSubject: false,
      instruction: "Write a short WhatsApp or LinkedIn intro offering software development help. Avoid sounding salesy. Keep it under 70 words.",
    };
  }

  if (category === "PEER_NETWORKING") {
    return {
      type: "CONNECTION_NOTE",
      channel: outreachChannel ?? "LinkedIn",
      includeSubject: false,
      instruction: "Write a friendly connection note for a peer in the same field. Keep it under 50 words.",
    };
  }

  if (category === "FOUNDER_OR_DECISION_MAKER") {
    return {
      type: "SERVICE_PITCH",
      channel: outreachChannel ?? "LinkedIn",
      includeSubject: false,
      instruction: "Write a concise service pitch for a founder or decision maker. Mention software, web, SaaS, or AI automation help only when relevant. Keep it under 80 words.",
    };
  }

  if (category === "COLLABORATION") {
    return {
      type: "COLLABORATION_INTRO",
      channel: outreachChannel ?? "LinkedIn",
      includeSubject: false,
      instruction: "Write a collaborative intro message for a potential partner, freelancer, consultant, or agency contact. Keep it under 70 words.",
    };
  }

  return {
    type: "MANUAL_RESEARCH_NOTE",
    channel: outreachChannel ?? "manual research",
    includeSubject: false,
    instruction: "Write a cautious manual-review note summarizing why this may be worth researching. Keep it under 60 words.",
  };
}

function parseGeneratedText(text: string, includeSubject: boolean) {
  if (!includeSubject) {
    return { subject: null, body: text.trim() };
  }

  const lines = text.trim().split("\n").map((line) => line.trim()).filter(Boolean);
  const subjectLine = lines.find((line) => /^subject\s*:/i.test(line));
  const subject = subjectLine?.replace(/^subject\s*:/i, "").trim() || null;
  const body = lines
    .filter((line) => line !== subjectLine)
    .join("\n")
    .replace(/^body\s*:/i, "")
    .trim();

  return { subject, body: body || text.trim() };
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const lead = await prisma.whatsAppLead.findUnique({
      where: { id },
      include: { message: true },
    });

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (lead.reviewStatus === "DISCARDED" || lead.category === "IGNORE") {
      return NextResponse.json({ error: "Discarded or ignored leads cannot generate outreach" }, { status: 400 });
    }

    const plan = getOutreachPlan(lead.category, lead.emailType, lead.outreachChannel);
    const prompt = `You are generating a draft outreach message for review only. Do not claim prior relationships or invent facts.

${plan.instruction}

${plan.includeSubject ? "Return the result as:\nSubject: <short subject>\n<body>" : "Return only the message body."}

Lead category: ${lead.category}
Target channel: ${plan.channel}
Person: ${lead.personName ?? "Unknown"}
Company: ${lead.companyName ?? "Unknown"}
Role: ${lead.role ?? "Unknown"}
Location: ${lead.location ?? "Unknown"}
Email type: ${lead.emailType ?? "None"}
Recommended action: ${lead.recommendedAction ?? "None"}
Notes: ${lead.notes ?? "None"}
Extracted emails: ${lead.emails.join(", ") || "None"}
Extracted phones: ${lead.phones.join(", ") || "None"}
LinkedIn: ${lead.linkedinUrls.join(", ") || "None"}
Website: ${lead.websiteUrls.join(", ") || "None"}

Original WhatsApp message:
"""
${lead.message.text}
"""`;

    const { text } = await generateText({
      model: groq(process.env.WHATSAPP_OUTREACH_MODEL ?? process.env.WHATSAPP_ANALYZER_MODEL ?? "llama-3.3-70b-versatile"),
      temperature: 0.3,
      prompt,
    });

    const generated = parseGeneratedText(text, plan.includeSubject);
    const updatedLead = await prisma.whatsAppLead.update({
      where: { id },
      data: {
        outreachSubject: generated.subject,
        outreachBody: generated.body,
        outreachType: plan.type,
        outreachChannel: plan.channel,
        outreachGeneratedAt: new Date(),
      },
      include: { message: true },
    });

    return NextResponse.json(updatedLead);
  } catch (error) {
    console.error("WhatsApp outreach generation failed:", error);
    return NextResponse.json({ error: "Failed to generate outreach" }, { status: 500 });
  }
}