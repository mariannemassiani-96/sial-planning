import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * POST /api/planning-aj/copy  body { from, to }
 *   Duplique la semaine `from` dans la semaine `to`. Écrase `to` si elle
 *   existe déjà. Réinitialise les quantités "réalisées" à vide (on garde
 *   uniquement la trame : étapes + chantiers + qtés théoriques).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  let body: { from?: string; to?: string; keepRealise?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (!body.from || !body.to) {
    return NextResponse.json({ error: "from + to requis" }, { status: 400 });
  }

  try {
    const src = await prisma.planningAJ.findUnique({ where: { semaine: body.from } });
    if (!src) return NextResponse.json({ error: `semaine ${body.from} introuvable` }, { status: 404 });

    // On duplique en profondeur et on efface qte_reel + note par défaut.
    const cloned = JSON.parse(JSON.stringify(src.data)) as {
      etapes?: string[]; chantiers_extra?: string[];
      cells?: Record<string, Array<Record<string, unknown>>>;
    };
    if (!body.keepRealise && cloned.cells) {
      for (const key of Object.keys(cloned.cells)) {
        cloned.cells[key] = cloned.cells[key].map(item => ({
          ...item,
          qte_reel: "",
          note: "",
        }));
      }
    }

    const row = await prisma.planningAJ.upsert({
      where: { semaine: body.to },
      create: { semaine: body.to, data: cloned as any },
      update: { data: cloned as any },
    });
    return NextResponse.json({ ok: true, semaine: row.semaine, updatedAt: row.updatedAt });
  } catch (e) {
    console.error("[/api/planning-aj/copy]", e);
    return NextResponse.json({ error: "Erreur BDD", details: String(e) }, { status: 500 });
  }
}
