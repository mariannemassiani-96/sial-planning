// ═══════════════════════════════════════════════════════════════════════
// ROUTAGE PRODUCTION — Mapping type menuiserie -> sequence de fabrication
// Utilise par : validation dependances, auto-planning, scheduling optimal
// ═══════════════════════════════════════════════════════════════════════

import { TYPES_MENUISERIE, TAMPON_MIN, calcTempsType } from "@/lib/sial-data";

// ── Types ────────────────────────────────────────────────────────────

export type PosteId = "coupe" | "frappes" | "coulissant" | "vitrage_ov";

export interface RouteStep {
  poste: PosteId;
  dependsOn: string | null; // previous step id (poste name of preceding step)
  tamponMin: number;        // buffer time after previous step in minutes (240 = 4h)
}

export interface ProductionRoute {
  steps: RouteStep[];
}

// ── Route definitions by famille ─────────────────────────────────────

/**
 * Frappes standard (avec ouvrants) :
 *   coupe -> frappes (includes vitrage_frappe time) -> palette
 */
function buildFrappeRoute(): ProductionRoute {
  return {
    steps: [
      { poste: "coupe",   dependsOn: null,    tamponMin: 0 },
      { poste: "frappes", dependsOn: "coupe", tamponMin: TAMPON_MIN },
    ],
  };
}

/**
 * Fixes (0 ouvrants, pas de vitrage) :
 *   coupe -> frappes -> palette
 * Meme route que frappes standard car vitrage est inclus dans le temps frappes
 * et le temps vitrage est 0 (0 ouvrants)
 */
function buildFixeRoute(): ProductionRoute {
  return {
    steps: [
      { poste: "coupe",   dependsOn: null,    tamponMin: 0 },
      { poste: "frappes", dependsOn: "coupe", tamponMin: TAMPON_MIN },
    ],
  };
}

/**
 * Coulissants et galandages :
 *   coupe -> coulissant -> vitrage_ov -> palette
 */
function buildCoulissantRoute(): ProductionRoute {
  return {
    steps: [
      { poste: "coupe",      dependsOn: null,         tamponMin: 0 },
      { poste: "coulissant", dependsOn: "coupe",      tamponMin: TAMPON_MIN },
      { poste: "vitrage_ov", dependsOn: "coulissant", tamponMin: TAMPON_MIN },
    ],
  };
}

/**
 * Hors standard : passe potentiellement par tous les postes
 *   coupe -> frappes -> vitrage_ov -> palette
 */
function buildHorsStandardRoute(): ProductionRoute {
  return {
    steps: [
      { poste: "coupe",      dependsOn: null,      tamponMin: 0 },
      { poste: "frappes",    dependsOn: "coupe",   tamponMin: TAMPON_MIN },
      { poste: "vitrage_ov", dependsOn: "frappes", tamponMin: TAMPON_MIN },
    ],
  };
}

/**
 * Intervention chantier : pas de coupe, juste frappes (montage direct)
 */
function buildInterventionRoute(): ProductionRoute {
  return {
    steps: [
      { poste: "frappes", dependsOn: null, tamponMin: 0 },
    ],
  };
}

// ── Route cache (built once) ─────────────────────────────────────────

const routeCache = new Map<string, ProductionRoute>();

function buildRouteForType(typeId: string): ProductionRoute | null {
  const tm = TYPES_MENUISERIE[typeId];
  if (!tm) return null;

  switch (tm.famille) {
    case "frappe":
    case "porte":
      // fixe types have 0 ouvrants but same route structure
      if (tm.ouvrants === 0) return buildFixeRoute();
      return buildFrappeRoute();

    case "coulissant":
    case "glandage":
      return buildCoulissantRoute();

    case "hors_standard":
      return buildHorsStandardRoute();

    case "intervention":
      return buildInterventionRoute();

    default:
      return null;
  }
}

function ensureCache(typeId: string): ProductionRoute | null {
  if (routeCache.has(typeId)) return routeCache.get(typeId)!;
  const route = buildRouteForType(typeId);
  if (route) routeCache.set(typeId, route);
  return route;
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Get the full production route for a given menuiserie type.
 * Returns null if the type is unknown.
 */
export function getRoute(typeId: string): ProductionRoute | null {
  return ensureCache(typeId);
}

/**
 * Get the poste name for a specific step index in a type's route.
 * Returns null if the type or step index is invalid.
 */
export function getPosteForStep(typeId: string, stepIndex: number): string | null {
  const route = ensureCache(typeId);
  if (!route) return null;
  if (stepIndex < 0 || stepIndex >= route.steps.length) return null;
  return route.steps[stepIndex].poste;
}

/**
 * Get the step index for a given poste within a type's route.
 * Returns -1 if the poste is not part of this type's route.
 */
export function getStepIndex(typeId: string, poste: string): number {
  const route = ensureCache(typeId);
  if (!route) return -1;
  return route.steps.findIndex((s) => s.poste === poste);
}

/**
 * Get all postes (in order) that a type goes through.
 */
export function getPostesForType(typeId: string): PosteId[] {
  const route = ensureCache(typeId);
  if (!route) return [];
  return route.steps.map((s) => s.poste);
}

/**
 * Check if posteA must be completed before posteB for a given type.
 */
export function isDependency(typeId: string, posteA: string, posteB: string): boolean {
  const route = ensureCache(typeId);
  if (!route) return false;
  const idxA = route.steps.findIndex((s) => s.poste === posteA);
  const idxB = route.steps.findIndex((s) => s.poste === posteB);
  if (idxA === -1 || idxB === -1) return false;
  return idxA < idxB;
}

/**
 * Get the next step after a given poste for a type.
 * Returns null if there is no next step or the poste is not in the route.
 */
export function getNextStep(typeId: string, currentPoste: string): RouteStep | null {
  const route = ensureCache(typeId);
  if (!route) return null;
  const idx = route.steps.findIndex((s) => s.poste === currentPoste);
  if (idx === -1 || idx >= route.steps.length - 1) return null;
  return route.steps[idx + 1];
}

/**
 * Get the previous step before a given poste for a type.
 * Returns null if there is no previous step or the poste is not in the route.
 */
export function getPreviousStep(typeId: string, currentPoste: string): RouteStep | null {
  const route = ensureCache(typeId);
  if (!route) return null;
  const idx = route.steps.findIndex((s) => s.poste === currentPoste);
  if (idx <= 0) return null;
  return route.steps[idx - 1];
}

// ── Slot helpers ─────────────────────────────────────────────────────

type Slot = "am" | "pm";

interface Assignment {
  poste: string;
  date: string;    // "YYYY-MM-DD"
  slot: Slot;
}

/**
 * Convert a date + slot into a comparable timestamp-like value.
 * AM = date at 08:00, PM = date at 13:00 (workshop hours).
 * Returns minutes since epoch for easy comparison.
 */
function slotToMinutes(date: string, slot: Slot): number {
  const d = new Date(date + "T00:00:00Z");
  const dayMinutes = d.getTime() / 60000;
  return dayMinutes + (slot === "am" ? 480 : 780); // 8h00 or 13h00
}

/**
 * Validate that a set of assignments respects the production route dependencies
 * for a given menuiserie type.
 *
 * Checks:
 * 1. All required postes in the route are covered
 * 2. Assignments follow the correct order
 * 3. Buffer times (tampon) between consecutive steps are respected
 *
 * Returns { valid: true, errors: [] } if everything is OK.
 */
export function validateDependencies(
  typeId: string,
  assignments: Assignment[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const route = ensureCache(typeId);

  if (!route) {
    errors.push(`Type inconnu : "${typeId}"`);
    return { valid: false, errors };
  }

  // Build a map of poste -> earliest assignment
  const posteAssignments = new Map<string, { date: string; slot: Slot; minuteValue: number }>();
  for (const a of assignments) {
    const mv = slotToMinutes(a.date, a.slot);
    const existing = posteAssignments.get(a.poste);
    if (!existing || mv < existing.minuteValue) {
      posteAssignments.set(a.poste, { date: a.date, slot: a.slot, minuteValue: mv });
    }
  }

  // Check 1: All required postes are assigned
  for (const step of route.steps) {
    if (!posteAssignments.has(step.poste)) {
      errors.push(
        `Poste "${step.poste}" manquant dans les affectations pour le type "${typeId}".`
      );
    }
  }

  // If postes are missing, skip ordering checks
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Check 2 & 3: Order and buffer times
  for (let i = 1; i < route.steps.length; i++) {
    const prevStep = route.steps[i - 1];
    const currStep = route.steps[i];
    const prevAssign = posteAssignments.get(prevStep.poste)!;
    const currAssign = posteAssignments.get(currStep.poste)!;

    // Order check
    if (currAssign.minuteValue < prevAssign.minuteValue) {
      errors.push(
        `Ordre invalide : "${currStep.poste}" (${currAssign.date} ${currAssign.slot}) ` +
        `est planifie avant "${prevStep.poste}" (${prevAssign.date} ${prevAssign.slot}). ` +
        `"${prevStep.poste}" doit etre termine en premier.`
      );
      continue; // Skip buffer check if order is wrong
    }

    // Same slot check (can't do dependent steps in the same slot)
    if (
      currAssign.date === prevAssign.date &&
      currAssign.slot === prevAssign.slot
    ) {
      errors.push(
        `"${currStep.poste}" et "${prevStep.poste}" ne peuvent pas etre dans le meme creneau ` +
        `(${currAssign.date} ${currAssign.slot}). Un tampon de ${currStep.tamponMin} min est requis.`
      );
      continue;
    }

    // Buffer time check
    const gap = currAssign.minuteValue - prevAssign.minuteValue;
    if (gap < currStep.tamponMin) {
      errors.push(
        `Tampon insuffisant entre "${prevStep.poste}" et "${currStep.poste}" : ` +
        `${gap} min disponibles, ${currStep.tamponMin} min requis ` +
        `(${prevAssign.date} ${prevAssign.slot} -> ${currAssign.date} ${currAssign.slot}).`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ── Auto-scheduling helper ───────────────────────────────────────────

interface SlotCapacity {
  date: string;
  slot: Slot;
  poste: PosteId;
  availableMinutes: number;
}

/**
 * Given a type, quantity and available slot capacities, propose an optimal
 * scheduling that respects dependencies and buffer times.
 *
 * Returns an ordered list of proposed assignments, or null if no valid
 * schedule can be found within the given slots.
 */
export function proposeSchedule(
  typeId: string,
  requiredMinutesByPoste: Record<string, number>,
  availableSlots: SlotCapacity[]
): Assignment[] | null {
  const route = ensureCache(typeId);
  if (!route) return null;

  const result: Assignment[] = [];
  let minStartMinutes = 0; // Earliest time the next step can begin

  for (const step of route.steps) {
    const needed = requiredMinutesByPoste[step.poste] ?? 0;
    if (needed === 0) {
      // If no time needed at this poste, skip but record a zero-duration assignment
      // at the earliest available slot to maintain ordering
      const candidate = availableSlots
        .filter(
          (s) =>
            s.poste === step.poste &&
            slotToMinutes(s.date, s.slot) >= minStartMinutes
        )
        .sort((a, b) => slotToMinutes(a.date, a.slot) - slotToMinutes(b.date, b.slot));

      if (candidate.length > 0) {
        result.push({
          poste: step.poste,
          date: candidate[0].date,
          slot: candidate[0].slot,
        });
        minStartMinutes = slotToMinutes(candidate[0].date, candidate[0].slot) + step.tamponMin;
      }
      continue;
    }

    // Find the first slot at this poste that:
    // 1. Starts after minStartMinutes (respects buffer from previous step)
    // 2. Has enough capacity
    const candidates = availableSlots
      .filter(
        (s) =>
          s.poste === step.poste &&
          slotToMinutes(s.date, s.slot) >= minStartMinutes &&
          s.availableMinutes >= needed
      )
      .sort((a, b) => slotToMinutes(a.date, a.slot) - slotToMinutes(b.date, b.slot));

    if (candidates.length === 0) return null; // Can't schedule

    const chosen = candidates[0];
    result.push({
      poste: step.poste,
      date: chosen.date,
      slot: chosen.slot,
    });

    // Reduce available capacity in the chosen slot
    chosen.availableMinutes -= needed;

    // Set minimum start for next step
    const nextStep = route.steps[route.steps.indexOf(step) + 1];
    if (nextStep) {
      minStartMinutes =
        slotToMinutes(chosen.date, chosen.slot) + nextStep.tamponMin;
    }
  }

  return result;
}

// ── All routes (precompute on import) ────────────────────────────────

/** All known type IDs */
export const ALL_TYPE_IDS = Object.keys(TYPES_MENUISERIE);

// Eagerly populate the cache
for (const typeId of ALL_TYPE_IDS) {
  ensureCache(typeId);
}

// ── Debug / introspection ────────────────────────────────────────────

/**
 * Return a human-readable description of the production route for a type.
 */
export function describeRoute(typeId: string): string {
  const route = ensureCache(typeId);
  if (!route) return `Type inconnu : "${typeId}"`;

  const tm = TYPES_MENUISERIE[typeId];
  const label = tm?.label ?? typeId;
  const steps = route.steps
    .map((s, i) => {
      const dep = s.dependsOn ? ` (apres ${s.dependsOn}, tampon ${s.tamponMin}min)` : " (debut)";
      return `  ${i + 1}. ${s.poste}${dep}`;
    })
    .join("\n");

  return `${label} :\n${steps}`;
}

// ── Compatibilité ancienne API ──────────────────────────────────────

export interface EtapeRoutage {
  postId: string;
  label: string;
  phase: string;
  estimatedMin: number;
  order?: number;
}

/**
 * Ancienne API compatible : retourne un tableau d'étapes avec temps estimés.
 * Retourne les postIds spécifiques (C3, F1, M1, V1, etc.) attendus par PlanningAffectations.
 */
export function getRoutage(
  typeId: string,
  quantite: number = 1,
  hsTemps?: Record<string, unknown> | null,
): EtapeRoutage[] {
  const tm = TYPES_MENUISERIE[typeId];
  if (!tm) return [];

  const temps = calcTempsType(typeId, quantite, hsTemps as any);
  if (!temps) return [];

  const etapes: EtapeRoutage[] = [];
  const isPVC = tm.mat === "PVC";
  const isFrappe = tm.famille === "frappe" || tm.famille === "porte";
  const isCoul = tm.famille === "coulissant";
  const isGland = tm.famille === "glandage";
  const isHS = tm.famille === "hors_standard";

  // ── Coupe ──
  if (temps.par_poste.coupe > 0) {
    // Décomposer la coupe en sous-postes
    const lmt = (tm.lmt || 0) * 1 * quantite; // T.coupe_profil = 1 min/pièce
    const dt = (tm.dt || 0) * 1.5 * quantite;
    const renfort = (tm.renfort || 0) * 2 * quantite;
    const nbCadres = 1 + tm.ouvrants;
    const soudure = isPVC && isFrappe ? 5 * nbCadres * quantite : 0;
    const poincon = !isPVC && isFrappe ? 10 * nbCadres * quantite : 0;

    if (lmt > 0) etapes.push({ postId: "C3", label: "Coupe LMT", phase: "coupe", estimatedMin: Math.round(lmt) });
    if (dt > 0)  etapes.push({ postId: "C4", label: "Coupe 2 têtes", phase: "coupe", estimatedMin: Math.round(dt) });
    if (renfort > 0) etapes.push({ postId: "C5", label: "Renfort acier", phase: "coupe", estimatedMin: Math.round(renfort) });
    if (soudure > 0) etapes.push({ postId: "C6", label: "Soudure PVC", phase: "coupe", estimatedMin: Math.round(soudure) });
    if (poincon > 0) etapes.push({ postId: "C6", label: "Poinçon ALU", phase: "coupe", estimatedMin: Math.round(poincon) });

    // Si HS, tout en C3
    if (isHS && etapes.length === 0) {
      etapes.push({ postId: "C3", label: "Coupe HS", phase: "coupe", estimatedMin: temps.par_poste.coupe });
    }
  }

  // ── Montage ──
  if (temps.par_poste.coulissant > 0) {
    const pid = isGland ? "M2" : "M1";
    etapes.push({ postId: pid, label: isGland ? "Dorm. galandage" : "Dorm. coulissant", phase: "montage", estimatedMin: temps.par_poste.coulissant });
  }
  if (temps.par_poste.frappes > 0) {
    if (isHS) {
      etapes.push({ postId: "MHS", label: "Montage HS", phase: "montage", estimatedMin: temps.par_poste.frappes });
    } else if (tm.famille === "porte") {
      etapes.push({ postId: "M3", label: "Portes ALU", phase: "montage", estimatedMin: temps.par_poste.frappes });
    } else {
      // Frappes : répartir entre F1 (dormant), F2 (ouvrants+ferrage+vitrage), F3 (mise en bois+contrôle)
      const ferrage = 10 * tm.ouvrants * quantite;
      const prep = 5 * quantite;
      const meb = 5 * quantite;
      const vitFrappe = 10 * tm.ouvrants * quantite;
      const controle = (2 + 5) * quantite;
      etapes.push({ postId: "F1", label: "Dorm. frappe", phase: "montage", estimatedMin: Math.round(prep) });
      etapes.push({ postId: "F2", label: "Ouv.+ferr.+vitr.", phase: "montage", estimatedMin: Math.round(ferrage + vitFrappe) });
      etapes.push({ postId: "F3", label: "Mise bois+CQ", phase: "montage", estimatedMin: Math.round(meb + controle) });
    }
  }

  // ── Vitrage ──
  if (temps.par_poste.vitrage_ov > 0) {
    const pid = (isCoul || isGland) ? "V2" : isHS ? "V1" : "V1";
    etapes.push({ postId: pid, label: (isCoul || isGland) ? "Vitr. Coul/Gal" : "Vitr. Frappe", phase: "vitrage", estimatedMin: temps.par_poste.vitrage_ov });
  }

  return etapes.filter(e => e.estimatedMin > 0);
}

/**
 * Matrice complète de tous les types avec leurs routages.
 */
export function getMatriceRoutage() {
  return Object.keys(TYPES_MENUISERIE).map(id => ({
    typeId: id,
    label: TYPES_MENUISERIE[id].label,
    etapes: getRoutage(id, 1),
    totalMin: getRoutage(id, 1).reduce((s: number, e: EtapeRoutage) => s + e.estimatedMin, 0),
  }));
}
