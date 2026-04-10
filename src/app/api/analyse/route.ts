import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/analyse?from=2026-04-06&to=2026-04-10
// Retourne les pointages de la période pour analyse
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const from = req.nextUrl.searchParams.get("from") || "";
  const to = req.nextUrl.searchParams.get("to") || "";

  // Charger tous les pointages de la période
  const records = await prisma.planningPoste.findMany({
    where: {
      semaine: { gte: `pointage_${from}`, lte: `pointage_${to}` },
    },
  });

  const days: Array<{ date: string; data: any }> = [];
  for (const rec of records) {
    if (!rec.semaine.startsWith("pointage_")) continue;
    const date = rec.semaine.replace("pointage_", "");
    days.push({ date, data: rec.plan });
  }

  return NextResponse.json({ days });
}
