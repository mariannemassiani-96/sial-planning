// ═══════════════════════════════════════════════════════════════════════
// SOURCE UNIQUE DES POSTES DE TRAVAIL
//
// Cette liste est la référence : elle est seedée en base au démarrage
// (via `/api/operators` ensureWorkPosts) et exposée aux composants
// via `/api/posts` + le hook `useWorkPosts()`.
//
// Aligné sur SPEC_PLANNING_SIAL_ISULA.md sections 3 & 6.
// ═══════════════════════════════════════════════════════════════════════

export type Phase = "coupe" | "montage" | "vitrage" | "isula" | "logistique" | "autre";

export interface WorkPostDef {
  id: string;
  label: string;
  shortLabel: string;
  atelier: "SIAL" | "ISULA";
  phase: Phase;
  /** Capacité maximale en minutes par jour (machine + opérateurs nominaux). */
  capacityMinDay: number;
  /** Nombre maximum d'opérateurs simultanés. null = pas de limite. */
  maxOperators: number | null;
  /** Tampon en minutes après cette étape avant la suivante (4h = 240 par défaut). */
  tamponMinAfter: number;
  /** Couleur d'affichage uniforme dans toutes les vues. */
  color: string;
  /** Visible par défaut dans les vues. Les postes "back-office" (formation,
   *  maintenance, supervision) sont masqués par défaut. */
  visible: boolean;
  /** Ordre d'affichage dans la phase. */
  sortOrder: number;

  // ── Planification autonome ─────────────────────────────────────────────
  /**
   * Nombre maximum d'opérateurs **utiles** simultanément sur ce poste.
   * Au-delà, ajouter des personnes ne va pas plus vite (gêne, machine unique).
   * Différent de `maxOperators` qui est une contrainte dure.
   */
  parallelism: number;
  /**
   * Courbe d'efficacité : gain de vitesse selon le nombre d'opérateurs.
   * Index = nb_ops - 1. Ex: [1.0, 1.8, 2.4] = 1op→×1, 2ops→×1.8, 3ops→×2.4.
   * La longueur doit correspondre à `parallelism`.
   */
  parallelGain: number[];
  /**
   * Si vrai, **un seul opérateur** doit faire la tâche du début à la fin
   * (qualité, complexité, sur-mesure). L'algorithme ne forcera jamais
   * plusieurs opérateurs sur ce poste, même en mode crash.
   */
  monolithic: boolean;
}

const COLOR_COUPE = "#42A5F5";
const COLOR_MONTAGE = "#FFA726";
const COLOR_VITRAGE = "#26C6DA";
const COLOR_ISULA = "#4DB6AC";
const COLOR_LOG = "#CE93D8";
const COLOR_AUTRE = "#78909C";

const T_DEFAULT = 240;

// ── Helpers défauts planification autonome ──────────────────────────────
// Valeurs INITIALES — à ajuster avec l'expérience terrain. Le cerveau
// peut aussi les apprendre à terme à partir des pointages réels.
const PARALLEL_LINEAIRE_3 = [1.0, 1.8, 2.4];   // poste partageable (LMT, prépa)
const PARALLEL_LINEAIRE_2 = [1.0, 1.7];        // 2 ops sont utiles, 3+ inutile
const PARALLEL_FAIBLE_2   = [1.0, 1.5];        // 2 ops en parallèle = +50 % seulement
const PARALLEL_MONO       = [1.0];             // 1 op = pas de gain à ajouter d'ops

// Helper pour rester lisible dans la liste plus bas.
function P(id: string, label: string, shortLabel: string, atelier: "SIAL" | "ISULA", phase: Phase,
  capacityMinDay: number, maxOperators: number | null, tampon: number,
  color: string, visible: boolean, sortOrder: number,
  parallelism: number, parallelGain: number[], monolithic: boolean,
): WorkPostDef {
  return { id, label, shortLabel, atelier, phase, capacityMinDay, maxOperators,
    tamponMinAfter: tampon, color, visible, sortOrder, parallelism, parallelGain, monolithic };
}

export const WORK_POSTS: WorkPostDef[] = [
  // ── SIAL Coupe & Prépa ─────────────────────────────────────────────────
  P("C1", "Déchargement + déballage", "Déballage",   "SIAL", "coupe", 1620, 3, T_DEFAULT, COLOR_COUPE, false, 1, 3, PARALLEL_LINEAIRE_3, false),
  P("C2", "Préparation barres",       "Prépa barres", "SIAL", "coupe", 1620, 3, T_DEFAULT, COLOR_COUPE, true,  2, 3, PARALLEL_LINEAIRE_3, false),
  P("C3", "Coupe LMT 65",             "Coupe LMT",   "SIAL", "coupe", 1620, 3, T_DEFAULT, COLOR_COUPE, true,  3, 3, PARALLEL_LINEAIRE_3, false),
  // C4/C5/C6 : machines uniques → 1 op du début à fin (monolithique).
  P("C4", "Coupe double tête",        "Coupe 2 têtes", "SIAL", "coupe", 540, 1, T_DEFAULT, COLOR_COUPE, true,  4, 1, PARALLEL_MONO, true),
  P("C5", "Coupe renfort acier",      "Renfort acier", "SIAL", "coupe", 540, 1, T_DEFAULT, COLOR_COUPE, true,  5, 1, PARALLEL_MONO, true),
  P("C6", "Soudure PVC",              "Soudure PVC", "SIAL", "coupe", 540, 1, T_DEFAULT, COLOR_COUPE, true,  6, 1, PARALLEL_MONO, true),

  // ── SIAL Montage Coulissants/Galandages/Portes ─────────────────────────
  // M1/M3 : 2 ops utiles (un dormant + un ouvrant en parallèle).
  P("M1", "Dormants coulissants",     "Dorm. couliss.", "SIAL", "montage", 1080, 2, T_DEFAULT, COLOR_MONTAGE, true, 1, 2, PARALLEL_LINEAIRE_2, false),
  // M2 : galandage = grand format, qualité critique → 1 op du début à fin (Alain).
  P("M2", "Dormants galandage",       "Dorm. galand.", "SIAL", "montage", 1080, 1, T_DEFAULT, COLOR_MONTAGE, true, 2, 1, PARALLEL_MONO, true),
  P("M3", "Portes ALU",               "Portes ALU",    "SIAL", "montage", 1080, 2, T_DEFAULT, COLOR_MONTAGE, true, 3, 2, PARALLEL_LINEAIRE_2, false),
  // ── SIAL Montage Frappes ───────────────────────────────────────────────
  // F1 : préparation dormants — parallélisable.
  P("F1", "Dormants frappe ALU",      "Dorm. frappe",  "SIAL", "montage", 1080, 2, T_DEFAULT, COLOR_MONTAGE, true, 4, 2, PARALLEL_LINEAIRE_2, false),
  // F2 : ferrage = qualité critique, ergonomique → 1 op à la fois par cadre.
  P("F2", "Ouvrants frappe + ferrage", "Ouv.+ferrage", "SIAL", "montage", 1080, 2, T_DEFAULT, COLOR_MONTAGE, true, 5, 2, PARALLEL_FAIBLE_2, false),
  // F3 : contrôle final + mise en bois — peut paralléliser légèrement.
  P("F3", "Mise en bois + contrôle",  "Mise bois+CQ",  "SIAL", "montage", 1080, 2, T_DEFAULT, COLOR_MONTAGE, true, 6, 2, PARALLEL_FAIBLE_2, false),
  // MHS : sur-mesure, JP seul → monolithique.
  P("MHS", "Montage Hors Standard",   "Montage HS",   "SIAL", "montage", 480, 1, T_DEFAULT, COLOR_MONTAGE, true, 7, 1, PARALLEL_MONO, true),

  // ── SIAL Vitrage & Expédition ──────────────────────────────────────────
  P("V1", "Vitrage menuiserie frappes", "Vitr. Frappe",   "SIAL", "vitrage", 480, 2, T_DEFAULT, COLOR_VITRAGE, true, 1, 2, PARALLEL_FAIBLE_2, false),
  P("V2", "Vitrage coulissant/galandage", "Vitr. Coul/Gal", "SIAL", "vitrage", 480, 2, T_DEFAULT, COLOR_VITRAGE, true, 2, 2, PARALLEL_FAIBLE_2, false),
  P("V3", "Emballage + expédition",     "Emballage",     "SIAL", "vitrage", 480, 2, T_DEFAULT, COLOR_VITRAGE, true, 3, 2, PARALLEL_LINEAIRE_2, false),

  // ── ISULA Vitrage isolant (lun, mar, jeu uniquement) ───────────────────
  P("I1", "Réception verre",                  "Réception",  "ISULA", "isula", 840, 2, T_DEFAULT, COLOR_ISULA, true,  1, 2, PARALLEL_LINEAIRE_2, false),
  P("I2", "Coupe float / feuilleté / formes", "Coupe verre","ISULA", "isula", 840, 2, T_DEFAULT, COLOR_ISULA, true,  2, 2, PARALLEL_FAIBLE_2,   false),
  P("I3", "Coupe intercalaire",               "Coupe interc.", "ISULA", "isula", 420, 1, T_DEFAULT, COLOR_ISULA, true,  3, 1, PARALLEL_MONO,       true),
  P("I4", "Assemblage VI",                    "Assemblage VI","ISULA", "isula", 840, 2, T_DEFAULT, COLOR_ISULA, true,  5, 2, PARALLEL_FAIBLE_2,   false),
  P("I5", "Butyle",                           "Butyle",      "ISULA", "isula", 420, 1, T_DEFAULT, COLOR_ISULA, false, 4, 1, PARALLEL_MONO,       true),
  P("I6", "Gaz + scellement",                 "Gaz+scell.",  "ISULA", "isula", 840, 2, T_DEFAULT, COLOR_ISULA, false, 6, 2, PARALLEL_FAIBLE_2,   false),
  P("I7", "Contrôle final CEKAL",             "Ctrl CEKAL",  "ISULA", "isula", 420, 1, T_DEFAULT, COLOR_ISULA, false, 7, 1, PARALLEL_MONO,       true),
  P("I8", "Sortie chaîne + rangement",        "Sortie+rang.","ISULA", "isula", 1050, 3, T_DEFAULT, COLOR_ISULA, false, 8, 3, PARALLEL_LINEAIRE_3, false),

  // ── Logistique ─────────────────────────────────────────────────────────
  P("L4", "Prépa accessoires fabrication", "Prépa acc.",   "SIAL", "logistique", 480, 2, T_DEFAULT, COLOR_LOG, true,  1, 2, PARALLEL_LINEAIRE_2, false),
  P("L6", "Réalisation des palettes",      "Palettes",     "SIAL", "logistique", 480, 2, T_DEFAULT, COLOR_LOG, true,  2, 2, PARALLEL_LINEAIRE_2, false),
  P("L7", "Chargement camion",             "Chargement",   "SIAL", "logistique", 480, 2, T_DEFAULT, COLOR_LOG, true,  3, 2, PARALLEL_LINEAIRE_2, false),
  P("L1", "Déchargement fournisseur",      "Déch. fourn.", "SIAL", "logistique", 480, 2, T_DEFAULT, COLOR_LOG, false, 4, 2, PARALLEL_LINEAIRE_2, false),
  P("L2", "Rangement stock profilés",      "Stock prof.",  "SIAL", "logistique", 480, 2, T_DEFAULT, COLOR_LOG, false, 5, 2, PARALLEL_LINEAIRE_2, false),
  P("L3", "Rangement stock accessoires",   "Stock acc.",   "SIAL", "logistique", 480, 2, T_DEFAULT, COLOR_LOG, false, 6, 2, PARALLEL_LINEAIRE_2, false),
  P("L5", "Prépa accessoires livraison",   "Acc. livr.",   "SIAL", "logistique", 480, 2, T_DEFAULT, COLOR_LOG, false, 7, 2, PARALLEL_LINEAIRE_2, false),

  // ── Autre / Back-office ────────────────────────────────────────────────
  P("AUT",    "Autre",       "Autre",       "SIAL", "autre", 480, null, 0, COLOR_AUTRE, true,  1, 3, PARALLEL_LINEAIRE_3, false),
  P("MAINT",  "Maintenance", "Maint.",      "SIAL", "autre", 480, null, 0, COLOR_AUTRE, false, 2, 2, PARALLEL_LINEAIRE_2, false),
  P("FORM",   "Formation",   "Formation",   "SIAL", "autre", 480, null, 0, COLOR_AUTRE, false, 3, 1, PARALLEL_MONO,       true),
  P("SUPERV", "Supervision", "Supervision", "SIAL", "autre", 480, null, 0, COLOR_AUTRE, false, 4, 1, PARALLEL_MONO,       true),

  // ── Aliases historiques (rétro-compat planning sauvegardés) ────────────
  P("IL", "Coupe Lisec (legacy)",   "Coupe Lisec",   "ISULA", "isula", 420, 1, T_DEFAULT, COLOR_ISULA, true, 90, 1, PARALLEL_MONO, true),
  P("IB", "Coupe Bottero (legacy)", "Coupe Bottero", "ISULA", "isula", 420, 1, T_DEFAULT, COLOR_ISULA, true, 91, 1, PARALLEL_MONO, true),
];

const POST_INDEX = new Map(WORK_POSTS.map(p => [p.id, p] as const));

/** Retourne la définition d'un poste par son id, ou null. */
export function getWorkPost(id: string): WorkPostDef | null {
  return POST_INDEX.get(id) || null;
}

/** Renvoie tous les postes visibles d'une phase, triés. */
export function getPostsByPhase(phase: Phase): WorkPostDef[] {
  return WORK_POSTS
    .filter(p => p.phase === phase && p.visible)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Label court d'un poste (utilisé partout dans les vues). */
export function postShortLabel(id: string): string {
  return POST_INDEX.get(id)?.shortLabel || id;
}

/** Label long d'un poste. */
export function postLabel(id: string): string {
  return POST_INDEX.get(id)?.label || id;
}

/** Couleur du poste. */
export function postColor(id: string): string {
  return POST_INDEX.get(id)?.color || COLOR_AUTRE;
}

/** Tampon (minutes) à observer après ce poste. Par défaut 240 (4h). */
export function postTamponAfter(id: string): number {
  const p = POST_INDEX.get(id);
  return p?.tamponMinAfter ?? 240;
}

/** Nombre maximum d'opérateurs simultanés sur ce poste. */
export function postMaxOperators(id: string): number | null {
  const p = POST_INDEX.get(id);
  return p?.maxOperators ?? null;
}

/** Capacité en minutes par jour (machine × opérateurs nominaux). */
export function postCapacityMinDay(id: string): number {
  return POST_INDEX.get(id)?.capacityMinDay ?? 480;
}

/** Nombre d'opérateurs utiles maximum (au-delà, ajouter des ops ne va pas plus vite). */
export function postParallelism(id: string): number {
  return POST_INDEX.get(id)?.parallelism ?? 1;
}

/** Le poste exige-t-il un seul opérateur du début à la fin ? (qualité critique) */
export function postIsMonolithic(id: string): boolean {
  return POST_INDEX.get(id)?.monolithic ?? false;
}

/**
 * Renvoie le gain de vitesse pour `nbOps` opérateurs sur ce poste.
 *  1 op  → 1.0
 *  2 ops → ex. 1.7 (×1.7 plus vite que 1 op)
 *  3 ops → ex. 2.4
 * Au-delà de la `parallelism`, ne dépasse pas le maximum de la courbe.
 */
export function postParallelGain(id: string, nbOps: number): number {
  const def = POST_INDEX.get(id);
  if (!def || nbOps < 1) return 1;
  const curve = def.parallelGain;
  if (curve.length === 0) return 1;
  const idx = Math.min(nbOps - 1, curve.length - 1);
  return curve[idx];
}

/**
 * Décision de placement avec prise en compte des niveaux de compétence.
 * Niveaux : 0=aucun, 1=apprenti (a besoin d'un expert), 2=autonome, 3=expert.
 *
 * Renvoie :
 *   - `nbProducers` : opérateurs comptés dans le temps machine (vitesse).
 *   - `requiresSupervisor` : si vrai, 1 expert supplémentaire doit accompagner
 *     (sans réduire le temps machine — c'est du temps de qualité/formation).
 */
export interface NbOpsDecision {
  nbProducers: number;
  requiresSupervisor: boolean;
}

/**
 * Choisit le nombre optimal d'opérateurs pour une tâche selon la stratégie :
 *  - `crash`  : on veut aller le plus vite possible → max parallelism
 *  - `focus`  : on veut la meilleure qualité/efficience → 1 op (sauf si poste interdit)
 *  - `normal` : sweet spot, gain par op le meilleur (pas de gaspillage)
 *
 * Respecte toujours `monolithic` (renvoie 1) et `maxOperators`.
 *
 * @param availableLevels Niveaux des opérateurs disponibles, triés par
 *   préférence (les meilleurs en premier). Ex: [3, 2, 1] = un expert, un
 *   autonome, un apprenti.
 *   Si `requiresSupervisor` est vrai à la sortie, l'appelant doit affecter
 *   un opérateur de niveau ≥3 en plus, qui n'est PAS compté dans le temps
 *   machine (formation / contrôle qualité).
 */
export function chooseNbOps(
  postId: string,
  strategy: "crash" | "focus" | "normal",
  availableLevels: number[] | number,
): NbOpsDecision {
  const def = POST_INDEX.get(postId);
  const levels = typeof availableLevels === "number"
    ? Array.from({ length: availableLevels }, () => 2) // tous présumés autonomes
    : availableLevels;
  const availableOps = levels.length;
  if (!def) return { nbProducers: Math.min(1, availableOps), requiresSupervisor: false };
  if (def.monolithic) {
    // Sur un poste monolithique, on prend le meilleur niveau dispo. Si seul un
    // apprenti est dispo, on demande un superviseur.
    const onlyApprenti = levels.length > 0 && levels[0] === 1;
    return { nbProducers: Math.min(1, availableOps), requiresSupervisor: onlyApprenti };
  }

  const hardMax = def.maxOperators ?? def.parallelism;
  const softMax = Math.min(def.parallelism, hardMax, availableOps);
  if (softMax < 1) return { nbProducers: 0, requiresSupervisor: false };

  let nbProducers: number;
  if (strategy === "focus") {
    nbProducers = 1;
  } else if (strategy === "crash") {
    nbProducers = softMax;
  } else {
    // normal : sweet spot — meilleur ratio gain/op
    let bestN = 1;
    let bestRatio = def.parallelGain[0] ?? 1;
    for (let n = 2; n <= softMax; n++) {
      const gain = def.parallelGain[Math.min(n - 1, def.parallelGain.length - 1)] ?? 1;
      const ratio = gain / n;
      if (ratio > bestRatio + 0.05) {
        bestRatio = ratio;
        bestN = n;
      }
    }
    nbProducers = bestN;
  }

  // Vérifier si un superviseur est nécessaire : on regarde les niveaux des
  // `nbProducers` premiers opérateurs (les meilleurs). Si tous sont des
  // apprentis (niveau 1), on demande un expert en plus.
  const producers = levels.slice(0, nbProducers);
  const allApprenti = producers.length > 0 && producers.every(l => l === 1);
  const noExpertParmi = producers.every(l => l < 3);
  const requiresSupervisor = allApprenti || (noExpertParmi && nbProducers === 1 && producers[0] === 1);

  return { nbProducers, requiresSupervisor };
}

/**
 * Détermine la stratégie pour un chantier en fonction de l'urgence.
 *  - dispoJours / besoinJours < 1.2 → "crash" (manque de temps, il faut accélérer)
 *  - > 2.0 → "focus" (on a tout le temps, qualité d'abord)
 *  - sinon → "normal"
 */
export function detectStrategy(
  joursDispo: number,
  joursBesoin: number,
): "crash" | "focus" | "normal" {
  if (joursBesoin <= 0) return "normal";
  const ratio = joursDispo / joursBesoin;
  if (ratio < 1.2) return "crash";
  if (ratio > 2.0) return "focus";
  return "normal";
}

/** Phases dans l'ordre du flux de production. */
export const PHASES_ORDER: Phase[] = ["coupe", "montage", "vitrage", "isula", "logistique", "autre"];

/** Phase suivante dans le flux (null si fin). */
export function nextPhase(phase: Phase): Phase | null {
  const i = PHASES_ORDER.indexOf(phase);
  return i >= 0 && i < PHASES_ORDER.length - 1 ? PHASES_ORDER[i + 1] : null;
}
