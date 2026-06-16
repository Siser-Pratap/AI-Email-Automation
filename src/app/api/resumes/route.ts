import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const resumes = await prisma.resume.findMany({ orderBy: { uploadedAt: "desc" } });
  return NextResponse.json(resumes);
}

export async function POST(req: Request) {
  try {
    const { title, description, driveUrl } = await req.json();
    if (!title || !driveUrl) {
      return NextResponse.json({ error: "title and driveUrl are required" }, { status: 400 });
    }
    const record = await prisma.resume.create({ data: { title, description: description || "", driveUrl } });
    return NextResponse.json(record, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
