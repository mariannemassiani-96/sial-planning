import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getRoutage, getMatriceRoutage } from "@/lib/routage-production";

// GET /api/planning/routage — matrice complète ou routage d'un type
// ?type=ob1_pvc&quantite=5  → routage détaillé pour 5 × OB1 PVC
// sans params               → matrice complète (tous les types × 1 unité)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const typeId = req.nextUrl.searchParams.get("type");
  const quantite = parseInt(req.nextUrl.searchParams.get("quantite") || "1") || 1;

  if (typeId) {
    const etapes = getRoutage(typeId, quantite);
    if (etapes.length === 0) {
      return NextResponse.json({ error: "Type inconnu ou sans routage" }, { status: 404 });
    }
    const totalMin = etapes.reduce((s, e) => s + e.estimatedMin, 0);
    return NextResponse.json({ typeId, quantite, etapes, totalMin });
  }

  return NextResponse.json(getMatriceRoutage());
}
