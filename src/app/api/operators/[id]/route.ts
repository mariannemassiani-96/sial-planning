import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// PATCH /api/operators/[id] — mise à jour partielle (notes, weekHours, etc.)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.notes !== undefined) data.notes = body.notes;
  if (body.weekHours !== undefined) data.weekHours = body.weekHours;
  if (body.workingDays !== undefined) data.workingDays = body.workingDays;
  if (body.posts !== undefined) data.posts = body.posts;

  const updated = await prisma.operator.update({
    where: { id: params.id },
    data,
    include: {
      skills: {
        include: { workPost: { select: { id: true, label: true, atelier: true } } },
      },
    },
  });

  return NextResponse.json(updated);
}

// POST /api/operators/[id] — sauvegarde complète depuis TutoAJ (config initiale)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json();
  const { weekHours, workingDays, notes, posts, skills } = body;
  const userName = (session.user as { name?: string })?.name ?? "unknown";

  // 1. Mettre à jour l'opérateur
  await prisma.operator.update({
    where: { id: params.id },
    data: {
      ...(weekHours !== undefined && { weekHours }),
      ...(workingDays !== undefined && { workingDays }),
      ...(notes !== undefined && { notes }),
      ...(posts !== undefined && { posts }),
    },
  });

  // 2. Remplacer toutes les compétences
  if (Array.isArray(skills)) {
    await prisma.operatorSkill.deleteMany({ where: { operatorId: params.id } });

    if (skills.length > 0) {
      await prisma.operatorSkill.createMany({
        data: skills.map((s: { workPostId?: string | null; menuiserieType?: string | null; level: number }) => ({
          operatorId: params.id,
          workPostId: s.workPostId ?? null,
          menuiserieType: s.menuiserieType ?? null,
          level: s.level,
          updatedBy: userName,
        })),
      });
    }
  }

  const updated = await prisma.operator.findUnique({
    where: { id: params.id },
    include: {
      skills: {
        include: { workPost: { select: { id: true, label: true, atelier: true } } },
      },
    },
  });

  return NextResponse.json(updated);
}
