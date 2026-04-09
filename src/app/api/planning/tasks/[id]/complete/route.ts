import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isCheckBlocking } from "@/lib/qc-catalog";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { actualMinutes } = (await req.json()) as { actualMinutes?: number };

  const task = await prisma.productionTask.findUnique({
    where: { id: params.id },
    include: { qcChecks: true },
  });
  if (!task) return NextResponse.json({ error: "Tâche introuvable" }, { status: 404 });

  // Vérifier que les QC bloquants sont tous OK
  const pendingBlocking = task.qcChecks.filter(
    (qc) => isCheckBlocking(qc.qcRef) && qc.result !== "OK"
  );
  if (pendingBlocking.length > 0) {
    return NextResponse.json(
      {
        error: "QC_BLOQUANT_EN_ATTENTE",
        message: `${pendingBlocking.length} contrôle(s) qualité bloquant(s) non validé(s). Valider avant de marquer terminé.`,
        pendingRefs: pendingBlocking.map((q) => q.qcRef),
      },
      { status: 422 }
    );
  }

  const updated = await prisma.productionTask.update({
    where: { id: params.id },
    data: {
      status: "DONE",
      completedAt: new Date(),
      ...(actualMinutes != null ? { actualMinutes } : {}),
    },
    include: { workPost: true },
  });

  return NextResponse.json(updated);
}
