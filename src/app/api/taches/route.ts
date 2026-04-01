import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const taches = await prisma.tache.findMany({ where: { actif: true }, orderBy: { ordre: "asc" } });
  return NextResponse.json(taches);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const data = await req.json();
  const tache = await prisma.tache.create({
    data: {
      nom:            data.nom || "",
      temps_unitaire: parseFloat(data.temps_unitaire) || 0,
      unite:          data.unite || "",
      categorie:      data.categorie || "production",
      parallelisable: data.parallelisable ?? false,
      competences:    data.competences ?? [],
      ordre:          parseInt(data.ordre) || 0,
      actif:          true,
    },
  });
  return NextResponse.json(tache, { status: 201 });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const data = await req.json();
  const { id, ...updates } = data;
  if (!id) return NextResponse.json({ error: "id manquant" }, { status: 400 });
  const tache = await prisma.tache.update({
    where: { id },
    data: {
      ...(updates.nom !== undefined && { nom: updates.nom }),
      ...(updates.temps_unitaire !== undefined && { temps_unitaire: parseFloat(updates.temps_unitaire) }),
      ...(updates.unite !== undefined && { unite: updates.unite }),
      ...(updates.categorie !== undefined && { categorie: updates.categorie }),
      ...(updates.parallelisable !== undefined && { parallelisable: updates.parallelisable }),
      ...(updates.competences !== undefined && { competences: updates.competences }),
      ...(updates.ordre !== undefined && { ordre: parseInt(updates.ordre) }),
      ...(updates.actif !== undefined && { actif: updates.actif }),
    },
  });
  return NextResponse.json(tache);
}
