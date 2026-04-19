import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, replaceTemplateVariables } from "@/lib/email";
import fs from "fs";
import path from "path";

// Verify cron request (e.g., matching a secret token to prevent unauthorized access)
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    
    // Pick pending entries scheduled up to now
    const pendingEmails = await prisma.emailEntry.findMany({
      where: {
        status: "PENDING",
        scheduledAt: { lte: now },
      },
      take: 50, // Process in batches
    });

    if (pendingEmails.length === 0) {
      return NextResponse.json({ message: "No emails to send" });
    }

    const results = [];

    for (const entry of pendingEmails) {
      try {
        // Fetch template
        const template = await prisma.emailTemplate.findUnique({
          where: { type: entry.emailType },
        });

        if (!template) {
          throw new Error(`Template not found for type: ${entry.emailType}`);
        }

        // Replace variables
        const variables = {
          company: entry.companyName || "your company",
          role: entry.role,
          name: entry.name || "there",
          jobId: entry.jobId || "",
        };

        const subject = replaceTemplateVariables(template.subject, variables);
        const body = replaceTemplateVariables(template.body, variables);

        // Attach Resume if it exists in the project root
        const attachments = [];
        const resumePath = path.join(process.cwd(), "Siser_Pratap_Software_Developer.pdf");
        
        if (fs.existsSync(resumePath)) {
          attachments.push({
            filename: "Siser_Pratap_Software_Developer.pdf",
            path: resumePath,
            contentType: "application/pdf",
          });
        }

        // Send Email
        const response = await sendEmail({
          to: entry.hrEmail,
          subject,
          html: body,
          attachments,
        });

        // Update entry status to SENT
        await prisma.emailEntry.update({
          where: { id: entry.id },
          data: {
            status: "SENT",
            lastSentAt: new Date(),
          },
        });

        // Log success
        await prisma.emailLog.create({
          data: {
            emailEntryId: entry.id,
            status: "SUCCESS",
            response: JSON.stringify(response),
          },
        });

        results.push({ id: entry.id, status: "SUCCESS" });
      } catch (error: any) {
        // Update entry retryCount or mark as FAILED
        const newRetryCount = entry.retryCount + 1;
        const newStatus = newRetryCount >= 3 ? "FAILED" : "PENDING"; // Retry up to 3 times

        await prisma.emailEntry.update({
          where: { id: entry.id },
          data: {
            retryCount: newRetryCount,
            status: newStatus,
          },
        });

        // Log failure
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

    return NextResponse.json({ message: "Processed batch", results });
  } catch (error) {
    console.error("Cron Error:", error);
    return NextResponse.json({ error: "Failed to process cron job" }, { status: 500 });
  }
}
