import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const storageDir = path.join(process.cwd(), "public", "resumes");
const metaPath = path.join(process.cwd(), "resumes_meta.json");

function ensureStorage() {
  if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
}

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

export async function GET() {
  const list = readMeta();
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, description, filename, fileDataBase64 } = body;
    if (!title || !filename || !fileDataBase64) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    ensureStorage();
    const safeName = `${Date.now()}_${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const targetPath = path.join(storageDir, safeName);

    const buffer = Buffer.from(fileDataBase64, "base64");
    fs.writeFileSync(targetPath, buffer);

    const meta = readMeta();
    const record = {
      id: `${Date.now()}`,
      title,
      description: description || "",
      filename: safeName,
      url: `/resumes/${safeName}`,
      uploadedAt: new Date().toISOString(),
    };
    meta.unshift(record);
    writeMeta(meta);

    return NextResponse.json(record, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
