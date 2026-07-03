import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const data = await req.json();
    const update: Record<string, unknown> = {};
    if (data.nom !== undefined) update.nom = String(data.nom);
    if (data.temps_unitaire !== undefined) update.temps_unitaire = parseFloat(String(data.temps_unitaire)) || 0;
    if (data.unite !== undefined) update.unite = String(data.unite);
    if (data.categorie !== undefined) update.categorie = String(data.categorie);
    if (data.parallelisable !== undefined) update.parallelisable = !!data.parallelisable;
    if (data.competences !== undefined) update.competences = data.competences;
    if (data.ordre !== undefined) update.ordre = parseInt(String(data.ordre)) || 0;
    if (data.actif !== undefined) update.actif = !!data.actif;

    const t = await prisma.tache.update({ where: { id: params.id }, data: update });
    return NextResponse.json(t);
  } catch (e) {
    return NextResponse.json({ error: "Erreur mise à jour", details: String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await prisma.tache.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "Erreur suppression", details: String(e) }, { status: 500 });
  }
}
