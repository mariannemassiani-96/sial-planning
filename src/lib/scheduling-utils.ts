// ═══════════════════════════════════════════════════════════════════════
// Utilitaires temps & disponibilité — partagés entre l'algo backward,
// le rapport de retards, et l'adaptateur Commande → Order.
//
// Convention "demi-journée" : on découpe la semaine en 10 demis (lun-AM,
// lun-PM, …, ven-PM). Chaque demi vaut 240 min de capacité machine.
// ═══════════════════════════════════════════════════════════════════════

import { isWorkday } from "@/lib/sial-data";
import prisma from "@/lib/prisma";

const DEMI_MIN = 240;

export type HalfDay = "AM" | "PM";

export interface HalfDayCursor {
  date: string;       // YYYY-MM-DD (jour ouvré)
  halfDay: HalfDay;
}

function localStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDay(dateStr: string): Date {
  return new Date(dateStr + "T12:00:00");
}

/** Pas une demi-journée en arrière (PM → AM même jour, AM → PM jour ouvré précédent). */
export function halfDayBefore(cursor: HalfDayCursor): HalfDayCursor {
  if (cursor.halfDay === "PM") {
    return { date: cursor.date, halfDay: "AM" };
  }
  // AM → reculer jusqu'au jour ouvré précédent, PM
  const d = parseDay(cursor.date);
  d.setDate(d.getDate() - 1);
  let s = localStr(d);
  while (!isWorkday(s)) {
    d.setDate(d.getDate() - 1);
    s = localStr(d);
  }
  return { date: s, halfDay: "PM" };
}

/** Pas une demi-journée en avant (AM → PM même jour, PM → AM jour ouvré suivant). */
export function halfDayAfter(cursor: HalfDayCursor): HalfDayCursor {
  if (cursor.halfDay === "AM") {
    return { date: cursor.date, halfDay: "PM" };
  }
  const d = parseDay(cursor.date);
  d.setDate(d.getDate() + 1);
  let s = localStr(d);
  while (!isWorkday(s)) {
    d.setDate(d.getDate() + 1);
    s = localStr(d);
  }
  return { date: s, halfDay: "AM" };
}

/**
 * Recule `minutes` minutes ouvrées depuis `dateStr` (YYYY-MM-DD).
 * Saute weekends et jours fériés. Retourne la date résultante (string).
 * Pour des recul fins (heures), on travaille en demi-journées de 240 min.
 */
export function subtractWorkMinutes(
  dateStr: string,
  minutes: number,
): string {
  if (minutes <= 0) return dateStr;
  let remaining = minutes;
  const d = parseDay(dateStr);
  while (remaining > 0) {
    d.setDate(d.getDate() - 1);
    const s = localStr(d);
    if (isWorkday(s)) {
      remaining -= 480; // 1 jour ouvré = 480 min
    }
  }
  return localStr(d);
}

/** Compte les jours ouvrés entre d1 (inclus) et d2 (exclu). */
export function workdaysBetween(d1: string, d2: string): number {
  const a = parseDay(d1);
  const b = parseDay(d2);
  if (b <= a) return 0;
  let count = 0;
  const d = new Date(a);
  while (d < b) {
    if (isWorkday(localStr(d))) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

/** Avance `n` jours ouvrés depuis dateStr (saute weekends + fériés). */
export function addWorkdays(dateStr: string, n: number): string {
  const d = parseDay(dateStr);
  let count = 0;
  while (count < n) {
    d.setDate(d.getDate() + 1);
    if (isWorkday(localStr(d))) count++;
  }
  return localStr(d);
}

/** Recule `n` jours ouvrés depuis dateStr. */
export function subtractWorkdays(dateStr: string, n: number): string {
  const d = parseDay(dateStr);
  let count = 0;
  while (count < n) {
    d.setDate(d.getDate() - 1);
    if (isWorkday(localStr(d))) count++;
  }
  return localStr(d);
}

/** Contrainte ISULA : la chaîne ne tourne que les lundi/mardi/jeudi. */
export function isIsulaDay(dateStr: string): boolean {
  const d = parseDay(dateStr);
  const w = d.getDay(); // 0=dim, 1=lun, ..., 4=jeu, 5=ven, 6=sam
  return w === 1 || w === 2 || w === 4;
}

/** Conversion HalfDayCursor → clé de map. */
export function cellKey(postId: string, c: HalfDayCursor): string {
  return `${postId}|${c.date}|${c.halfDay}`;
}

/**
 * Charge la map "postId|date|halfDay" → minutes déjà placées,
 * basée sur les ScheduleSlot existants en BDD.
 */
export async function loadCellLoad(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    // On agrège par (workPostId × date × halfDay) en passant par task.
    const slots = await prisma.scheduleSlot.findMany({
      include: { task: { select: { workPostId: true } } },
    });
    for (const s of slots) {
      const dStr = s.date.toISOString().slice(0, 10);
      const k = `${s.task.workPostId}|${dStr}|${s.halfDay}`;
      map.set(k, (map.get(k) || 0) + s.minutes);
    }
  } catch {
    // ScheduleSlot peut ne pas exister tant que la migration 0-B n'est pas appliquée.
  }
  return map;
}

/**
 * Capacité hebdo nette par opérateur jusqu'à `deadline` (incluse).
 * Retire jours fériés, vendredi PM si vendrediOff, absences déclarées.
 *
 * Retourne Map<operatorId, { total, remaining }>.
 * `remaining` est initialisé = total ; au fur et à mesure que l'algo
 * pose des slots, l'appelant décrémente remaining.
 */
export async function loadOperatorCapacity(
  fromDateStr: string,
  toDateStr: string,
): Promise<Map<string, { id: string; name: string; total: number; remaining: number; vendrediOff: boolean }>> {
  const ops = await prisma.operator.findMany({
    where: { active: true },
    include: { absences: true },
  });
  const map = new Map<string, { id: string; name: string; total: number; remaining: number; vendrediOff: boolean }>();

  for (const op of ops) {
    const vendrediOff = !op.workingDays.includes(4);
    let total = 0;
    const from = parseDay(fromDateStr);
    const to = parseDay(toDateStr);
    const cursor = new Date(from);
    while (cursor <= to) {
      const ds = localStr(cursor);
      if (isWorkday(ds)) {
        const w = cursor.getDay();
        const isAbs = op.absences.some(a =>
          a.date.toISOString().slice(0, 10) === ds
        );
        if (!isAbs) {
          // Vendredi : 7h L-J 4h V (jp 4h ; vendrediOff = 0)
          let dayMin = (op.weekHours / 5) * 60;
          if (w === 5) {
            if (vendrediOff) dayMin = 0;
            else dayMin = Math.min(dayMin, 240); // ven AM seulement
          }
          total += dayMin;
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    map.set(op.id, { id: op.id, name: op.name, total, remaining: total, vendrediOff });
  }
  return map;
}

/**
 * Retourne true si `cursor` correspond à un créneau ouvré (jour ouvré
 * et — pour les ops `vendrediOff` — pas le vendredi).
 */
export function isWorkingHalfDay(cursor: HalfDayCursor, vendrediOff = false): boolean {
  if (!isWorkday(cursor.date)) return false;
  const w = parseDay(cursor.date).getDay();
  if (w === 5) {
    if (vendrediOff) return false;
    if (cursor.halfDay === "PM") return false; // ven PM = pas de prod
  }
  return true;
}

export { DEMI_MIN, parseDay, localStr };
