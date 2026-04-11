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
    if (!semaine) return NextResponse.json({ error: "Paramètre semaine manquant" }, { status: 400 });
    const plan = await (prisma as any).planningRH.findUnique({ where: { semaine } });
    if (!plan) return NextResponse.json(null, { status: 404 });
    return NextResponse.json(plan);
  } catch {
    return NextResponse.json({ error: "Erreur chargement planning RH" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const data = await req.json();
    const { semaine, plan, valide } = data;
    const result = await (prisma as any).planningRH.upsert({
      where: { semaine },
      update: { plan, valide: valide ?? false, updatedAt: new Date() },
      create: { semaine, plan, valide: valide ?? false },
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Erreur sauvegarde planning RH" }, { status: 500 });
  }
}
