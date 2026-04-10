import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildHistorique, analyserTemps, analyserOperateurs, detecterAlertes } from "@/lib/cerveau";

// GET /api/cerveau — Analyse complète basée sur l'historique des pointages
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  try {
    // Charger tous les pointages
    const records = await prisma.planningPoste.findMany({
      where: { semaine: { startsWith: "pointage_" } },
      orderBy: { semaine: "asc" },
    });

    const pointages = records.map(r => ({
      date: r.semaine.replace("pointage_", ""),
      entries: (r.plan as any)?.entries || (r.plan as Record<string, any>) || {},
      imprevu: (r.plan as any)?.imprevu || [],
    }));

    // Construire l'historique
    const historique = buildHistorique(pointages);

    // Analyser
    const tempsAppris = analyserTemps(historique);
    const operateurs = analyserOperateurs(historique);
    const alertes = detecterAlertes(historique, tempsAppris, operateurs);

    // Charger les habitudes
    const habitsRec = await prisma.planningPoste.findUnique({ where: { semaine: "aff___habits__" } });
    const habits = (habitsRec?.plan ?? {}) as Record<string, Record<string, number>>;

    return NextResponse.json({
      stats: {
        nbPointages: pointages.length,
        nbEntries: historique.length,
        periodeFrom: pointages[0]?.date || "",
        periodeTo: pointages[pointages.length - 1]?.date || "",
      },
      tempsAppris,
      operateurs,
      alertes,
      habits,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
