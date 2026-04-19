import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, replaceTemplateVariables } from "@/lib/email";
import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  try {
    const now = new Date();
    
    // Pick all pending entries
    const pendingEmails = await prisma.emailEntry.findMany({
      where: {
        status: "PENDING",
        scheduledAt: { lte: now },
      },
    });

    if (pendingEmails.length === 0) {
      return NextResponse.json({ message: "No pending emails found." });
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
          name: entry.name || "there",
          jobId: entry.jobId || "",
        };

        const subject = replaceTemplateVariables(template.subject, variables);
        const body = replaceTemplateVariables(template.body, variables);

        const attachments = [];
        const resumePath = path.join(process.cwd(), "Siser_Pratap_Software_Developer.pdf");
        
        if (fs.existsSync(resumePath)) {
          attachments.push({
            filename: "Siser_Pratap_Software_Developer.pdf",
            path: resumePath,
            contentType: "application/pdf",
          });
        }

        // Determine if this should be a threaded reply or standalone email
        const isFollowUp = entry.emailType === "FOLLOWUP";
        const replyToMessageId = isFollowUp ? entry.messageId || undefined : undefined;
        
        console.log(`[SEND-PENDING] Entry: ${entry.id}, Type: ${entry.emailType}, IsFollowUp: ${isFollowUp}, ReplyToMessageId: ${replyToMessageId || "none"}`);

        const response = await sendEmail({
          to: entry.hrEmail,
          subject,
          html: body,
          attachments,
          // Only FOLLOWUP emails should use threading (reply to original message)
          // All other email types (REFERRAL, APPLICATION, INTEREST) are new standalone emails
          replyToMessageId,
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
          data: {
            retryCount: newRetryCount,
            status: newStatus,
          },
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

    return NextResponse.json({ message: `Processed ${pendingEmails.length} emails.`, results });
  } catch (error: any) {
    console.error("Process Pending Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
