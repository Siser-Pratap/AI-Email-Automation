import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const lead = await prisma.whatsAppLead.findUnique({
      where: { id },
      include: { message: true },
    });

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (lead.emailEntryId) {
      return NextResponse.json({ message: "Email entry already linked", emailEntryId: lead.emailEntryId });
    }

    if (lead.reviewStatus !== "APPROVED") {
      return NextResponse.json({ error: "Approve the lead before creating an email entry" }, { status: 400 });
    }

    const hrEmail = lead.emails[0];
    if (!hrEmail) {
      return NextResponse.json({ error: "Lead has no email address" }, { status: 400 });
    }

    const duplicate = await prisma.emailEntry.findFirst({
      where: { hrEmail },
      select: { id: true },
    });

    if (duplicate) {
      const updatedLead = await prisma.whatsAppLead.update({
        where: { id },
        data: { emailEntryId: duplicate.id },
      });
      return NextResponse.json({ message: "Existing email entry linked", emailEntryId: updatedLead.emailEntryId });
    }

    const emailEntry = await prisma.emailEntry.create({
      data: {
        hrEmail,
        companyName: lead.companyName ?? undefined,
        role: lead.role ?? "Unknown",
        name: lead.personName ?? undefined,
        emailType: lead.emailType ?? "INTEREST",
        notes: lead.outreachBody ?? lead.notes ?? lead.recommendedAction ?? undefined,
        status: "PENDING",
        source: "WHATSAPP",
        reviewStatus: "APPROVED",
        rawText: lead.message.text,
      },
    });

    await prisma.whatsAppLead.update({
      where: { id },
      data: { emailEntryId: emailEntry.id },
    });

    return NextResponse.json({ message: "Email entry created", emailEntryId: emailEntry.id }, { status: 201 });
  } catch (error) {
    console.error("WhatsApp lead email creation failed:", error);
    return NextResponse.json({ error: "Failed to create email entry" }, { status: 500 });
  }
}