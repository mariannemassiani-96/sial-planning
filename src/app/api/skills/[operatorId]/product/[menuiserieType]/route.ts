import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// PATCH /api/skills/[operatorId]/product/[menuiserieType] — met à jour le niveau produit
export async function PATCH(
  req: NextRequest,
  { params }: { params: { operatorId: string; menuiserieType: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if ((session.user as { role?: string })?.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin requis" }, { status: 403 });
  }

  const { level } = await req.json();
  const userName = (session.user as { name?: string })?.name ?? "unknown";

  if (level === 0) {
    await prisma.operatorSkill.deleteMany({
      where: { operatorId: params.operatorId, workPostId: null, menuiserieType: params.menuiserieType },
    });
    return NextResponse.json({ ok: true });
  }

  const existing = await prisma.operatorSkill.findFirst({
    where: { operatorId: params.operatorId, workPostId: null, menuiserieType: params.menuiserieType },
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
        workPostId: null,
        menuiserieType: params.menuiserieType,
        level,
        updatedBy: userName,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
