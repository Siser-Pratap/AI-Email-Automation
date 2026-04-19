import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const templates = await prisma.emailTemplate.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(templates);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { type, subject, body: templateBody } = body;

    if (!type || !subject || !templateBody) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const template = await prisma.emailTemplate.upsert({
      where: { type },
      update: { subject, body: templateBody },
      create: { type, subject, body: templateBody },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create or update template" }, { status: 500 });
  }
}
