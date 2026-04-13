import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const semaine = searchParams.get("semaine");
    if (!semaine) return NextResponse.json({ error: "semaine requis" }, { status: 400 });
    const row = await (prisma as any).planningIsula.findUnique({ where: { semaine } });
    return NextResponse.json(row ?? null);
  } catch {
    return NextResponse.json({ error: "Erreur chargement planning ISULA" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const { semaine, plan, valide } = await req.json();
    const row = await (prisma as any).planningIsula.upsert({
      where: { semaine },
      update: { plan, valide },
      create: { semaine, plan, valide: valide ?? false },
    });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Erreur sauvegarde planning ISULA" }, { status: 500 });
  }
}
