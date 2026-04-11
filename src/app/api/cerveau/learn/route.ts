import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runWeeklyAnalysis } from "@/lib/cerveau";

export async function POST(request: Request) {
  // Allow internal cron calls (with secret) or admin users
  const authHeader = request.headers.get("authorization");
  const isInternalCron = authHeader === `Bearer ${process.env.BACKUP_SECRET}`;

  if (!isInternalCron) {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any)?.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
  }

  try {
    const results = await runWeeklyAnalysis();

    return NextResponse.json({
      ok: true,
      analysis: results,
      triggeredAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cerveau/learn] Erreur analyse hebdomadaire:", error);
    return NextResponse.json(
      {
        error: "Erreur lors de l'analyse hebdomadaire",
        details: error instanceof Error ? error.message : "Erreur inconnue",
      },
      { status: 500 }
    );
  }
}
