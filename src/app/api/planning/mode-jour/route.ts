import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export async function GET() {
  const date = todayStr();
  const config = await prisma.dayConfig.findUnique({ where: { date } });
  return NextResponse.json({ date, mode: config?.mode ?? "FRAPPES" });
}

export async function PUT(req: Request) {
  const { mode } = await req.json();
  if (mode !== "COULISSANTS" && mode !== "FRAPPES") {
    return NextResponse.json({ error: "mode invalide" }, { status: 400 });
  }
  const date = todayStr();
  const config = await prisma.dayConfig.upsert({
    where: { date },
    update: { mode },
    create: { date, mode },
  });
  return NextResponse.json({ date, mode: config.mode });
}
