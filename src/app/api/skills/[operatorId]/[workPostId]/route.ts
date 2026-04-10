import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// PATCH /api/skills/[operatorId]/[workPostId] — met à jour le niveau d'un poste
export async function PATCH(
  req: NextRequest,
  { params }: { params: { operatorId: string; workPostId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { level } = await req.json();
  const userName = (session.user as { name?: string })?.name ?? "unknown";

  if (level === 0) {
    // Supprimer la compétence
    await prisma.operatorSkill.deleteMany({
      where: { operatorId: params.operatorId, workPostId: params.workPostId, menuiserieType: null },
    });
    return NextResponse.json({ ok: true });
  }

  // Upsert la compétence
  const existing = await prisma.operatorSkill.findFirst({
    where: { operatorId: params.operatorId, workPostId: params.workPostId, menuiserieType: null },
  });

  if (existing) {
    await prisma.operatorSkill.update({
      where: { id: existing.id },
      data: { level, updatedBy: userName },
    });
  } else {
    await prisma.operatorSkill.create({
      data: {
        operatorId: params.operatorId,
        workPostId: params.workPostId,
        menuiserieType: null,
        level,
        updatedBy: userName,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
