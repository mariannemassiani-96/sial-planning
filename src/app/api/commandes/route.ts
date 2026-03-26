import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const commandes = await prisma.commande.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(commandes);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const data = await req.json();
  const cmd = await prisma.commande.create({ data });
  return NextResponse.json(cmd, { status: 201 });
}
