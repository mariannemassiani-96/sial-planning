import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { reason } = (await req.json()) as { reason: string };
  if (!reason?.trim()) {
    return NextResponse.json({ error: "Raison obligatoire" }, { status: 400 });
  }

  const updated = await prisma.productionTask.update({
    where: { id: params.id },
    data: { status: "BLOCKED", blockedReason: reason.trim() },
  });

  return NextResponse.json(updated);
}
