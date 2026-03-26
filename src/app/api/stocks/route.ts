import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const stocks = await prisma.stockTampon.findMany();
  const result: Record<string, { actuel: number }> = {};
  stocks.forEach(s => { result[s.id] = { actuel: s.actuel }; });
  return NextResponse.json(result);
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const { id, actuel } = await req.json();
  const stock = await prisma.stockTampon.upsert({
    where: { id },
    update: { actuel: parseFloat(actuel) },
    create: { id, actuel: parseFloat(actuel) },
  });
  return NextResponse.json(stock);
}
