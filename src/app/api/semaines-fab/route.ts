import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const semaine = searchParams.get("semaine");
  if (semaine) {
    const row = await prisma.semaineValidee.findUnique({ where: { semaine } });
    return NextResponse.json(row || { semaine, valide: false, plan: {} });
  }
  const rows = await prisma.semaineValidee.findMany({ orderBy: { semaine: "desc" }, take: 52 });
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const data = await req.json();
  const { semaine, plan, valide } = data;
  if (!semaine) return NextResponse.json({ error: "semaine manquante" }, { status: 400 });
  const row = await prisma.semaineValidee.upsert({
    where: { semaine },
    update: {
      plan:      plan ?? {},
      valide:    valide ?? false,
      validePar: valide ? (session.user as any)?.email || null : null,
      valideAt:  valide ? new Date() : null,
    },
    create: {
      semaine,
      plan:      plan ?? {},
      valide:    valide ?? false,
      validePar: valide ? (session.user as any)?.email || null : null,
      valideAt:  valide ? new Date() : null,
    },
  });
  return NextResponse.json(row);
}
