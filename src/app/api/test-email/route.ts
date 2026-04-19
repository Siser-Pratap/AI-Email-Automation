import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const attachments = [];
    const resumePath = path.join(process.cwd(), "Siser_Pratap_Software_Developer.pdf");
    
    if (fs.existsSync(resumePath)) {
      attachments.push({
        filename: "Siser_Pratap_Software_Developer.pdf",
        path: resumePath,
        contentType: "application/pdf",
      });
    }

    await sendEmail({
      to: email,
      subject: "Test Email from AutoMail.ai",
      html: `
        <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto;">
          <h2>SMTP Test Successful! 🎉</h2>
          <p>Hi there,</p>
          <p>If you are reading this, your Nodemailer and SMTP configuration is perfectly set up and ready to send automated emails.</p>
          ${attachments.length > 0 ? '<p><strong>Your resume PDF has also been successfully attached to this email.</strong></p>' : '<p><em>Note: No resume PDF was found in the project root to attach.</em></p>'}
          <p>Best regards,<br>AutoMail.ai System</p>
        </div>
      `,
      attachments,
    });

    return NextResponse.json({ success: true, message: "Test email sent successfully!" });
  } catch (error: any) {
    console.error("Test Email Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
