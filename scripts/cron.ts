import cron from "node-cron";
import { prisma } from "../src/lib/prisma";
import { sendEmail, replaceTemplateVariables } from "../src/lib/email";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

// Run at 9:00 AM, Monday to Thursday
// Format: 0 9 * * 1-4
cron.schedule("0 9 * * 1-4", async () => {
  console.log("Running scheduled email cron job...");
  
  try {
    const now = new Date();
    
    // Pick pending entries scheduled up to now
    const pendingEmails = await prisma.emailEntry.findMany({
      where: {
        status: "PENDING",
        scheduledAt: { lte: now },
      },
      take: 50,
    });

    if (pendingEmails.length === 0) {
      console.log("No emails to send.");
      return;
    }

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

        const response = await sendEmail({
          to: entry.hrEmail,
          subject,
          html: body,
          attachments,
          // Only FOLLOWUP emails should use threading (reply to original message)
          // All other email types (REFERRAL, APPLICATION, INTEREST) are new standalone emails
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

        console.log(`Successfully sent email to ${entry.hrEmail}`);
      } catch (error: any) {
        console.error(`Failed to send email to ${entry.hrEmail}:`, error.message);
        
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
      }
    }
  } catch (error) {
    console.error("Cron script error:", error);
  }
});

console.log("Cron job scheduled: Runs at 9:00 AM, Monday to Thursday.");
