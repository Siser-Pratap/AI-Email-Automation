import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const emails = await prisma.emailEntry.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(emails);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch emails" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { hrEmail, companyName, role, emailType, notes, scheduledAt } = body;

    if (!hrEmail || !role || !emailType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const emailEntry = await prisma.emailEntry.create({
      data: {
        hrEmail,
        companyName,
        role,
        emailType,
        notes,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      },
    });

    return NextResponse.json(emailEntry, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create email entry" }, { status: 500 });
  }
}
