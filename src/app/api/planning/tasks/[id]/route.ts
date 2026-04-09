import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json();
  const { status, blockedReason, actualMinutes } = body;

  const update: Record<string, unknown> = {};

  if (status === "DONE") {
    update.status = "DONE";
    update.completedAt = new Date();
    if (actualMinutes != null) update.actualMinutes = Number(actualMinutes);
  } else if (status === "IN_PROGRESS") {
    update.status = "IN_PROGRESS";
    update.startedAt = new Date();
  } else if (status === "BLOCKED") {
    update.status = "BLOCKED";
    update.blockedReason = blockedReason ?? "";
  } else if (status === "PENDING") {
    update.status = "PENDING";
    update.blockedReason = null;
  } else {
    return NextResponse.json({ error: "status invalide" }, { status: 400 });
  }

  const task = await prisma.productionTask.update({
    where: { id },
    data: update,
    include: { workPost: true, fabItem: { include: { fabOrder: true } } },
  });

  return NextResponse.json(task);
}
