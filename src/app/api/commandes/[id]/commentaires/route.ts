import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const rows = await prisma.commentaire.findMany({
    where: { commandeId: params.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(rows);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const { texte } = await req.json();
  if (!texte?.trim()) return NextResponse.json({ error: "Texte vide" }, { status: 400 });
  const row = await prisma.commentaire.create({
    data: {
      commandeId: params.id,
      auteur: (session.user as any)?.name || session.user?.email || "Inconnu",
      texte: texte.trim(),
    },
  });
  return NextResponse.json(row, { status: 201 });
}
