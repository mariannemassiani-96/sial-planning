import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { QC_CATALOG } from "@/lib/qc-catalog";

interface StepInput {
  workPostId: string;
  label: string;
  estimatedMinutes: number;
  sortOrder: number;
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { steps } = (await req.json()) as { steps: StepInput[] };
  if (!Array.isArray(steps) || steps.length === 0) {
    return NextResponse.json({ error: "steps[] obligatoire et non vide" }, { status: 400 });
  }

  const fabItem = await prisma.fabItem.findUnique({ where: { id: params.id } });
  if (!fabItem) return NextResponse.json({ error: "Article introuvable" }, { status: 404 });

  if (!fabItem.isSpecial) {
    return NextResponse.json({ error: "Constructeur d'étapes réservé aux articles spéciaux" }, { status: 400 });
  }

  const created = await prisma.$transaction(async (tx) => {
    // Supprimer les tâches et QC existants
    const existingTasks = await tx.productionTask.findMany({
      where: { fabItemId: params.id },
      select: { id: true },
    });
    const taskIds = existingTasks.map((t) => t.id);

    if (taskIds.length > 0) {
      await tx.qCCheck.deleteMany({ where: { taskId: { in: taskIds } } });
      await tx.taskAssignment.deleteMany({ where: { taskId: { in: taskIds } } });
      await tx.productionTask.deleteMany({ where: { id: { in: taskIds } } });
    }
    // Supprimer aussi les QC liés directement au fabItem sans taskId
    await tx.qCCheck.deleteMany({ where: { fabItemId: params.id, taskId: null } });

    // Créer les nouvelles tâches
    const newTasks = await Promise.all(
      steps.map((step) =>
        tx.productionTask.create({
          data: {
            fabItemId:        params.id,
            workPostId:       step.workPostId,
            label:            step.label,
            estimatedMinutes: step.estimatedMinutes,
            sortOrder:        step.sortOrder,
            isBlocking:       true, // les spéciaux bloquent le poste
            status:           "PENDING",
          },
        })
      )
    );

    // Générer les QC checks depuis le catalogue pour chaque poste
    const qcData: {
      fabItemId: string;
      taskId: string;
      qcRef: string;
      label: string;
    }[] = [];

    for (const task of newTasks) {
      const catalog = QC_CATALOG[task.workPostId] ?? [];
      for (const def of catalog) {
        qcData.push({
          fabItemId: params.id,
          taskId:    task.id,
          qcRef:     def.qcRef,
          label:     def.label,
        });
      }
    }

    if (qcData.length > 0) {
      await tx.qCCheck.createMany({ data: qcData });
    }

    return newTasks;
  });

  return NextResponse.json({ tasks: created });
}
