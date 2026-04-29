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

// ── Précompilation du cache (au chargement du module) ────────────────
for (const typeId of Object.keys(TYPES_MENUISERIE)) {
  ensureCache(typeId);
}

// ── API publique : routage par poste réel ──────────────────────────

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
      const controle = (2 + 5) * quantite;
      etapes.push({ postId: "F1", label: "Dorm. frappe", phase: "montage", estimatedMin: Math.round(prep) });
      etapes.push({ postId: "F2", label: "Ouv.+ferrage", phase: "montage", estimatedMin: Math.round(ferrage) });
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
