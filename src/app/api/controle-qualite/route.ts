import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  if (!date) return NextResponse.json({ error: "date requis" }, { status: 400 });
  const row = await (prisma as any).controleQualite.findUnique({ where: { date } });
  return NextResponse.json(row ?? { date, data: {} });
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const { date, data } = await req.json();
  const row = await (prisma as any).controleQualite.upsert({
    where: { date },
    update: { data },
    create: { date, data },
  });
  return NextResponse.json(row);
}
