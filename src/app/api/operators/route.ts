import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/operators — liste tous les opérateurs avec leurs compétences
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const operators = await prisma.operator.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: {
      skills: {
        include: { workPost: { select: { id: true, label: true, atelier: true } } },
      },
    },
  });

  return NextResponse.json(operators);
}
