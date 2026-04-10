import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

const BRAIN_KEY = "__cerveau_state__";

// GET /api/cerveau — Retourne l'état du cerveau (pré-calculé par le cron)
// Le cron /api/cerveau/learn tourne chaque nuit et met à jour l'état.
// Ce GET est rapide car il lit juste l'état persistant.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  try {
    const rec = await prisma.planningPoste.findUnique({ where: { semaine: BRAIN_KEY } });
    if (!rec?.plan) {
      return NextResponse.json({
        stats: { nbPointages: 0, nbEntries: 0, periodeFrom: "", periodeTo: "" },
        tempsAppris: [], operateurs: [], alertes: [],
        message: "Le cerveau n'a pas encore appris. Il se met à jour automatiquement chaque nuit à 3h, ou lancez manuellement /api/cerveau/learn",
      });
    }

    const brain = rec.plan as any;
    return NextResponse.json({
      stats: {
        nbPointages: brain.nbPointages || 0,
        nbEntries: brain.nbEntries || 0,
        periodeFrom: brain.periodeFrom || "",
        periodeTo: brain.periodeTo || "",
        lastUpdate: brain.lastUpdate || "",
        totalHeuresPointees: brain.totalHeuresPointees || 0,
        totalTachesFaites: brain.totalTachesFaites || 0,
      },
      tempsAppris: brain.tempsAppris || [],
      tempsRecommandes: brain.tempsRecommandes || {},
      operateurs: brain.operateurs || [],
      opPostScores: brain.opPostScores || {},
      alertes: brain.alertes || [],
      habits: brain.habits || {},
      topRaisonsGlobales: brain.topRaisonsGlobales || [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
