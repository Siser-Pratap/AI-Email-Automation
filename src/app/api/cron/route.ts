import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, replaceTemplateVariables } from "@/lib/email";
import { getBestResumeForRole } from "@/lib/resume-matcher";

async function runCronBatch() {
  const now = new Date();

  const pendingEmails = await prisma.emailEntry.findMany({
    where: {
      status: "PENDING",
      scheduledAt: { lte: now },
      OR: [
        { reviewStatus: "AUTO" },
        { reviewStatus: "APPROVED" },
      ],
    },
    take: 50,
  });

  if (pendingEmails.length === 0) {
    return { message: "No emails to send", results: [] };
  }

  const results = [];

  for (const entry of pendingEmails) {
    try {
      const template = await prisma.emailTemplate.findUnique({
        where: { type: entry.emailType },
      });

      if (!template) {
        throw new Error(`Template not found for type: ${entry.emailType}`);
      }

      const variables = {
        company: entry.companyName || "your company",
        role: entry.role,
        name: entry.name || "",
        jobId: entry.jobId || "",
      };

      const subject = replaceTemplateVariables(template.subject, variables);
      const body = replaceTemplateVariables(template.body, variables);

      const attachments = [];
      const resumeAttachment = await getBestResumeForRole(entry.role);
      if (resumeAttachment) {
        attachments.push(resumeAttachment);
      }

      const response = await sendEmail({
        to: entry.hrEmail,
        subject,
        html: body,
        attachments,
        replyToMessageId: entry.emailType === "FOLLOWUP" ? entry.messageId || undefined : undefined,
      });

      await prisma.emailEntry.update({
        where: { id: entry.id },
        data: {
          status: "SENT",
          lastSentAt: new Date(),
          messageId: response.messageId,
        },
      });

      await prisma.emailLog.create({
        data: {
          emailEntryId: entry.id,
          status: "SUCCESS",
          response: JSON.stringify(response),
        },
      });

      results.push({ id: entry.id, status: "SUCCESS" });
    } catch (error: any) {
      const newRetryCount = entry.retryCount + 1;
      const newStatus = newRetryCount >= 3 ? "FAILED" : "PENDING";

      await prisma.emailEntry.update({
        where: { id: entry.id },
        data: { retryCount: newRetryCount, status: newStatus },
      });

      await prisma.emailLog.create({
        data: {
          emailEntryId: entry.id,
          status: "FAILURE",
          response: error.message,
        },
      });

      results.push({ id: entry.id, status: "FAILURE", error: error.message });
    }
  }

  return { message: "Processed batch", results };
}

// Called by Vercel cron scheduler
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const setting = await prisma.appSetting.findUnique({ where: { key: "cron_active" } });
    const active = !setting || setting.value !== "false";
    if (!active) {
      return NextResponse.json({ message: "Cron is paused" });
    }
  } catch (err) {
    console.error("Cron state check failed:", err);
  }

  try {
    const result = await runCronBatch();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Cron Error:", error);
    return NextResponse.json({ error: "Failed to process cron job" }, { status: 500 });
  }
}

// Manual trigger from the dashboard — no secret required, bypasses cron_active
export async function POST() {
  try {
    const result = await runCronBatch();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Cron Error:", error);
    return NextResponse.json({ error: "Failed to process cron job" }, { status: 500 });
  }
}
