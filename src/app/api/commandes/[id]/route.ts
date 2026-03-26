import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const cmd = await prisma.commande.findUnique({ where: { id: params.id } });
  if (!cmd) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  return NextResponse.json(cmd);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const data = await req.json();
  const cmd = await prisma.commande.update({ where: { id: params.id }, data });
  return NextResponse.json(cmd);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  await prisma.commande.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
