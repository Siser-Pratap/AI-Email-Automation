import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const updatedEntry = await prisma.emailEntry.update({
      where: { id },
      data: body,
    });

    return NextResponse.json(updatedEntry);
  } catch (error) {
    return NextResponse.json({ error: "Failed to update email entry" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.emailEntry.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Deleted successfully" });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete email entry" }, { status: 500 });
  }
}
