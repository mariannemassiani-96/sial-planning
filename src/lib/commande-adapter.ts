// ═══════════════════════════════════════════════════════════════════════
// Phase 0-C : adapter Commande (legacy JSON) → Order + FabItem +
// ProductionTask. À chaque création / modification d'une Commande,
// on projette son contenu vers le modèle industriel pour que les
// algos (backward, retards, stats) y aient accès.
//
// L'adapter est idempotent : on retrouve l'Order par `refProF2 = "CMD-<id>"`,
// on supprime ses items + tasks existants et on les recrée. C'est moins
// efficace qu'un upsert fin mais beaucoup plus robuste face aux
// modifications de lignes (ajout / suppression / réordre).
// ═══════════════════════════════════════════════════════════════════════

import prisma from "@/lib/prisma";
import { TYPES_MENUISERIE, isWorkday } from "@/lib/sial-data";
import { getRoutage, isulaInfoFromCmd } from "@/lib/routage-production";
import type { MenuiserieType, Matiere, OrderStatus } from "@prisma/client";

// ── Mapping legacy → enum Prisma ────────────────────────────────────────

function mapTypeToEnum(typeId: string): MenuiserieType {
  const upper = typeId.toUpperCase();
  // Les valeurs de TYPES_MENUISERIE sont en snake_case (ob2_pvc, c3v3r…)
  // L'enum Prisma a les mêmes en UPPER. Mapping direct pour la majorité.
  // Cas particuliers : intervention_chantier → INTERVENTION_CHANTIER, etc.
  const known: Record<string, MenuiserieType> = {
    OB1_PVC: "OB1_PVC", OB2_PVC: "OB2_PVC", OF1_PVC: "OF1_PVC", OF2_PVC: "OF2_PVC",
    FIXE_PVC: "FIXE_PVC", PF1_PVC: "PF1_PVC", PF2_PVC: "PF2_PVC",
    OB1_ALU: "OB1_ALU", OB2_ALU: "OB2_ALU", OF1_ALU: "OF1_ALU", OF2_ALU: "OF2_ALU",
    FIXE_ALU: "FIXE_ALU", PF1_ALU: "PF1_ALU", PF2_ALU: "PF2_ALU",
    P1_ALU: "P1_ALU", P2_ALU: "P2_ALU",
    C2V2R: "C2V2R", C3V3R: "C3V3R", C4V4R: "C4V4R", C4V2R: "C4V2R",
    G1V1R: "G1V1R", G2V1R: "G2V1R", G2V2R: "G2V2R", G3V3R: "G3V3R", G4V2R: "G4V2R",
    HORS_STANDARD: "HORS_STANDARD",
    INTERVENTION_CHANTIER: "INTERVENTION_CHANTIER",
  };
  return known[upper] || "HORS_STANDARD";
}

function mapMatiere(typeId: string): Matiere {
  const tm = TYPES_MENUISERIE[typeId];
  if (!tm) return "ALU";
  if (tm.mat === "PVC") return "PVC";
  if (tm.mat === "ALU/PVC") return "ALU_PVC";
  return "ALU";
}

function mapStatutToOrderStatus(statut: string | undefined): OrderStatus {
  switch (statut) {
    case "livre":          return "LIVRE";
    case "annulee":        return "SUSPENDU";
    case "terminee":       return "PRET_LIVRAISON";
    case "en_cours":       return "EN_COURS";
    default:               return "A_LANCER";
  }
}

/** Avance N jours ouvrés depuis date YYYY-MM-DD. */
function addWorkdays(dateStr: string, n: number): Date {
  const d = new Date(dateStr + "T00:00:00");
  let count = 0;
  while (count < n) {
    d.setDate(d.getDate() + 1);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (isWorkday(ds)) count++;
  }
  return d;
}

// ── Synchronisation principale ──────────────────────────────────────────

/**
 * Synchronise une Commande (legacy) vers Order + FabItem + ProductionTask.
 * En cas d'erreur, log mais ne lève pas (la Commande reste enregistrée).
 */
export async function syncCommandeToOrder(commandeId: string): Promise<void> {
  try {
    const cmd = await prisma.commande.findUnique({ where: { id: commandeId } });
    if (!cmd) {
      console.warn(`[syncCommandeToOrder] Commande ${commandeId} introuvable`);
      return;
    }

    const cmdAny = cmd as any;
    const orderRef = `CMD-${cmd.id}`;

    // Phase 0-A : pose_chantier_date prime sur date_livraison_souhaitee
    const deadlineStr =
      cmdAny.pose_chantier_date ||
      cmd.date_livraison_souhaitee ||
      // si rien n'est saisi, on met +30 j ouvrés pour ne pas bloquer
      null;
    const deadline = deadlineStr
      ? new Date(deadlineStr + "T00:00:00")
      : (() => { const d = new Date(); d.setDate(d.getDate() + 60); return d; })();

    const orderStatus = mapStatutToOrderStatus(cmdAny.statut);

    // ── 1. Upsert Order ────────────────────────────────────────────────
    const order = await prisma.order.upsert({
      where: { refProF2: orderRef },
      create: {
        refProF2:     orderRef,
        refChantier:  cmd.ref_chantier || cmd.client || "—",
        clientName:   cmd.client || "—",
        deliveryDate: deadline,
        status:       orderStatus,
        notes:        cmdAny.notes_pose || null,
      },
      update: {
        refChantier:  cmd.ref_chantier || cmd.client || "—",
        clientName:   cmd.client || "—",
        deliveryDate: deadline,
        status:       orderStatus,
        notes:        cmdAny.notes_pose || null,
      },
    });

    // ── 2. Effacer items + tasks existants pour recréer proprement ────
    await prisma.fabItem.deleteMany({ where: { orderId: order.id } });
    // (les ProductionTask + ScheduleSlot disparaissent par cascade)

    // ── 3. Pour chaque ligne : créer FabItem + ProductionTasks ────────
    const lignes = Array.isArray(cmdAny.lignes) ? cmdAny.lignes : [];
    if (lignes.length === 0) return; // commande sans menuiserie : Order seul

    const isulaInfo = isulaInfoFromCmd({ vitrages: cmdAny.vitrages });

    for (let i = 0; i < lignes.length; i++) {
      const lg = lignes[i];
      const typeId = String(lg.type || cmd.type || "ob1_pvc");
      const qte = parseInt(String(lg.quantite || cmd.quantite || 1)) || 1;
      const widthMm = parseFloat(String(lg.largeur_mm || "0")) || null;
      const heightMm = parseFloat(String(lg.hauteur_mm || "0")) || null;
      const isSpecial = !!(widthMm && widthMm >= 4000) || !!(heightMm && heightMm >= 3000);

      const tm = TYPES_MENUISERIE[typeId];

      // Calcul des étapes via getRoutage (déjà cerveau-aware si dispo)
      const routage = getRoutage(typeId, qte, lg.hsTemps || cmd.hsTemps as any, 1.0, undefined, isulaInfo);

      // earliestStart : si laquage_externe, jalon = today + delai
      let earliestStart: Date | undefined;
      if (lg.laquage_externe) {
        const delai = parseInt(String(lg.delai_laquage_jours || "5")) || 5;
        earliestStart = addWorkdays(
          new Date().toISOString().slice(0, 10),
          delai,
        );
      }

      // Création FabItem
      const fabItem = await prisma.fabItem.create({
        data: {
          orderId:        order.id,
          menuiserieType: mapTypeToEnum(typeId),
          quantity:       qte,
          label:          `${tm?.label || typeId} ×${qte}${lg.coloris ? ` ${lg.coloris}` : ""}`,
          isSpecial,
          matiere:        mapMatiere(typeId),
          widthMm:        widthMm ? Math.round(widthMm) : null,
          heightMm:       heightMm ? Math.round(heightMm) : null,
        },
      });

      // Création ProductionTask par étape, dans l'ordre
      for (let j = 0; j < routage.length; j++) {
        const et = routage[j];
        try {
          await prisma.productionTask.create({
            data: {
              fabItemId:        fabItem.id,
              workPostId:       et.postId,
              label:            et.label,
              estimatedMinutes: et.estimatedMin + (parseInt(String(lg.temps_supp_min || "0")) || 0) / Math.max(1, routage.length),
              status:           "PENDING",
              sortOrder:        j,
              earliestStart:    j === 0 ? earliestStart : undefined,
              // predecessorIds rempli en Phase 1-A par initOrderDag()
            },
          });
        } catch (e) {
          // Le workPostId peut ne pas exister en BDD si le seed n'a pas
          // tourné. On log et on continue — l'algo backward ignorera.
          console.error(`[syncCommandeToOrder] task ${et.postId} fabItem ${fabItem.id}`, e);
        }
      }
    }

    // ── 4. Phase 1-A : remplir le DAG predecessorIds ──────────────────
    await initOrderDag(order.id);

    // ── 5. Phase 1-B : initialiser les dépendances ISULA → SIAL ───────
    try {
      // Import dynamique avec eval-style pour ne pas être typé statiquement
      // (le module peut ne pas exister selon la phase déployée).
      const mod: any = await (Function("return import('@/lib/isula-sial-sync')"))();
      if (mod?.initIsulaSialDependencies) {
        await mod.initIsulaSialDependencies(order.id);
      }
    } catch {
      // Pas de module ISULA sync : on ignore silencieusement.
    }
  } catch (e) {
    console.error(`[syncCommandeToOrder] échec total pour ${commandeId}`, e);
  }
}

/**
 * Phase 1-A : initialise le DAG predecessorIds des tasks d'un order.
 *
 * Conventions :
 *  - Au sein d'un même fabItem, chaque task hérite du précédent
 *    (sortOrder n-1) → chaîne linéaire respectant l'ordre des phases.
 *  - V1/V2 SIAL d'un fabItem dépendent en plus du dernier I* (idéalement I7)
 *    du même fabItem si ISULA présent.
 *  - Si l'order a un fabItem dédié au vitrage ISULA (atelier=ISULA), les
 *    tasks V1/V2 des autres fabItems SIAL dépendent de I7 du fabItem ISULA.
 */
export async function initOrderDag(orderId: string): Promise<void> {
  const tasks = await prisma.productionTask.findMany({
    where: { fabItem: { orderId } },
    orderBy: [{ fabItemId: "asc" }, { sortOrder: "asc" }],
  });
  if (tasks.length === 0) return;

  // Grouper par fabItem
  const byFabItem = new Map<string, typeof tasks>();
  for (const t of tasks) {
    if (!byFabItem.has(t.fabItemId)) byFabItem.set(t.fabItemId, []);
    byFabItem.get(t.fabItemId)!.push(t);
  }

  // Détecter les "tasks ISULA finales" (I7 ou dernier I*) cross-fabItems.
  const isulaTerminalsByFabItem = new Map<string, typeof tasks[number]>();
  for (const [fabId, arr] of Array.from(byFabItem.entries())) {
    const isulaTasks = arr.filter(x => x.workPostId.startsWith("I"));
    if (isulaTasks.length === 0) continue;
    const i7 = isulaTasks.find(x => x.workPostId === "I7");
    isulaTerminalsByFabItem.set(fabId, i7 || isulaTasks.sort((a, b) => b.sortOrder - a.sortOrder)[0]);
  }
  // Liste plate des terminaux ISULA tous fabItems confondus
  const allIsulaTerminals = Array.from(isulaTerminalsByFabItem.values());

  for (const [fabId, arr] of Array.from(byFabItem.entries())) {
    // Chaîne linéaire : t[i] dépend de t[i-1]
    for (let i = 0; i < arr.length; i++) {
      const t = arr[i];
      const preds: string[] = [];
      if (i > 0) preds.push(arr[i - 1].id);

      // Cas spécial : V1/V2 SIAL → dépend du I7 (ou dernier I*) le plus
      // pertinent : d'abord celui du même fabItem, sinon n'importe lequel
      // de l'order (cas où ISULA est un fabItem séparé).
      if (t.workPostId === "V1" || t.workPostId === "V2") {
        const sameFabIsula = isulaTerminalsByFabItem.get(fabId);
        if (sameFabIsula && !preds.includes(sameFabIsula.id)) {
          preds.push(sameFabIsula.id);
        } else if (allIsulaTerminals.length > 0) {
          for (const it of allIsulaTerminals) {
            if (!preds.includes(it.id)) preds.push(it.id);
          }
        }
      }

      if (preds.length > 0) {
        try {
          await prisma.productionTask.update({
            where: { id: t.id },
            data: { predecessorIds: preds },
          });
        } catch (e) {
          console.error(`[initOrderDag] update task ${t.id}`, e);
        }
      }
    }
  }
}

/** Resync de toutes les commandes par lots (utilisé par l'admin route). */
export async function resyncAllCommandes(batchSize = 20): Promise<{ total: number; success: number; errors: string[] }> {
  const all = await prisma.commande.findMany({ select: { id: true } });
  let success = 0;
  const errors: string[] = [];
  for (let i = 0; i < all.length; i += batchSize) {
    const batch = all.slice(i, i + batchSize);
    await Promise.all(batch.map(async c => {
      try {
        await syncCommandeToOrder(c.id);
        success++;
      } catch (e) {
        errors.push(`${c.id}: ${String(e)}`);
      }
    }));
  }
  return { total: all.length, success, errors };
}
