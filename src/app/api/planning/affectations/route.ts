import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

function affKey(monday: string) { return `aff_${monday}`; }

// GET /api/planning/affectations?semaine=2026-04-06
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const semaine = req.nextUrl.searchParams.get("semaine");
  if (!semaine) return NextResponse.json({ error: "semaine requis" }, { status: 400 });

  const rec = await prisma.planningPoste.findUnique({ where: { semaine: affKey(semaine) } });
  return NextResponse.json(rec?.plan ?? {});
}

// PUT /api/planning/affectations
// Body: { semaine: "2026-04-06", affectations: { "C3|0|am": ["Julien","Laurent"], ... } }
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { semaine, affectations } = await req.json();
  if (!semaine) return NextResponse.json({ error: "semaine requis" }, { status: 400 });

  await prisma.planningPoste.upsert({
    where: { semaine: affKey(semaine) },
    update: { plan: affectations },
    create: { semaine: affKey(semaine), plan: affectations },
  });

  return NextResponse.json({ ok: true });
}
