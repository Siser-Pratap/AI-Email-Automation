import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const storageDir = path.join(process.cwd(), "public", "resumes");
const metaPath = path.join(process.cwd(), "resumes_meta.json");

function readMeta() {
  try {
    if (!fs.existsSync(metaPath)) return [];
    const raw = fs.readFileSync(metaPath, "utf-8");
    return JSON.parse(raw || "[]");
  } catch (e) {
    return [];
  }
}

function writeMeta(arr: any[]) {
  fs.writeFileSync(metaPath, JSON.stringify(arr, null, 2));
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const meta = readMeta();
    const idx = meta.findIndex((m: any) => m.id === id);
    if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const rec = meta[idx];
    const filePath = path.join(storageDir, rec.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    meta.splice(idx, 1);
    writeMeta(meta);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
