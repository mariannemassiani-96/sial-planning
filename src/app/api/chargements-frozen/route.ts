import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// ── Stockage via PlanningPoste key-value ────────────────────────────────
// clé : "chargements_frozen_{semaine}" → snapshot des chargements figés

// GET /api/chargements-frozen?semaine=YYYY-MM-DD (lundi)
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const semaine = searchParams.get("semaine");
    if (!semaine) return NextResponse.json({ error: "Paramètre semaine manquant" }, { status: 400 });

    const key = `chargements_frozen_${semaine}`;
    const rec = await (prisma as any).planningPoste.findUnique({ where: { semaine: key } });
    return NextResponse.json(rec?.plan ?? null);
  } catch {
    return NextResponse.json({ error: "Erreur chargement" }, { status: 500 });
  }
}

// POST /api/chargements-frozen  body: { semaine, snapshot }
//   → fige la semaine avec le snapshot donné
// DELETE ?semaine=YYYY-MM-DD → défige
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const { semaine, snapshot } = await req.json();
    if (!semaine || !snapshot) return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });

    const key = `chargements_frozen_${semaine}`;
    const frozenAt = new Date().toISOString();
    const frozenBy = (session.user as any)?.name || "inconnu";
    const plan = { ...snapshot, _frozenAt: frozenAt, _frozenBy: frozenBy };

    const result = await (prisma as any).planningPoste.upsert({
      where: { semaine: key },
      update: { plan, updatedAt: new Date() },
      create: { semaine: key, plan },
    });
    return NextResponse.json(result.plan);
  } catch {
    return NextResponse.json({ error: "Erreur sauvegarde" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const semaine = searchParams.get("semaine");
    if (!semaine) return NextResponse.json({ error: "Paramètre manquant" }, { status: 400 });

    const key = `chargements_frozen_${semaine}`;
    await (prisma as any).planningPoste.delete({ where: { semaine: key } }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Erreur suppression" }, { status: 500 });
  }
}
