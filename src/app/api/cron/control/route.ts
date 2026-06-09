import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const CRON_KEY = "cron_active";

async function getCronActive(): Promise<boolean> {
  const setting = await prisma.appSetting.findUnique({ where: { key: CRON_KEY } });
  if (!setting) return true; // default to active
  return setting.value !== "false";
}

export async function GET() {
  const active = await getCronActive();
  return NextResponse.json({ active });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;
    if (!action || (action !== "start" && action !== "stop")) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const active = action === "start";
    await prisma.appSetting.upsert({
      where: { key: CRON_KEY },
      update: { value: String(active) },
      create: { key: CRON_KEY, value: String(active) },
    });

    return NextResponse.json({ active });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
