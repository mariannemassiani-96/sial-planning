import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const semaine = searchParams.get("semaine");
  if (!semaine) return NextResponse.json({ error: "Paramètre semaine manquant" }, { status: 400 });
  const rec = await (prisma as any).planningPoste.findUnique({ where: { semaine } });
  return NextResponse.json(rec?.plan ?? {});
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const semaine = searchParams.get("semaine");
  if (!semaine) return NextResponse.json({ error: "Paramètre semaine manquant" }, { status: 400 });
  const plan = await req.json();
  const result = await (prisma as any).planningPoste.upsert({
    where: { semaine },
    update: { plan, updatedAt: new Date() },
    create: { semaine, plan },
  });
  return NextResponse.json(result);
}
