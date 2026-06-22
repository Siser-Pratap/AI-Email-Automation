import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const allowedReviewStatuses = new Set(["PENDING_REVIEW", "APPROVED", "DISCARDED"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value.trim() : undefined;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body: unknown = await req.json();
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const reviewStatus = optionalString(body.reviewStatus);
    if (reviewStatus && !allowedReviewStatuses.has(reviewStatus)) {
      return NextResponse.json({ error: "Invalid reviewStatus" }, { status: 400 });
    }

    const updatedLead = await prisma.whatsAppLead.update({
      where: { id },
      data: {
        ...(reviewStatus ? { reviewStatus } : {}),
        ...(optionalString(body.recommendedAction) !== undefined ? { recommendedAction: optionalString(body.recommendedAction) } : {}),
        ...(optionalString(body.notes) !== undefined ? { notes: optionalString(body.notes) } : {}),
      },
      include: { message: true },
    });

    return NextResponse.json(updatedLead);
  } catch (error) {
    console.error("WhatsApp lead update failed:", error);
    return NextResponse.json({ error: "Failed to update WhatsApp lead" }, { status: 500 });
  }
}