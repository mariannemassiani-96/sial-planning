import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

const CERVEAU_KEYS = {
  analysis: "__cerveau_analysis__",
  recommendations: "__cerveau_recommendations__",
  anomalies: "__cerveau_anomalies__",
} as const;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const records = await (prisma as any).planningPoste.findMany({
      where: {
        semaine: { in: Object.values(CERVEAU_KEYS) },
      },
    });

    const dataMap = new Map<string, any>();
    for (const rec of records) {
      dataMap.set(rec.semaine, rec.plan);
    }

    return NextResponse.json({
      analysis: dataMap.get(CERVEAU_KEYS.analysis) ?? null,
      recommendations: dataMap.get(CERVEAU_KEYS.recommendations) ?? [],
      anomalies: dataMap.get(CERVEAU_KEYS.anomalies) ?? [],
    });
  } catch (error) {
    console.error("[cerveau] Erreur lecture données:", error);
    return NextResponse.json(
      { error: "Erreur lors de la lecture des données Cerveau" },
      { status: 500 }
    );
  }
}
