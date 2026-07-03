import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { T_DEFAULTS, resetT } from "@/lib/sial-data";

/**
 * Phase 1-C : POST /api/taches/reset
 * Réinitialise tous les temps unitaires aux valeurs par défaut (T_DEFAULTS).
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const ops: Promise<unknown>[] = [];
    for (const [nom, val] of Object.entries(T_DEFAULTS)) {
      ops.push(prisma.tache.upsert({
        where:  { id: `default-${nom}` },
        create: {
          id:             `default-${nom}`,
          nom,
          temps_unitaire: val,
          unite:          "min",
          categorie:      "production",
          ordre:          0,
          actif:          true,
        },
        update: { temps_unitaire: val, actif: true },
      }));
    }
    await Promise.all(ops);
    resetT();
    return NextResponse.json({ ok: true, count: Object.keys(T_DEFAULTS).length });
  } catch (e) {
    return NextResponse.json({ error: "Erreur reset", details: String(e) }, { status: 500 });
  }
}
