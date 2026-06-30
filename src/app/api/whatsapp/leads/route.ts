import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function getStringParam(url: URL, key: string) {
  const value = url.searchParams.get(key);
  return value && value !== "ALL" ? value : undefined;
}

function getMinConfidence(url: URL) {
  const rawValue = url.searchParams.get("minConfidence");
  if (!rawValue) return undefined;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : undefined;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const category = getStringParam(url, "category");
    const reviewStatus = getStringParam(url, "reviewStatus");
    const groupJid = getStringParam(url, "groupJid");
    const contactType = getStringParam(url, "contactType");
    const minConfidence = getMinConfidence(url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "100"), 500);

    const contactFilter = contactType === "EMAIL"
      ? { emails: { isEmpty: false } }
      : contactType === "PHONE"
        ? { phones: { isEmpty: false } }
        : contactType === "LINKEDIN"
          ? { linkedinUrls: { isEmpty: false } }
          : contactType === "WEBSITE"
            ? { websiteUrls: { isEmpty: false } }
            : undefined;

    const leads = await prisma.whatsAppLead.findMany({
      where: {
        ...(category ? { category } : {}),
        ...(reviewStatus ? { reviewStatus } : {}),
        ...(minConfidence !== undefined ? { confidence: { gte: minConfidence } } : {}),
        ...(contactFilter ?? {}),
        ...(groupJid ? { message: { is: { groupJid } } } : {}),
      },
      include: { message: true },
      orderBy: { createdAt: "desc" },
      take: Number.isFinite(limit) && limit > 0 ? limit : 100,
    });

    const groups = await prisma.whatsAppMessage.findMany({
      where: { lead: { isNot: null } },
      distinct: ["groupJid"],
      select: { groupJid: true, groupName: true },
      orderBy: { groupName: "asc" },
    });

    return NextResponse.json({ leads, groups });
  } catch (error) {
    console.error("WhatsApp leads fetch failed:", error);
    return NextResponse.json({ error: "Failed to fetch WhatsApp leads" }, { status: 500 });
  }
}