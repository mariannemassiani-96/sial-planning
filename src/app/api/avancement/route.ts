import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const date      = searchParams.get("date");
  const commandeId = searchParams.get("commandeId");
  const from      = searchParams.get("from");
  const to        = searchParams.get("to");

  const where: any = {};
  if (date)       where.date = date;
  if (commandeId) where.commandeId = commandeId;
  if (from && to) where.date = { gte: from, lte: to };

  const entries = await prisma.avancementJournalier.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return NextResponse.json(entries);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const data = await req.json();
  const entry = await prisma.avancementJournalier.create({
    data: {
      date:       data.date || new Date().toISOString().split("T")[0],
      operateur:  data.operateur || (session.user as any)?.name || "inconnu",
      tacheId:    data.tacheId || "",
      commandeId: data.commandeId || null,
      quantite:   parseFloat(data.quantite) || 0,
      notes:      data.notes || null,
    },
  });
  return NextResponse.json(entry, { status: 201 });
}
