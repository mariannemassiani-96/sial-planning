import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/lignes-vitrage?date=2026-04-08  OR  ?commandeId=xxx
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const commandeId = searchParams.get("commandeId");
  const weekStart = searchParams.get("weekStart"); // YYYY-MM-DD lundi
  const weekEnd = searchParams.get("weekEnd");

  const where: any = {};
  if (commandeId) where.commandeId = commandeId;
  if (date) where.date_fabrication = date;
  if (weekStart && weekEnd) {
    where.date_fabrication = { gte: weekStart, lte: weekEnd };
  }

  const lignes = await prisma.ligneVitrage.findMany({
    where,
    orderBy: [{ date_fabrication: "asc" }, { coloris_intercalaire: "asc" }, { epaisseur_intercalaire: "asc" }],
  });
  return NextResponse.json(lignes);
}

// POST /api/lignes-vitrage — upsert lignes for a commande
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const data = await req.json();
  // Expect { commandeId, num_commande, client, ref_chantier, date_fabrication, lignes: [...] }
  const { commandeId, num_commande, client, ref_chantier, date_fabrication, lignes } = data;

  if (!commandeId || !Array.isArray(lignes)) {
    return NextResponse.json({ error: "commandeId et lignes requis" }, { status: 400 });
  }

  // Delete existing lignes for this commande then re-create
  await prisma.ligneVitrage.deleteMany({ where: { commandeId } });

  const created = await prisma.ligneVitrage.createMany({
    data: lignes.map((l: any) => ({
      commandeId,
      num_commande: num_commande || null,
      client: client || null,
      ref_chantier: ref_chantier || null,
      composition: l.composition || null,
      quantite: parseInt(l.quantite) || 1,
      position: l.position || null,
      largeur_mm: l.largeur_mm != null ? parseFloat(l.largeur_mm) || null : null,
      hauteur_mm: l.hauteur_mm != null ? parseFloat(l.hauteur_mm) || null : null,
      epaisseur_intercalaire: l.epaisseur_intercalaire || null,
      coloris_intercalaire: l.coloris_intercalaire || null,
      largeur_we: l.largeur_we != null ? parseFloat(l.largeur_we) || null : null,
      hauteur_we: l.hauteur_we != null ? parseFloat(l.hauteur_we) || null : null,
      perimetre_we: l.perimetre_we != null ? parseFloat(l.perimetre_we) || null : null,
      date_fabrication: date_fabrication || null,
    })),
  });

  return NextResponse.json({ count: created.count }, { status: 201 });
}

// DELETE /api/lignes-vitrage?commandeId=xxx
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const commandeId = searchParams.get("commandeId");
  if (!commandeId) return NextResponse.json({ error: "commandeId requis" }, { status: 400 });
  await prisma.ligneVitrage.deleteMany({ where: { commandeId } });
  return NextResponse.json({ ok: true });
}
