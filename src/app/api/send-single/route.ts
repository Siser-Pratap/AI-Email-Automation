import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, replaceTemplateVariables } from "@/lib/email";
import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  let entryId = null;
  try {
    const { id } = await req.json();
    entryId = id;
    if (!id) return NextResponse.json({ error: "Missing entry ID" }, { status: 400 });

    const entry = await prisma.emailEntry.findUnique({ where: { id } });
    if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    if (entry.status === "BACKLOG") return NextResponse.json({ error: "Cannot send emails that are in backlog" }, { status: 400 });

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
    
    console.log(`[SEND-SINGLE] Entry: ${entry.id}, Type: ${entry.emailType}, IsFollowUp: ${isFollowUp}, ReplyToMessageId: ${replyToMessageId || "none"}`);

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
        messageId: response.messageId // Save the returned message-id for future follow-ups
      },
    });

    await prisma.emailLog.create({
      data: { emailEntryId: entry.id, status: "SUCCESS", response: "Sent manually via dashboard" },
    });

    return NextResponse.json({ message: "Email sent successfully", id: entry.id });
  } catch (error: any) {
    console.error("Send Single Error:", error);
    if (entryId) {
      await prisma.emailEntry.update({
        where: { id: entryId },
        data: { status: "FAILED" },
      });
      await prisma.emailLog.create({
        data: { emailEntryId: entryId, status: "FAILURE", response: error.message },
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
