// ═══════════════════════════════════════════════════════════════════════════
// AUTO-PLANNING — pose automatiquement les semaines de fabrication
// à partir de la date de livraison souhaitée et des tampons du SPEC.
//
// Règles (SPEC sections 7 et "ISULA S-1") :
//   semaine_logistique = lundi de la semaine de livraison
//   semaine_vitrage    = semaine_logistique - 1 sem  (si pas aucun_vitrage)
//   semaine_montage    = (semaine_vitrage || logistique) - 1 sem
//   semaine_coupe      = semaine_montage - 1 sem
//   semaine_isula      = semaine_montage - 1 sem (-2 si grand format ISULA)
//
// Si la commande n'a pas de date_livraison_souhaitee : tout reste à null.
// ═══════════════════════════════════════════════════════════════════════════

function localStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return localStr(d);
}

function addWeeks(mondayStr: string, weeks: number): string {
  const d = new Date(mondayStr + "T12:00:00");
  d.setDate(d.getDate() + weeks * 7);
  return localStr(d);
}

interface Vitrage {
  fournisseur?: string;
  largeur?: string | number;
  hauteur?: string | number;
}

function hasIsulaVitrage(vitrages: unknown): boolean {
  if (!Array.isArray(vitrages)) return false;
  return (vitrages as Vitrage[]).some(v => (v?.fournisseur || "").toString().toLowerCase() === "isula");
}

function hasGrandFormatIsula(vitrages: unknown): boolean {
  if (!Array.isArray(vitrages)) return false;
  return (vitrages as Vitrage[]).some(v => {
    if ((v?.fournisseur || "").toString().toLowerCase() !== "isula") return false;
    const l = parseFloat(String(v?.largeur || 0));
    const h = parseFloat(String(v?.hauteur || 0));
    return l > 2000 || h > 3000;
  });
}

interface DateLivraison {
  date?: string;
}

function pickEarliestDeliveryDate(cmd: AutoPlanningInput): string | null {
  // Phase 0-A : pose_chantier_date prime sur date_livraison_souhaitee.
  // C'est le RDV poseur ferme qui pilote le backward, pas la livraison camion.
  if (cmd.pose_chantier_date) return cmd.pose_chantier_date;
  if (cmd.date_livraison_souhaitee) return cmd.date_livraison_souhaitee;
  const arr = cmd.dates_livraisons;
  if (!Array.isArray(arr)) return null;
  const dates = (arr as DateLivraison[])
    .map(x => x?.date)
    .filter((d): d is string => !!d)
    .sort();
  return dates[0] || null;
}

/** Phase 0-A : détecte si une commande a au moins une ligne avec laquage externe. */
function detectLaquageDelaiJours(cmd: AutoPlanningInput): number {
  const lignes = Array.isArray(cmd.lignes) ? cmd.lignes : [];
  let max = 0;
  for (const l of lignes as Array<Record<string, unknown>>) {
    if (!l?.laquage_externe) continue;
    const d = parseInt(String(l?.delai_laquage_jours || "5"));
    if (!isNaN(d) && d > max) max = d;
  }
  return max;
}

export interface AutoPlanningInput {
  date_livraison_souhaitee?: string | null;
  /** Phase 0-A : RDV poseur ferme — prioritaire sur date_livraison_souhaitee. */
  pose_chantier_date?: string | null;
  dates_livraisons?: unknown;
  aucune_menuiserie?: boolean;
  aucun_vitrage?: boolean;
  vitrages?: unknown;
  /** Phase 0-A : si vrai, on essaie de garder toutes les phases la même semaine. */
  regroupement_camion?: boolean;
  /** Phase 0-A : lignes (pour détection laquage externe). */
  lignes?: unknown;
}

export interface AutoPlanningResult {
  semaine_logistique: string | null;
  semaine_coupe: string | null;
  semaine_montage: string | null;
  semaine_vitrage: string | null;
  semaine_isula: string | null;
}

/**
 * Calcule les semaines de fabrication à partir de la date de livraison.
 * Renvoie tout `null` si pas de date de livraison.
 */
export function computeAutoSemaines(cmd: AutoPlanningInput): AutoPlanningResult {
  const empty: AutoPlanningResult = {
    semaine_logistique: null,
    semaine_coupe: null,
    semaine_montage: null,
    semaine_vitrage: null,
    semaine_isula: null,
  };

  const livDate = pickEarliestDeliveryDate(cmd);
  if (!livDate) return empty;

  const livMonday = getMondayOf(livDate);
  const semaine_logistique = livMonday;

  // Si aucune fabrication : juste la logistique
  if (cmd.aucune_menuiserie) {
    return { ...empty, semaine_logistique };
  }

  const semaine_vitrage = cmd.aucun_vitrage ? null : addWeeks(livMonday, -1);
  const baseForMontage = semaine_vitrage || semaine_logistique;
  let semaine_montage = addWeeks(baseForMontage, -1);

  // Phase 0-A : si regroupement_camion, on essaie de mettre montage + vitrage
  // dans la même semaine que la logistique (impossible si ISULA ou si le
  // chantier est trop chargé — ce n'est qu'une indication).
  if (cmd.regroupement_camion && !cmd.aucun_vitrage) {
    semaine_montage = baseForMontage;
  }

  let semaine_coupe = addWeeks(semaine_montage, -1);

  // Phase 0-A : si laquage externe, on recule la coupe d'autant de jours
  // ouvrés que `delai_laquage_jours` (arrondi à la semaine sup).
  const laqDelai = detectLaquageDelaiJours(cmd);
  if (laqDelai > 0) {
    const semExtra = Math.max(1, Math.ceil(laqDelai / 5));
    semaine_coupe = addWeeks(semaine_coupe, -semExtra);
  }

  let semaine_isula: string | null = null;
  if (!cmd.aucun_vitrage && hasIsulaVitrage(cmd.vitrages)) {
    const offset = hasGrandFormatIsula(cmd.vitrages) ? -2 : -1;
    semaine_isula = addWeeks(semaine_montage, offset);
  }

  return {
    semaine_logistique,
    semaine_coupe,
    semaine_montage,
    semaine_vitrage,
    semaine_isula,
  };
}

/**
 * Champs qui, s'ils changent, doivent déclencher un recalcul automatique des semaines.
 */
export const AUTO_PLANNING_TRIGGERS = [
  "date_livraison_souhaitee",
  "pose_chantier_date",
  "dates_livraisons",
  "aucune_menuiserie",
  "aucun_vitrage",
  "vitrages",
  "regroupement_camion",
  "lignes",
] as const;

/**
 * Champs `semaine_*` que l'auto-planning peut écrire.
 * Si l'utilisateur saisit explicitement l'un de ces champs dans un PATCH,
 * on ne le ré-écrase pas avec une valeur auto-calculée.
 */
export const AUTO_PLANNING_OUTPUTS = [
  "semaine_logistique",
  "semaine_coupe",
  "semaine_montage",
  "semaine_vitrage",
  "semaine_isula",
] as const;
