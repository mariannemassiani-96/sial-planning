import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { T_DEFAULTS, applyCustomT } from "@/lib/sial-data";

/**
 * Phase 1-C : GET /api/taches
 * Retourne la liste des temps unitaires.
 * - Si la table est vide → seed avec T_DEFAULTS au passage.
 * - Cache `revalidate: 60` côté Next pour limiter la charge BDD.
 */
export const revalidate = 60;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    let taches = await prisma.tache.findMany({ orderBy: { ordre: "asc" } });

    // Seed initial : si vide → on insère les T_DEFAULTS comme repères calibrables.
    if (taches.length === 0) {
      const seedData = Object.entries(T_DEFAULTS).map(([nom, val], i) => ({
        nom,
        temps_unitaire: val,
        unite:          "min",
        categorie:      "production",
        parallelisable: false,
        ordre:          i,
        actif:          true,
      }));
      await prisma.tache.createMany({ data: seedData, skipDuplicates: true });
      taches = await prisma.tache.findMany({ orderBy: { ordre: "asc" } });
    }

    // Side-effect : alimenter le `T` global du runtime côté serveur pour
    // que tout calcul subséquent utilise les nouvelles valeurs.
    const customT: Record<string, number> = {};
    for (const t of taches) {
      if (t.actif && t.temps_unitaire > 0) customT[t.nom] = t.temps_unitaire;
    }
    applyCustomT(customT);

    return NextResponse.json(taches);
  } catch (e) {
    console.error("[/api/taches GET]", e);
    return NextResponse.json({ error: "Erreur de lecture" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const data = await req.json();
    const t = await prisma.tache.create({
      data: {
        nom:            String(data.nom || ""),
        temps_unitaire: parseFloat(String(data.temps_unitaire || 0)) || 0,
        unite:          String(data.unite || "min"),
        categorie:      String(data.categorie || "production"),
        parallelisable: !!data.parallelisable,
        competences:    Array.isArray(data.competences) ? data.competences : [],
        ordre:          parseInt(String(data.ordre || 0)) || 0,
        actif:          data.actif !== false,
      },
    });
    return NextResponse.json(t, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "Erreur création", details: String(e) }, { status: 500 });
  }
}
