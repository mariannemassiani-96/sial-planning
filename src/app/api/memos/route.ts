import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Auto-migration
let migDone = false;
async function ensureTable() {
  if (migDone) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MemoAction" (
        "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "auteur" TEXT NOT NULL,
        "texte" TEXT NOT NULL,
        "type" TEXT NOT NULL DEFAULT 'memo',
        "priorite" TEXT NOT NULL DEFAULT 'normale',
        "statut" TEXT NOT NULL DEFAULT 'ouvert',
        "echeance" TEXT,
        "assigneA" TEXT,
        "commandeId" TEXT,
        "poste" TEXT,
        "metadata" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    migDone = true;
  } catch {}
}

// GET — liste les mémos/tâches (filtre par statut optionnel)
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  try {
    await ensureTable();
    const { searchParams } = new URL(req.url);
    const statut = searchParams.get("statut");

    const rows = statut
      ? await prisma.$queryRaw`
          SELECT * FROM "MemoAction" WHERE "statut" = ${statut} ORDER BY "createdAt" DESC LIMIT 100
        `
      : await prisma.$queryRaw`
          SELECT * FROM "MemoAction" ORDER BY "createdAt" DESC LIMIT 100
        `;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: "Erreur chargement mémos" }, { status: 500 });
  }
}

// POST — créer un mémo/tâche
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  try {
    await ensureTable();
    const data = await req.json();
    const auteur = data.auteur || (session.user as any)?.name || "inconnu";

    const rows = await prisma.$queryRaw`
      INSERT INTO "MemoAction" ("id", "auteur", "texte", "type", "priorite", "statut", "echeance", "assigneA", "commandeId", "poste", "metadata", "updatedAt")
      VALUES (
        gen_random_uuid()::text,
        ${auteur},
        ${data.texte || ""},
        ${data.type || "memo"},
        ${data.priorite || "normale"},
        ${data.statut || "ouvert"},
        ${data.echeance || null},
        ${data.assigneA || null},
        ${data.commandeId || null},
        ${data.poste || null},
        ${data.metadata ? JSON.stringify(data.metadata) : null}::jsonb,
        NOW()
      )
      RETURNING *
    `;
    return NextResponse.json((rows as any[])[0], { status: 201 });
  } catch {
    return NextResponse.json({ error: "Erreur création mémo" }, { status: 500 });
  }
}

// PATCH — mettre à jour un mémo (statut, etc.)
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  try {
    await ensureTable();
    const data = await req.json();
    if (!data.id) return NextResponse.json({ error: "ID manquant" }, { status: 400 });

    const rows = await prisma.$queryRaw`
      UPDATE "MemoAction"
      SET "statut" = COALESCE(${data.statut ?? null}, "statut"),
          "priorite" = COALESCE(${data.priorite ?? null}, "priorite"),
          "assigneA" = COALESCE(${data.assigneA ?? null}, "assigneA"),
          "echeance" = COALESCE(${data.echeance ?? null}, "echeance"),
          "texte" = COALESCE(${data.texte ?? null}, "texte"),
          "metadata" = COALESCE(${data.metadata ? JSON.stringify(data.metadata) : null}::jsonb, "metadata"),
          "updatedAt" = NOW()
      WHERE "id" = ${data.id}
      RETURNING *
    `;
    if ((rows as any[]).length === 0) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
    return NextResponse.json((rows as any[])[0]);
  } catch {
    return NextResponse.json({ error: "Erreur mise à jour" }, { status: 500 });
  }
}
