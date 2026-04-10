import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Clé : pointage_YYYY-MM-DD
function key(date: string) { return `pointage_${date}`; }

// GET /api/pointage-jour?date=2026-04-13
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const date = req.nextUrl.searchParams.get("date");
  if (!date) return NextResponse.json({ error: "date requis" }, { status: 400 });
  const rec = await prisma.planningPoste.findUnique({ where: { semaine: key(date) } });
  return NextResponse.json(rec?.plan ?? {});
}

// PUT /api/pointage-jour
// Body: { date: "2026-04-13", data: { "C3|BAT C": { pct: 100, realMin: 480, ... }, ... } }
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { date, data } = await req.json();
  if (!date) return NextResponse.json({ error: "date requis" }, { status: 400 });
  await prisma.planningPoste.upsert({
    where: { semaine: key(date) },
    update: { plan: data },
    create: { semaine: key(date), plan: data },
  });
  return NextResponse.json({ ok: true });
}
