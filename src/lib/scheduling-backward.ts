// ═══════════════════════════════════════════════════════════════════════
// Phase 0-B : ordonnancement backward depuis la deadline.
//
// Idée : pour chaque ProductionTask, calculer la borne haute (latestFinish)
// par récursion descendante du DAG (predecessorIds), puis remonter dans
// la grille demi-journée par demi-journée pour trouver le créneau le plus
// tardif où la capacité poste + opérateur est dispo.
//
// Contrastes avec autoAssign actuel :
//   - autoAssign : forward, semaine fixe, greedy étape-par-étape.
//   - backward   : trie par latestFinish ASC, recule depuis chaque latestFinish,
//                  ne se limite pas à la semaine affichée.
// ═══════════════════════════════════════════════════════════════════════

import prisma from "@/lib/prisma";
import { detectStrategy } from "@/lib/work-posts";
import { chooseNbOps, postIsMonolithic, postCapacityMinDay, postTamponAfter } from "@/lib/work-posts";
import { heijunkaRebalance, type HeijunkaSlot } from "@/lib/auto-planning";
import {
  HalfDayCursor,
  cellKey,
  halfDayBefore,
  isIsulaDay,
  isWorkingHalfDay,
  loadCellLoad,
  loadOperatorCapacity,
  localStr,
  parseDay,
  workdaysBetween,
  DEMI_MIN,
} from "@/lib/scheduling-utils";

// ── Types ───────────────────────────────────────────────────────────────

export interface ScheduleResultEntry {
  taskId: string;
  workPostId: string;
  fabItemId: string;
  slots: Array<{
    operatorId: string;
    operatorName: string;
    date: string;     // YYYY-MM-DD
    halfDay: "AM" | "PM";
    minutes: number;
  }>;
}

export interface ScheduleUnscheduled {
  taskId: string;
  workPostId: string;
  reason: string;
  partial: boolean;       // true = quelques slots posés mais pas tous
  placedSlots: number;
  neededSlots: number;
}

export interface ScheduleReport {
  orderId: string;
  scheduled: ScheduleResultEntry[];
  unscheduled: ScheduleUnscheduled[];
  /** Pour le rapport visuel (compatible AutoAssignReport). */
  fullyPlaced: string[];           // labels des fabItems totalement placés
  partiallyPlaced: Array<{ chantier: string; postesManquants: Array<{ postId: string; raison: string; minutes: number }> }>;
  notPlaced: Array<{ chantier: string; raison: string }>;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function dateToHalfDayLatest(d: Date): HalfDayCursor {
  // Convention : "fin journée" = PM
  return { date: localStr(d), halfDay: "PM" };
}

// ── Algo principal ──────────────────────────────────────────────────────

export async function backwardSchedule(orderId: string): Promise<ScheduleReport> {
  // ── 1. Charger l'order avec items et tasks ─────────────────────────────
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          tasks: {
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });
  if (!order) {
    throw new Error(`Order ${orderId} introuvable`);
  }

  const tasks = order.items.flatMap(i => i.tasks);
  const tasksMap = new Map(tasks.map(t => [t.id, t]));
  const itemsMap = new Map(order.items.map(i => [i.id, i]));

  if (tasks.length === 0) {
    return { orderId, scheduled: [], unscheduled: [], fullyPlaced: [], partiallyPlaced: [], notPlaced: [] };
  }

  // ── 2. Calculer latestFinish par récursion descendante ─────────────────
  const latestFinish = new Map<string, Date>();
  const deadline = order.deliveryDate;

  function computeLatest(taskId: string): Date {
    if (latestFinish.has(taskId)) return latestFinish.get(taskId)!;
    const task = tasksMap.get(taskId);
    if (!task) return deadline;

    const successors = tasks.filter(t => t.predecessorIds.includes(taskId));
    if (successors.length === 0) {
      latestFinish.set(taskId, deadline);
      return deadline;
    }
    // Doit finir avant min(latestStart succ_i)
    let minStart = Infinity;
    for (const s of successors) {
      const sFinish = computeLatest(s.id);
      const dur = s.estimatedMinutes;
      const tampon = postTamponAfter(s.workPostId);
      const startMs = sFinish.getTime() - (dur + tampon) * 60 * 1000;
      if (startMs < minStart) minStart = startMs;
    }
    const lf = new Date(minStart);
    latestFinish.set(taskId, lf);
    return lf;
  }
  for (const t of tasks) computeLatest(t.id);

  // ── 3. Trier par latestFinish ASC ──────────────────────────────────────
  const sortedTasks = [...tasks].sort((a, b) =>
    (latestFinish.get(a.id)?.getTime() ?? 0) - (latestFinish.get(b.id)?.getTime() ?? 0)
  );

  // ── 4. Charger l'état courant ──────────────────────────────────────────
  const today = localStr(new Date());
  const horizonEnd = localStr(deadline);
  const cellLoad = await loadCellLoad();
  const opCapa = await loadOperatorCapacity(today, horizonEnd);

  // Charger compétences par poste
  const allSkills = await prisma.operatorSkill.findMany({
    where: { level: { gt: 0 }, workPostId: { not: null } },
    include: { operator: true },
  });

  function competentOpsForPost(postId: string) {
    return allSkills
      .filter(s => s.workPostId === postId && s.operator.active)
      .map(s => ({ id: s.operatorId, name: s.operator.name, level: s.level }));
  }

  // ── 5. Pour chaque task, REMONTER depuis latestFinish ──────────────────
  const scheduled: ScheduleResultEntry[] = [];
  const unscheduled: ScheduleUnscheduled[] = [];

  // Trace par task → slots posés (pour plus tard insérer en BDD).
  const newSlotsToInsert: Array<{
    taskId: string;
    operatorId: string;
    date: Date;
    halfDay: "AM" | "PM";
    minutes: number;
  }> = [];

  for (const task of sortedTasks) {
    const lf = latestFinish.get(task.id) || deadline;
    const competents = competentOpsForPost(task.workPostId);
    if (competents.length === 0) {
      unscheduled.push({
        taskId: task.id,
        workPostId: task.workPostId,
        reason: `aucun opérateur compétent sur ${task.workPostId}`,
        partial: false,
        placedSlots: 0,
        neededSlots: 0,
      });
      continue;
    }

    // Stratégie crash/normal selon marge
    const joursDispo = Math.max(1, workdaysBetween(today, localStr(lf)));
    const joursBesoin = Math.max(0.5, task.estimatedMinutes / 480);
    const strategy = detectStrategy(joursDispo, joursBesoin);
    const decision = chooseNbOps(task.workPostId, strategy, competents.map(o => o.level));
    const isMono = postIsMonolithic(task.workPostId);
    let nbPers = isMono ? 1 : decision.nbProducers;
    nbPers = Math.max(1, Math.min(nbPers, competents.length));

    const slotsNeeded = Math.max(1, Math.ceil(task.estimatedMinutes / (DEMI_MIN * nbPers)));

    // Borne basse : earliestStart si défini, sinon today.
    const minStartStr = task.earliestStart
      ? localStr(task.earliestStart)
      : today;

    let cursor: HalfDayCursor = dateToHalfDayLatest(lf);
    let placed = 0;
    const slotsForTask: ScheduleResultEntry["slots"] = [];
    let attempts = 0;
    const MAX_ATTEMPTS = 200;

    while (placed < slotsNeeded && attempts++ < MAX_ATTEMPTS) {
      // Sortie si on est passé sous la borne basse
      if (cursor.date < minStartStr) break;

      // Vérifier jour ouvré
      if (!isWorkingHalfDay(cursor)) {
        cursor = halfDayBefore(cursor);
        continue;
      }
      // Contrainte ISULA
      if (task.workPostId.startsWith("I") && !isIsulaDay(cursor.date)) {
        cursor = halfDayBefore(cursor);
        continue;
      }

      // Capacité poste sur ce créneau
      const ck = cellKey(task.workPostId, cursor);
      const used = cellLoad.get(ck) || 0;
      const cellMax = postCapacityMinDay(task.workPostId) / 2; // ½ journée
      if (used >= cellMax) {
        cursor = halfDayBefore(cursor);
        continue;
      }

      // Filtrer ops dispos (compétents + capacité restante + non bookés
      // ailleurs ce demi-jour). On scorera ensuite.
      const availOps = competents
        .filter(o => {
          const cap = opCapa.get(o.id);
          return cap && cap.remaining >= 30;
        })
        .filter(o => {
          // Conflit : un slot existe déjà pour cet op sur ce créneau ?
          const conflict = newSlotsToInsert.some(s =>
            s.operatorId === o.id &&
            localStr(s.date) === cursor.date &&
            s.halfDay === cursor.halfDay
          );
          return !conflict;
        })
        .sort((a, b) => b.level - a.level);

      if (availOps.length < nbPers) {
        cursor = halfDayBefore(cursor);
        continue;
      }

      // Poser les ops
      const minutesThisSlot = Math.min(
        DEMI_MIN,
        task.estimatedMinutes - slotsForTask.reduce((s, x) => s + x.minutes, 0)
      );
      const opsToBook = availOps.slice(0, nbPers);
      const slotDate = parseDay(cursor.date);
      slotDate.setHours(0, 0, 0, 0);

      for (const op of opsToBook) {
        slotsForTask.push({
          operatorId: op.id,
          operatorName: op.name,
          date: cursor.date,
          halfDay: cursor.halfDay,
          minutes: minutesThisSlot,
        });
        newSlotsToInsert.push({
          taskId: task.id,
          operatorId: op.id,
          date: slotDate,
          halfDay: cursor.halfDay,
          minutes: minutesThisSlot,
        });
        const cap = opCapa.get(op.id);
        if (cap) cap.remaining = Math.max(0, cap.remaining - minutesThisSlot);
      }
      cellLoad.set(ck, used + minutesThisSlot);
      placed++;
      cursor = halfDayBefore(cursor);
    }

    if (placed === slotsNeeded) {
      scheduled.push({
        taskId: task.id,
        workPostId: task.workPostId,
        fabItemId: task.fabItemId,
        slots: slotsForTask,
      });
    } else {
      unscheduled.push({
        taskId: task.id,
        workPostId: task.workPostId,
        reason: cursor.date < minStartStr
          ? `pas assez de capacité avant ${localStr(lf)} (borne basse ${minStartStr})`
          : `seulement ${placed}/${slotsNeeded} créneaux posés`,
        partial: placed > 0,
        placedSlots: placed,
        neededSlots: slotsNeeded,
      });
    }
  }

  // ── 6a. Phase 2-B : Heijunka — lisser les Frappes de la même semaine ──
  // Construit les HeijunkaSlot à partir de newSlotsToInsert puis applique
  // les moves retournés. C'est best-effort : si ça échoue, on garde le
  // résultat brut du backward.
  try {
    const FRAPPES = new Set(["F1", "F2", "F3", "M1", "M2", "M3"]);
    const slotsByKey = new Map<string, HeijunkaSlot>();
    for (const s of newSlotsToInsert) {
      const t = tasksMap.get(s.taskId);
      if (!t || !FRAPPES.has(t.workPostId)) continue;
      const dStr = localStr(s.date);
      const key = `${t.workPostId}|${dStr}|${s.halfDay}`;
      if (!slotsByKey.has(key)) {
        slotsByKey.set(key, {
          key,
          postId: t.workPostId,
          date: dStr,
          halfDay: s.halfDay,
          loadedMin: 0,
          capacityMin: postCapacityMinDay(t.workPostId) / 2,
          frappesTasks: [],
        });
      }
      const slot = slotsByKey.get(key)!;
      slot.loadedMin += s.minutes;
      slot.frappesTasks.push({ taskId: s.taskId, minutes: s.minutes });
    }
    const moves = heijunkaRebalance(Array.from(slotsByKey.values()));
    // Appliquer les moves : on déplace dans newSlotsToInsert (in-memory).
    for (const m of moves) {
      const [_postId, toDate, toHalf] = m.toKey.split("|");
      for (const s of newSlotsToInsert) {
        if (s.taskId !== m.taskId) continue;
        const sStr = localStr(s.date);
        const fromKey = `${tasksMap.get(s.taskId)?.workPostId}|${sStr}|${s.halfDay}`;
        if (fromKey === m.fromKey) {
          s.date = parseDay(toDate);
          s.halfDay = toHalf as "AM" | "PM";
        }
      }
    }
    if (moves.length > 0) {
      console.log(`[heijunkaRebalance] ${moves.length} déplacements dans order ${orderId}`);
    }
  } catch (e) {
    console.error("[heijunkaRebalance]", e);
  }

  // ── 6. Persister en BDD : ScheduleSlot + scheduledStart/End ──────────
  if (newSlotsToInsert.length > 0) {
    try {
      // Supprimer les anciens slots de cet order (recalcul propre)
      const taskIds = tasks.map(t => t.id);
      await prisma.scheduleSlot.deleteMany({ where: { taskId: { in: taskIds } } });
      // Insérer les nouveaux
      await prisma.scheduleSlot.createMany({
        data: newSlotsToInsert,
        skipDuplicates: true,
      });
      // Mettre à jour scheduledStart/End sur chaque task placée
      for (const entry of scheduled) {
        const dates = entry.slots.map(s => parseDay(s.date).getTime()).sort((a, b) => a - b);
        await prisma.productionTask.update({
          where: { id: entry.taskId },
          data: {
            scheduledStart: new Date(dates[0]),
            scheduledEnd:   new Date(dates[dates.length - 1]),
            latestFinish:   latestFinish.get(entry.taskId),
          },
        });
      }
    } catch (e) {
      console.error("[backwardSchedule] persist error", e);
    }
  }

  // ── 7. Rapport visuel ──────────────────────────────────────────────────
  const fullyPlaced: string[] = [];
  const partiallyPlaced: ScheduleReport["partiallyPlaced"] = [];
  const notPlaced: ScheduleReport["notPlaced"] = [];

  // Regroupement par fabItem (label) pour cohérence avec AutoAssignReport
  const byItem = new Map<string, { all: number; placed: number; missing: ScheduleUnscheduled[] }>();
  for (const t of tasks) {
    const item = itemsMap.get(t.fabItemId);
    const label = item?.label || t.fabItemId;
    if (!byItem.has(label)) byItem.set(label, { all: 0, placed: 0, missing: [] });
    byItem.get(label)!.all++;
  }
  for (const t of tasks) {
    const item = itemsMap.get(t.fabItemId);
    const label = item?.label || t.fabItemId;
    const u = unscheduled.find(x => x.taskId === t.id);
    if (!u) byItem.get(label)!.placed++;
    else byItem.get(label)!.missing.push(u);
  }

  for (const [label, v] of Array.from(byItem.entries())) {
    if (v.placed === v.all) fullyPlaced.push(label);
    else if (v.placed === 0) {
      notPlaced.push({ chantier: label, raison: v.missing[0]?.reason || "non placé" });
    } else {
      partiallyPlaced.push({
        chantier: label,
        postesManquants: v.missing.map((m: ScheduleUnscheduled) => {
          const t = tasksMap.get(m.taskId)!;
          return { postId: m.workPostId, raison: m.reason, minutes: t.estimatedMinutes };
        }),
      });
    }
  }

  return { orderId, scheduled, unscheduled, fullyPlaced, partiallyPlaced, notPlaced };
}

/** Variante : traiter tous les orders non terminés, triés par deadline ASC. */
export async function backwardScheduleAll(): Promise<ScheduleReport[]> {
  const orders = await prisma.order.findMany({
    where: { status: { notIn: ["LIVRE", "SUSPENDU"] } },
    orderBy: { deliveryDate: "asc" },
    select: { id: true },
  });
  const reports: ScheduleReport[] = [];
  for (const o of orders) {
    try {
      const r = await backwardSchedule(o.id);
      reports.push(r);
    } catch (e) {
      console.error(`[backwardScheduleAll] order ${o.id} a échoué`, e);
    }
  }
  return reports;
}
