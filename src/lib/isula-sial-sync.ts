// ═══════════════════════════════════════════════════════════════════════
// Phase 1-B : synchronisation ISULA → SIAL via BufferStock.
//
// Flux :
//   1. I7 (Contrôle CEKAL) terminée → onIsulaTaskComplete() crée un
//      BufferStock VITRAGES_ISULA prêt + débloque les V1/V2 du fabItem.
//   2. V1/V2 démarre → onPoseVitrageStart() vérifie qu'un BufferStock
//      existe et le marque consommé. Si absent → BLOCKED.
//   3. À la création de l'order → initIsulaSialDependencies() ajoute la
//      dépendance I7 → V1/V2 dans predecessorIds (sécurité algo).
// ═══════════════════════════════════════════════════════════════════════

import prisma from "@/lib/prisma";

const POSTE_ISULA_TERMINAL = "I7";        // Contrôle final CEKAL
const POSTES_POSE_VITRAGE = ["V1", "V2"]; // Vitrage frappe + coul/galand

/**
 * Appelée quand `workPostId = "I7"` passe à status DONE.
 * Crée un BufferStock VITRAGES_ISULA prêt + débloque les V1/V2 du même fabItem.
 */
export async function onIsulaTaskComplete(taskId: string): Promise<void> {
  const task = await prisma.productionTask.findUnique({
    where: { id: taskId },
    include: { fabItem: { include: { fabOrder: true } } },
  });
  if (!task) return;
  if (task.workPostId !== POSTE_ISULA_TERMINAL) return;

  const fabItem = task.fabItem;
  if (!fabItem) return;

  // 1. Créer le BufferStock — quantité = quantity du fabItem.
  try {
    await prisma.bufferStock.create({
      data: {
        orderId:         fabItem.orderId,
        type:            "VITRAGES_ISULA",
        quantity:        fabItem.quantity,
        unit:            "uv",
        taskProducerId:  task.id,
        fabItemSourceId: fabItem.id,
        readyAt:         new Date(),
      },
    });
  } catch (e) {
    console.error("[onIsulaTaskComplete] create buffer", e);
  }

  // 2. Débloquer les V1/V2 du même fabItem.
  try {
    await prisma.productionTask.updateMany({
      where: {
        fabItemId: fabItem.id,
        workPostId: { in: POSTES_POSE_VITRAGE },
        status: "BLOCKED",
      },
      data: { status: "PENDING", blockedReason: null },
    });
  } catch (e) {
    console.error("[onIsulaTaskComplete] unblock V1/V2", e);
  }

  // 3. Trace pour AJ : memo dans le panneau Andon.
  try {
    await prisma.memoAction.create({
      data: {
        auteur:   "système",
        texte:    `UV ${fabItem.label} prêt — pose vitrage SIAL débloquée`,
        type:     "planning",
        priorite: "normale",
      },
    });
  } catch (e) {
    console.error("[onIsulaTaskComplete] memo", e);
  }
}

/**
 * Appelée quand `workPostId ∈ ["V1","V2"]` passe à status IN_PROGRESS.
 * Si un BufferStock VITRAGES_ISULA est dispo pour ce fabItem → consommé.
 * Sinon → la task passe en BLOCKED.
 */
export async function onPoseVitrageStart(taskId: string): Promise<void> {
  const task = await prisma.productionTask.findUnique({
    where: { id: taskId },
    include: { fabItem: true },
  });
  if (!task) return;
  if (!POSTES_POSE_VITRAGE.includes(task.workPostId)) return;
  if (!task.fabItem) return;

  // Cherche un buffer ISULA non consommé pour ce fabItem.
  const buffer = await prisma.bufferStock.findFirst({
    where: {
      fabItemSourceId: task.fabItem.id,
      type:            "VITRAGES_ISULA",
      consumedAt:      null,
    },
    orderBy: { readyAt: "asc" },
  });

  if (!buffer) {
    // Pas d'UV dispo → bloquer la task. Au cas où elle a déjà été démarrée
    // par erreur, on remet en BLOCKED pour AJ.
    try {
      await prisma.productionTask.update({
        where: { id: task.id },
        data: {
          status:        "BLOCKED",
          blockedReason: "Vitrage ISULA pas encore prêt (I7 non terminé)",
        },
      });
    } catch (e) {
      console.error("[onPoseVitrageStart] block", e);
    }
    return;
  }

  // Consommer le buffer.
  try {
    await prisma.bufferStock.update({
      where: { id: buffer.id },
      data: {
        consumedAt:     new Date(),
        taskConsumerId: task.id,
      },
    });
  } catch (e) {
    console.error("[onPoseVitrageStart] consume buffer", e);
  }
}

/**
 * Appelée par syncCommandeToOrder. Ajoute le DAG I7 → V1/V2 et bloque
 * les V1/V2 si aucun BufferStock prêt n'existe.
 */
export async function initIsulaSialDependencies(orderId: string): Promise<void> {
  const tasks = await prisma.productionTask.findMany({
    where: { fabItem: { orderId } },
    include: { fabItem: true },
  });
  if (tasks.length === 0) return;

  // Pour chaque V1/V2 : trouver le I7 du même fabItem et l'ajouter dans
  // predecessorIds. Si pas de I7 dans le même fabItem mais un I* dans
  // l'order, on prend le terminal global.
  const isulaByFabItem = new Map<string, string>();
  for (const t of tasks) {
    if (t.workPostId === POSTE_ISULA_TERMINAL) {
      isulaByFabItem.set(t.fabItemId, t.id);
    }
  }
  // Fallback : dernière étape ISULA quel que soit le fabItem
  const fallbackIsulaId = tasks
    .filter(t => t.workPostId.startsWith("I"))
    .sort((a, b) => b.sortOrder - a.sortOrder)[0]?.id;

  for (const t of tasks) {
    if (!POSTES_POSE_VITRAGE.includes(t.workPostId)) continue;
    const predIsula = isulaByFabItem.get(t.fabItemId) || fallbackIsulaId;
    if (!predIsula) continue;
    if (t.predecessorIds.includes(predIsula)) continue;
    try {
      await prisma.productionTask.update({
        where: { id: t.id },
        data: { predecessorIds: { push: predIsula } },
      });
    } catch (e) {
      console.error("[initIsulaSialDependencies] add pred", e);
    }
  }

  // Bloquer les V1/V2 si aucun BufferStock VITRAGES_ISULA prêt n'existe
  // pour leur fabItem (cas typique en début de production).
  for (const t of tasks) {
    if (!POSTES_POSE_VITRAGE.includes(t.workPostId)) continue;
    const ready = await prisma.bufferStock.findFirst({
      where: {
        fabItemSourceId: t.fabItemId,
        type: "VITRAGES_ISULA",
        consumedAt: null,
      },
    });
    if (!ready) {
      try {
        await prisma.productionTask.update({
          where: { id: t.id },
          data: {
            status: "BLOCKED",
            blockedReason: "En attente du contrôle CEKAL ISULA",
          },
        });
      } catch (e) {
        console.error("[initIsulaSialDependencies] block V*", e);
      }
    }
  }
}
