import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { scheduledDate } = (await req.json()) as { scheduledDate: string };

  const task = await prisma.productionTask.findUnique({
    where: { id: params.id },
    include: { workPost: true },
  });
  if (!task) return NextResponse.json({ error: "Tâche introuvable" }, { status: 404 });

  const targetStart = new Date(scheduledDate + "T00:00:00.000Z");
  const targetEnd   = new Date(scheduledDate + "T23:59:59.999Z");

  // Bloquer si grand format bloquant déjà planifié ce jour sur ce poste
  const blockingSpecial = await prisma.productionTask.findFirst({
    where: {
      workPostId: task.workPostId,
      scheduledDate: { gte: targetStart, lte: targetEnd },
      isBlocking: true,
      fabItem: { isSpecial: true },
      id: { not: params.id },
    },
  });

  if (blockingSpecial) {
    return NextResponse.json(
      {
        error: "GRAND_FORMAT_BLOQUANT",
        message: `Un grand format est réservé sur le poste ${task.workPostId} ce jour — déplacement impossible.`,
      },
      { status: 409 }
    );
  }

  // Calculer la charge après déplacement
  const siblingTasks = await prisma.productionTask.findMany({
    where: {
      workPostId: task.workPostId,
      scheduledDate: { gte: targetStart, lte: targetEnd },
      id: { not: params.id },
    },
    select: { estimatedMinutes: true },
  });

  const minutesExisting = siblingTasks.reduce((s, t) => s + t.estimatedMinutes, 0);
  const minutesAfter    = minutesExisting + task.estimatedMinutes;
  const chargePercent   =
    task.workPost.capacityMinDay > 0
      ? Math.round((minutesAfter / task.workPost.capacityMinDay) * 100)
      : 0;

  const updated = await prisma.productionTask.update({
    where: { id: params.id },
    data: { scheduledDate: targetStart },
  });

  return NextResponse.json({
    task: updated,
    chargePercent,
    overloaded: chargePercent > 90,
  });
}
