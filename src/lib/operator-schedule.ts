// ═══════════════════════════════════════════════════════════════════════
// HORAIRES DÉTAILLÉS PAR OPÉRATEUR
//
// Chaque opérateur a une `defaultSchedule` (JSON) :
//   {
//     "Mon": [{ from: "08:00", to: "12:00" }, { from: "13:00", to: "17:00" }],
//     "Tue": [...],
//     ...
//     "Fri": [{ from: "08:00", to: "12:00" }]   // ex: vendredi matin seulement
//   }
//
// Si l'horaire n'est pas défini, on tombe sur une convention par défaut
// basée sur `weekHours` (39h, 36h, 35h, 30h…).
// ═══════════════════════════════════════════════════════════════════════

export interface ScheduleSlot {
  from: string;  // "HH:MM"
  to: string;    // "HH:MM"
}

export type DaySchedule = ScheduleSlot[];

export type OperatorSchedule = Partial<Record<DayKey, DaySchedule>>;

export type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

const DAY_KEYS: DayKey[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Renvoie la clé de jour (Sun..Sat) à partir d'une date YYYY-MM-DD. */
export function dayKeyOf(dateStr: string): DayKey {
  const d = new Date(dateStr + "T12:00:00");
  return DAY_KEYS[d.getDay()];
}

/** Convertit "HH:MM" en minutes depuis minuit. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Convertit des minutes depuis minuit en "HH:MM". */
export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Calcule la disponibilité totale (en minutes) d'un opérateur pour un jour.
 * Si `schedule` est null/vide pour ce jour, applique la convention :
 *   - 39h : 480 (L-J) / 420 (V) / 0 (W)
 *   - 36h : 480 (L-J) / 240 (V) / 0 (W)
 *   - 35h : 420 toute la semaine
 *   - 30h : 450 (L-J) / 0 (V) / 0 (W)
 */
export function computeDayMinutes(
  schedule: OperatorSchedule | null | undefined,
  weekHours: number,
  dateStr: string,
): number {
  const day = dayKeyOf(dateStr);
  if (schedule && schedule[day] && schedule[day]!.length > 0) {
    let total = 0;
    for (const slot of schedule[day]!) {
      total += Math.max(0, timeToMinutes(slot.to) - timeToMinutes(slot.from));
    }
    return total;
  }
  // Fallback convention par weekHours
  const isFri = day === "Fri";
  const isWeekend = day === "Sat" || day === "Sun";
  if (isWeekend) return 0;
  if (weekHours === 39) return isFri ? 420 : 480;
  if (weekHours === 36) return isFri ? 240 : 480;
  if (weekHours === 35) return 420;
  if (weekHours === 30) return isFri ? 0 : 450;
  // Cas générique : répartir sur 5 jours
  return Math.round((weekHours * 60) / 5);
}

/**
 * Renvoie l'horaire effectif d'un opérateur pour un jour, sous forme de slots.
 * Si non défini, génère un slot par défaut (8h-12h / 13h-17h ajusté selon weekHours).
 */
export function effectiveSchedule(
  schedule: OperatorSchedule | null | undefined,
  weekHours: number,
  dateStr: string,
): DaySchedule {
  const day = dayKeyOf(dateStr);
  if (schedule && schedule[day] && schedule[day]!.length > 0) {
    return schedule[day]!;
  }
  const totalMin = computeDayMinutes(schedule, weekHours, dateStr);
  if (totalMin <= 0) return [];
  // Convention : 8h début, pause 12h-13h
  if (totalMin <= 240) {
    // demi-journée
    return [{ from: "08:00", to: minutesToTime(8 * 60 + totalMin) }];
  }
  // Pleine journée : 8h-12h puis 13h-(13h + (totalMin-240))
  const afternoon = totalMin - 240;
  return [
    { from: "08:00", to: "12:00" },
    { from: "13:00", to: minutesToTime(13 * 60 + afternoon) },
  ];
}

/**
 * Vérifie si un opérateur est disponible à une heure donnée d'un jour.
 * Tient compte de l'horaire détaillé.
 */
export function isAvailableAt(
  schedule: OperatorSchedule | null | undefined,
  weekHours: number,
  dateStr: string,
  hourDecimal: number,
): boolean {
  const slots = effectiveSchedule(schedule, weekHours, dateStr);
  const minute = hourDecimal * 60;
  return slots.some(s => timeToMinutes(s.from) <= minute && minute < timeToMinutes(s.to));
}

/**
 * Convention par défaut transposée en defaultSchedule, utile pour pré-remplir
 * les horaires dans l'UI d'admin.
 */
export function buildDefaultScheduleFromWeekHours(weekHours: number, vendrediOff: boolean): OperatorSchedule {
  const wd: DayKey[] = ["Mon", "Tue", "Wed", "Thu"];
  const std: DaySchedule =
    weekHours === 39 ? [{ from: "08:00", to: "12:00" }, { from: "13:00", to: "17:00" }] :
    weekHours === 36 ? [{ from: "08:00", to: "12:00" }, { from: "13:00", to: "17:00" }] :
    weekHours === 35 ? [{ from: "08:00", to: "12:00" }, { from: "13:00", to: "16:00" }] :
    weekHours === 30 ? [{ from: "07:30", to: "12:00" }, { from: "13:00", to: "16:00" }] :
                       [{ from: "08:00", to: "12:00" }, { from: "13:00", to: "17:00" }];
  const result: OperatorSchedule = {};
  for (const d of wd) result[d] = std;
  if (!vendrediOff) {
    if (weekHours === 39) result.Fri = [{ from: "08:00", to: "12:00" }, { from: "13:00", to: "16:00" }];
    else if (weekHours === 36) result.Fri = [{ from: "08:00", to: "12:00" }];
    else if (weekHours === 35) result.Fri = std;
    else result.Fri = std;
  }
  return result;
}
