import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const date = todayStr();
  const config = await prisma.dayConfig.findUnique({ where: { date } });
  return NextResponse.json({ date, mode: config?.mode ?? "FRAPPES" });
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

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
