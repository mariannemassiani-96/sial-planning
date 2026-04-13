import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getRoute, getPostesForType } from "@/lib/routage-production";
import { TYPES_MENUISERIE, calcTempsType } from "@/lib/sial-data";

// GET /api/planning/routage — matrice complète ou routage d'un type
// ?type=ob1_pvc&quantite=5  → routage détaillé pour 5 × OB1 PVC
// sans params               → matrice complète (tous les types × 1 unité)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  try {
    const typeId = req.nextUrl.searchParams.get("type");
    const quantite = parseInt(req.nextUrl.searchParams.get("quantite") || "1") || 1;

    if (typeId) {
      const route = getRoute(typeId);
      if (!route) {
        return NextResponse.json({ error: "Type inconnu ou sans routage" }, { status: 404 });
      }
      const temps = calcTempsType(typeId, quantite);
      const etapes = route.steps.map(s => ({
        poste: s.poste,
        dependsOn: s.dependsOn,
        tamponMin: s.tamponMin,
        estimatedMin: temps?.par_poste[s.poste as keyof typeof temps.par_poste] ?? 0,
      }));
      const totalMin = etapes.reduce((s, e) => s + e.estimatedMin, 0);
      return NextResponse.json({ typeId, quantite, etapes, totalMin });
    }

    // Matrice complète
    const matrice = Object.entries(TYPES_MENUISERIE).map(([id, tm]) => {
      const postes = getPostesForType(id);
      const temps = calcTempsType(id, 1);
      return {
        typeId: id,
        label: tm.label,
        famille: tm.famille,
        mat: tm.mat,
        postes,
        parPoste: temps?.par_poste ?? {},
        totalMin: temps?.tTotal ?? 0,
      };
    });
    return NextResponse.json(matrice);
  } catch {
    return NextResponse.json({ error: "Erreur routage" }, { status: 500 });
  }
}
