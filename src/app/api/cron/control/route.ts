import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const statePath = path.join(process.cwd(), "cron_state.json");

function readState() {
  try {
    if (!fs.existsSync(statePath)) return { active: true };
    const raw = fs.readFileSync(statePath, "utf-8");
    return JSON.parse(raw || "{}");
  } catch (e) {
    return { active: true };
  }
}

function writeState(obj: any) {
  try {
    fs.writeFileSync(statePath, JSON.stringify(obj, null, 2));
    return true;
  } catch (e) {
    return false;
  }
}

export async function GET() {
  const state = readState();
  return NextResponse.json({ active: state.active !== false });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body; // 'start' | 'stop'
    if (!action || (action !== "start" && action !== "stop")) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const newState = { active: action === "start" };
    const ok = writeState(newState);
    if (!ok) return NextResponse.json({ error: "Failed to write state" }, { status: 500 });

    return NextResponse.json({ active: newState.active });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
