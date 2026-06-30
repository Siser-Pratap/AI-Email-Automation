import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, replaceTemplateVariables } from "@/lib/email";
import { getBestResumeForRole } from "@/lib/resume-matcher";

export async function POST(req: Request) {
  let entryId = null;
  try {
    const { id, followUp = false } = await req.json();
    entryId = id;
    if (!id) return NextResponse.json({ error: "Missing entry ID" }, { status: 400 });

    const entry = await prisma.emailEntry.findUnique({ where: { id } });
    if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    if (entry.status === "BACKLOG") return NextResponse.json({ error: "Cannot send emails that are in backlog" }, { status: 400 });

    // A follow-up is a threaded reply to a previously sent email. It requires the
    // original Message-ID so the reply lands in the same thread, and it always uses
    // the FOLLOWUP template (regardless of the entry's original email type).
    if (followUp && !entry.messageId) {
      return NextResponse.json(
        { error: "Cannot follow up: this email has no original Message-ID. Send the original email first." },
        { status: 400 }
      );
    }

    const variables = {
      company: entry.companyName || "your company",
      role: entry.role,
      name: entry.name || "",
      jobId: entry.jobId || "",
    };

    // The template used for the email body: FOLLOWUP template for follow-ups,
    // otherwise the entry's own type template.
    const bodyTemplateType = followUp ? "FOLLOWUP" : entry.emailType;
    const template = await prisma.emailTemplate.findUnique({
      where: { type: bodyTemplateType },
    });

    if (!template) {
      throw new Error(`Template not found for type: ${bodyTemplateType}`);
    }

    let subject = replaceTemplateVariables(template.subject, variables);
    const body = replaceTemplateVariables(template.body, variables);

    // For follow-ups, prefix the original subject with "Re:" so it threads in the
    // recipient's inbox alongside the In-Reply-To/References headers.
    if (followUp) {
      const originalTemplate = await prisma.emailTemplate.findUnique({
        where: { type: entry.emailType },
      });
      const originalSubject = originalTemplate
        ? replaceTemplateVariables(originalTemplate.subject, variables)
        : entry.role;
      subject = originalSubject.toLowerCase().startsWith("re:")
        ? originalSubject
        : `Re: ${originalSubject}`;
    }

    const attachments = [];
    if (!followUp) {
      // Don't re-attach the resume on a follow-up reply.
      const resumeAttachment = await getBestResumeForRole(entry.role);
      if (resumeAttachment) {
        attachments.push(resumeAttachment);
      }
    }

    // Determine if this should be a threaded reply or standalone email.
    // Follow-ups (manual button) and FOLLOWUP-type entries reply to the original message.
    const isThreadedReply = followUp || entry.emailType === "FOLLOWUP";
    const replyToMessageId = isThreadedReply ? entry.messageId || undefined : undefined;

    console.log(`[SEND-SINGLE] Entry: ${entry.id}, Type: ${entry.emailType}, FollowUp: ${followUp}, ReplyToMessageId: ${replyToMessageId || "none"}`);

    const response = await sendEmail({
      to: entry.hrEmail,
      subject,
      html: body,
      attachments,
      replyToMessageId,
    });

    await prisma.emailEntry.update({
      where: { id: entry.id },
      data: followUp
        ? {
            // Keep the original messageId as the thread root so future follow-ups
            // keep replying to the same thread. Just mark the follow-up as done.
            status: "SENT",
            lastSentAt: new Date(),
            followUpDone: true,
            followUpAt: new Date(),
          }
        : {
            status: "SENT",
            lastSentAt: new Date(),
            messageId: response.messageId, // Save the returned message-id for future follow-ups
          },
    });

    await prisma.emailLog.create({
      data: {
        emailEntryId: entry.id,
        status: "SUCCESS",
        response: followUp ? "Follow-up reply sent manually via dashboard" : "Sent manually via dashboard",
      },
    });

    return NextResponse.json({ message: followUp ? "Follow-up reply sent successfully" : "Email sent successfully", id: entry.id });
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
