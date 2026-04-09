import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      items: {
        include: {
          tasks: {
            include: {
              workPost: true,
              assignments: { include: { operator: true } },
              qcChecks: true,
            },
            orderBy: { sortOrder: "asc" },
          },
          qcChecks: true,
        },
        orderBy: { id: "asc" },
      },
    },
  });

  if (!order) return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });

  const nonConformities = await prisma.nonConformity.findMany({
    where: { fabItemId: { in: order.items.map((i) => i.id) } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ ...order, nonConformities });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const role = (session.user as { role?: string }).role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "Réservé à l'administrateur" }, { status: 403 });
  }

  const { status } = await req.json();
  const updated = await prisma.order.update({
    where: { id: params.id },
    data: { status },
  });
  return NextResponse.json(updated);
}
