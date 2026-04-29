// ═══════════════════════════════════════════════════════════════════════
// Helpers serveur pour synchroniser la définition TS des postes
// (lib/work-posts.ts) avec la table Prisma WorkPost.
//
// Utilisable depuis les routes API uniquement (import prisma).
// ═══════════════════════════════════════════════════════════════════════

import prisma from "@/lib/prisma";
import { WORK_POSTS } from "@/lib/work-posts";

let postsEnsured = false;

/**
 * Idempotent. Crée les WorkPosts manquants en base et met à jour les
 * champs descriptifs (label, capacityMinDay, phase, maxOperators…) si
 * la définition TS a changé. Ne supprime jamais d'enregistrement.
 *
 * Appelé au démarrage des routes qui dépendent des WorkPosts.
 */
export async function ensureWorkPosts(): Promise<void> {
  if (postsEnsured) return;
  try {
    for (const wp of WORK_POSTS) {
      // Le schema Prisma contient des champs nouveaux (phase, maxOperators,
      // tamponMinAfter, color, visible, sortOrder, shortLabel) que la BDD
      // peut ne pas avoir si la migration n'a pas encore tourné. On utilise
      // une variante "best effort" : on tente avec les champs nouveaux,
      // on retombe sur le minimum si ça échoue.
      try {
        await prisma.workPost.upsert({
          where: { id: wp.id },
          update: {
            label: wp.label,
            shortLabel: wp.shortLabel,
            atelier: wp.atelier,
            capacityMinDay: wp.capacityMinDay,
            phase: wp.phase,
            maxOperators: wp.maxOperators,
            tamponMinAfter: wp.tamponMinAfter,
            color: wp.color,
            visible: wp.visible,
            sortOrder: wp.sortOrder,
          } as any,
          create: {
            id: wp.id,
            label: wp.label,
            shortLabel: wp.shortLabel,
            atelier: wp.atelier,
            capacityMinDay: wp.capacityMinDay,
            phase: wp.phase,
            maxOperators: wp.maxOperators,
            tamponMinAfter: wp.tamponMinAfter,
            color: wp.color,
            visible: wp.visible,
            sortOrder: wp.sortOrder,
            defaultOperators: [],
          } as any,
        });
      } catch {
        // Fallback compat BDD pré-migration : on ne touche que les colonnes
        // historiques (label, atelier, capacityMinDay).
        await prisma.workPost.upsert({
          where: { id: wp.id },
          update: {
            label: wp.label,
            atelier: wp.atelier,
            capacityMinDay: wp.capacityMinDay,
          },
          create: {
            id: wp.id,
            label: wp.label,
            atelier: wp.atelier,
            capacityMinDay: wp.capacityMinDay,
            defaultOperators: [],
          },
        });
      }
    }
    postsEnsured = true;
  } catch (e) {
    console.error("ensureWorkPosts error:", e instanceof Error ? e.message : e);
  }
}
