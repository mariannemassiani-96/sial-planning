import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { JOURS_FERIES } from "@/lib/sial-data";

function affKey(monday: string) { return `aff_${monday}`; }
function localStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { semaine } = await req.json();
  if (!semaine) return NextResponse.json({ error: "semaine requis" }, { status: 400 });

  try {
    const rec = await prisma.planningPoste.findUnique({ where: { semaine: affKey(semaine) } });
    if (!rec?.plan) return NextResponse.json({ cleaned: 0 });

    const plan = rec.plan as Record<string, any>;
    let cleaned = 0;

    for (const key of Object.keys(plan)) {
      const parts = key.split("|");
      if (parts.length < 3) continue;
      const jIdx = parseInt(parts[1]);
      if (isNaN(jIdx) || jIdx < 0 || jIdx > 6) continue;
      const dayD = new Date(semaine + "T12:00:00");
      dayD.setDate(dayD.getDate() + jIdx);
      const ds = localStr(dayD);
      if (JOURS_FERIES[ds]) {
        delete plan[key];
        cleaned++;
      }
    }

    // Aussi nettoyer _livreurs pour les dates fériées
    if (plan._livreurs && typeof plan._livreurs === "object") {
      for (const lk of Object.keys(plan._livreurs)) {
        const date = lk.split("|")[0];
        if (JOURS_FERIES[date]) {
          delete plan._livreurs[lk];
          cleaned++;
        }
      }
    }

    if (cleaned > 0) {
      await prisma.planningPoste.update({
        where: { semaine: affKey(semaine) },
        data: { plan },
      });
    }

    return NextResponse.json({ cleaned, message: `${cleaned} entrée(s) nettoyée(s) pour les jours fériés` });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "erreur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
