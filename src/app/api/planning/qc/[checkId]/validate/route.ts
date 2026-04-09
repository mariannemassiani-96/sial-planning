import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isCheckBlocking } from "@/lib/qc-catalog";

export async function POST(
  req: Request,
  { params }: { params: { checkId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { result, value, actionTaken } = (await req.json()) as {
    result: "OK" | "NOK";
    value?: string;
    actionTaken?: string;
  };

  if (result !== "OK" && result !== "NOK") {
    return NextResponse.json({ error: "result invalide" }, { status: 400 });
  }

  const check = await prisma.qCCheck.findUnique({ where: { id: params.checkId } });
  if (!check) return NextResponse.json({ error: "Contrôle introuvable" }, { status: 404 });

  const checkedBy = (session.user as { name?: string }).name ?? "Inconnu";
  const blocking  = isCheckBlocking(check.qcRef);

  const [updatedCheck] = await prisma.$transaction(async (tx) => {
    const updated = await tx.qCCheck.update({
      where: { id: params.checkId },
      data: {
        result,
        value:       value ?? null,
        actionTaken: actionTaken ?? null,
        checkedAt:   new Date(),
        checkedBy,
      },
    });

    const results: [typeof updated, ...unknown[]] = [updated];

    if (result === "NOK") {
      // Créer automatiquement une NonConformity
      await tx.nonConformity.create({
        data: {
          fabItemId:   check.fabItemId,
          qcRef:       check.qcRef,
          description: `QC ${check.qcRef} : ${check.label}${actionTaken ? ` — ${actionTaken}` : ""}`,
          severity:    blocking ? "BLOCKING" : "MINOR",
          status:      "DETECTED",
          action:      actionTaken ?? null,
        },
      });

      // Si contrôle bloquant NOK : bloquer la tâche suivante sur ce fabItem
      if (blocking && check.taskId) {
        const currentTask = await tx.productionTask.findUnique({
          where: { id: check.taskId },
          select: { sortOrder: true, fabItemId: true },
        });

        if (currentTask) {
          const nextTask = await tx.productionTask.findFirst({
            where: {
              fabItemId: currentTask.fabItemId,
              sortOrder: { gt: currentTask.sortOrder },
              status:    { in: ["PENDING", "IN_PROGRESS"] },
            },
            orderBy: { sortOrder: "asc" },
          });

          if (nextTask) {
            await tx.productionTask.update({
              where: { id: nextTask.id },
              data: {
                status:       "BLOCKED",
                blockedReason: `QC bloquant non validé : ${check.qcRef} — ${check.label}`,
              },
            });
          }
        }
      }
    } else if (result === "OK" && blocking && check.taskId) {
      // QC bloquant OK : débloquer la tâche suivante si elle était bloquée pour cette raison
      const currentTask = await tx.productionTask.findUnique({
        where: { id: check.taskId },
        select: { sortOrder: true, fabItemId: true },
      });

      if (currentTask) {
        const nextTask = await tx.productionTask.findFirst({
          where: {
            fabItemId:    currentTask.fabItemId,
            sortOrder:    { gt: currentTask.sortOrder },
            status:       "BLOCKED",
            blockedReason: { contains: check.qcRef },
          },
          orderBy: { sortOrder: "asc" },
        });

        if (nextTask) {
          await tx.productionTask.update({
            where: { id: nextTask.id },
            data: { status: "PENDING", blockedReason: null },
          });
        }
      }
    }

    return results;
  });

  return NextResponse.json(updatedCheck);
}
