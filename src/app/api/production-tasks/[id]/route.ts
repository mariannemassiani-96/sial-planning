import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { onIsulaTaskComplete, onPoseVitrageStart } from "@/lib/isula-sial-sync";

/**
 * Phase 1-B : PATCH /api/production-tasks/[id]
 *   { status?, actualMinutes?, blockedReason?, scheduledStart?, scheduledEnd? }
 *
 * Déclenche les hooks de synchro ISULA → SIAL :
 *   - status DONE et workPostId = "I7" → onIsulaTaskComplete
 *   - status IN_PROGRESS et workPostId ∈ ["V1","V2"] → onPoseVitrageStart
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let data: Record<string, unknown>;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (data.status !== undefined) update.status = data.status;
  if (data.actualMinutes !== undefined) update.actualMinutes = parseInt(String(data.actualMinutes)) || null;
  if (data.blockedReason !== undefined) update.blockedReason = data.blockedReason || null;
  if (data.scheduledStart !== undefined) update.scheduledStart = data.scheduledStart ? new Date(String(data.scheduledStart)) : null;
  if (data.scheduledEnd !== undefined) update.scheduledEnd = data.scheduledEnd ? new Date(String(data.scheduledEnd)) : null;

  if (data.status === "IN_PROGRESS" && !update.startedAt) update.startedAt = new Date();
  if (data.status === "DONE" && !update.completedAt) update.completedAt = new Date();

  try {
    const task = await prisma.productionTask.update({
      where: { id: params.id },
      data: update,
    });

    // Hooks Phase 1-B : on les exécute en best-effort, sans bloquer la
    // requête. Si un hook échoue, on log mais le PATCH retourne OK.
    if (data.status === "DONE" && task.workPostId === "I7") {
      onIsulaTaskComplete(task.id).catch(e => console.error("[hook ISULA done]", e));
    }
    if (data.status === "IN_PROGRESS" && (task.workPostId === "V1" || task.workPostId === "V2")) {
      onPoseVitrageStart(task.id).catch(e => console.error("[hook pose vitrage]", e));
    }

    return NextResponse.json(task);
  } catch (e) {
    console.error(`[PATCH /api/production-tasks/${params.id}]`, e);
    return NextResponse.json({ error: "Erreur de mise à jour", details: String(e) }, { status: 500 });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const task = await prisma.productionTask.findUnique({
      where: { id: params.id },
      include: { fabItem: { include: { fabOrder: true } }, scheduleSlots: true, qcChecks: true },
    });
    if (!task) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
    return NextResponse.json(task);
  } catch (e) {
    return NextResponse.json({ error: "Erreur", details: String(e) }, { status: 500 });
  }
}
