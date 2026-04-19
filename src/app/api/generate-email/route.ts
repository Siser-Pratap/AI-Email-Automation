import { NextResponse } from "next/server";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

export async function POST(req: Request) {
  try {
    const { companyName, role, emailType, notes } = await req.json();

    if (!role || !emailType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const prompt = `
      You are an expert HR outreach specialist. Write a professional, concise, and compelling email based on the following details:
      - Company: ${companyName || "Unknown"}
      - Role: ${role}
      - Purpose: ${emailType} (REFERRAL, APPLICATION, or INTEREST)
      - Additional Notes: ${notes || "None"}
      
      Keep it professional, friendly, and under 150 words. Provide only the email body without the subject.
    `;

    const { text } = await generateText({
      model: openai("gpt-4o"),
      prompt,
    });

    return NextResponse.json({ generatedBody: text });
  } catch (error: any) {
    console.error("AI Generation Error:", error);
    return NextResponse.json({ error: "Failed to generate email content" }, { status: 500 });
  }
}
