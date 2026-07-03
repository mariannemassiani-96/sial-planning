import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * GET  /api/planning-aj?semaine=S25-2026 → { semaine, data, updatedAt }
 * PUT  /api/planning-aj                  body { semaine, data } → upsert
 * POST /api/planning-aj/copy             body { from, to } → duplique une semaine
 *
 * `data` est un JSON libre géré côté client — le serveur ne fait que persister.
 */

const DEFAULT_ETAPES = [
  "Coupe LMT",
  "Coupe LMT/DT",
  "Renfort",
  "Soudure",
  "Montage PVC",
  "Montage ALU",
  "Vitrage",
  "ISULA",
  "Emballage",
];

function emptyData() {
  return { etapes: DEFAULT_ETAPES, chantiers_extra: [], cells: {} };
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const semaine = req.nextUrl.searchParams.get("semaine");
  if (!semaine) {
    return NextResponse.json({ error: "semaine requis" }, { status: 400 });
  }

  try {
    const row = await prisma.planningAJ.findUnique({ where: { semaine } });
    if (!row) {
      // Retour d'un template vide avec les 9 étapes par défaut.
      return NextResponse.json({ semaine, data: emptyData(), updatedAt: null });
    }
    // Sécurité : si data ne contient pas etapes, on complète.
    const data = (row.data && typeof row.data === "object" ? row.data : {}) as Record<string, unknown>;
    if (!Array.isArray(data.etapes) || data.etapes.length === 0) {
      data.etapes = DEFAULT_ETAPES;
    }
    if (!Array.isArray(data.chantiers_extra)) data.chantiers_extra = [];
    if (!data.cells || typeof data.cells !== "object") data.cells = {};
    return NextResponse.json({ semaine: row.semaine, data, updatedAt: row.updatedAt });
  } catch (e) {
    console.error("[/api/planning-aj GET]", e);
    return NextResponse.json({ error: "Erreur BDD", details: String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  let body: { semaine?: string; data?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (!body.semaine || !body.data || typeof body.data !== "object") {
    return NextResponse.json({ error: "semaine + data requis" }, { status: 400 });
  }

  try {
    const row = await prisma.planningAJ.upsert({
      where: { semaine: body.semaine },
      create: { semaine: body.semaine, data: body.data as any },
      update: { data: body.data as any },
    });
    return NextResponse.json({ ok: true, updatedAt: row.updatedAt });
  } catch (e) {
    console.error("[/api/planning-aj PUT]", e);
    return NextResponse.json({ error: "Erreur BDD", details: String(e) }, { status: 500 });
  }
}
