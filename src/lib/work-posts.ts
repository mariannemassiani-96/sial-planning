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
}

const COLOR_COUPE = "#42A5F5";
const COLOR_MONTAGE = "#FFA726";
const COLOR_VITRAGE = "#26C6DA";
const COLOR_ISULA = "#4DB6AC";
const COLOR_LOG = "#CE93D8";
const COLOR_AUTRE = "#78909C";

const T_DEFAULT = 240;

export const WORK_POSTS: WorkPostDef[] = [
  // ── SIAL Coupe & Prépa ─────────────────────────────────────────────────
  { id: "C1", label: "Déchargement + déballage", shortLabel: "Déballage",   atelier: "SIAL", phase: "coupe", capacityMinDay: 1620, maxOperators: 3, tamponMinAfter: T_DEFAULT, color: COLOR_COUPE, visible: false, sortOrder: 1 },
  { id: "C2", label: "Préparation barres",       shortLabel: "Prépa barres", atelier: "SIAL", phase: "coupe", capacityMinDay: 1620, maxOperators: 3, tamponMinAfter: T_DEFAULT, color: COLOR_COUPE, visible: true,  sortOrder: 2 },
  { id: "C3", label: "Coupe LMT 65",             shortLabel: "Coupe LMT",   atelier: "SIAL", phase: "coupe", capacityMinDay: 1620, maxOperators: 3, tamponMinAfter: T_DEFAULT, color: COLOR_COUPE, visible: true,  sortOrder: 3 },
  { id: "C4", label: "Coupe double tête",        shortLabel: "Coupe 2 têtes", atelier: "SIAL", phase: "coupe", capacityMinDay: 540, maxOperators: 1, tamponMinAfter: T_DEFAULT, color: COLOR_COUPE, visible: true,  sortOrder: 4 },
  { id: "C5", label: "Coupe renfort acier",      shortLabel: "Renfort acier", atelier: "SIAL", phase: "coupe", capacityMinDay: 540, maxOperators: 1, tamponMinAfter: T_DEFAULT, color: COLOR_COUPE, visible: true,  sortOrder: 5 },
  { id: "C6", label: "Soudure PVC",              shortLabel: "Soudure PVC", atelier: "SIAL", phase: "coupe", capacityMinDay: 540,  maxOperators: 1, tamponMinAfter: T_DEFAULT, color: COLOR_COUPE, visible: true,  sortOrder: 6 },

  // ── SIAL Montage Coulissants/Galandages/Portes ─────────────────────────
  { id: "M1", label: "Dormants coulissants",     shortLabel: "Dorm. couliss.", atelier: "SIAL", phase: "montage", capacityMinDay: 1080, maxOperators: 2, tamponMinAfter: T_DEFAULT, color: COLOR_MONTAGE, visible: true, sortOrder: 1 },
  { id: "M2", label: "Dormants galandage",       shortLabel: "Dorm. galand.", atelier: "SIAL", phase: "montage", capacityMinDay: 1080, maxOperators: 2, tamponMinAfter: T_DEFAULT, color: COLOR_MONTAGE, visible: true, sortOrder: 2 },
  { id: "M3", label: "Portes ALU",               shortLabel: "Portes ALU",  atelier: "SIAL", phase: "montage", capacityMinDay: 1080, maxOperators: 2, tamponMinAfter: T_DEFAULT, color: COLOR_MONTAGE, visible: true, sortOrder: 3 },
  // ── SIAL Montage Frappes ───────────────────────────────────────────────
  { id: "F1", label: "Dormants frappe ALU",      shortLabel: "Dorm. frappe", atelier: "SIAL", phase: "montage", capacityMinDay: 1080, maxOperators: 2, tamponMinAfter: T_DEFAULT, color: COLOR_MONTAGE, visible: true, sortOrder: 4 },
  { id: "F2", label: "Ouvrants frappe + ferrage", shortLabel: "Ouv.+ferrage", atelier: "SIAL", phase: "montage", capacityMinDay: 1080, maxOperators: 2, tamponMinAfter: T_DEFAULT, color: COLOR_MONTAGE, visible: true, sortOrder: 5 },
  { id: "F3", label: "Mise en bois + contrôle",  shortLabel: "Mise bois+CQ", atelier: "SIAL", phase: "montage", capacityMinDay: 1080, maxOperators: 2, tamponMinAfter: T_DEFAULT, color: COLOR_MONTAGE, visible: true, sortOrder: 6 },
  { id: "MHS", label: "Montage Hors Standard",   shortLabel: "Montage HS",  atelier: "SIAL", phase: "montage", capacityMinDay: 480,  maxOperators: 1, tamponMinAfter: T_DEFAULT, color: COLOR_MONTAGE, visible: true, sortOrder: 7 },

  // ── SIAL Vitrage & Expédition ──────────────────────────────────────────
  { id: "V1", label: "Vitrage menuiserie frappes", shortLabel: "Vitr. Frappe",  atelier: "SIAL", phase: "vitrage", capacityMinDay: 480, maxOperators: 2, tamponMinAfter: T_DEFAULT, color: COLOR_VITRAGE, visible: true, sortOrder: 1 },
  { id: "V2", label: "Vitrage coulissant/galandage", shortLabel: "Vitr. Coul/Gal", atelier: "SIAL", phase: "vitrage", capacityMinDay: 480, maxOperators: 2, tamponMinAfter: T_DEFAULT, color: COLOR_VITRAGE, visible: true, sortOrder: 2 },
  { id: "V3", label: "Emballage + expédition",     shortLabel: "Emballage",   atelier: "SIAL", phase: "vitrage", capacityMinDay: 480,  maxOperators: 2, tamponMinAfter: T_DEFAULT, color: COLOR_VITRAGE, visible: true, sortOrder: 3 },

  // ── ISULA Vitrage isolant (lun, mar, jeu uniquement) ───────────────────
  // Note : numérotation rétro-compatible avec les planning sauvegardés du
  // projet (I3=intercalaire, I4=assemblage). Ordre du flux SPEC respecté
  // via `sortOrder`.
  { id: "I1", label: "Réception verre",                    shortLabel: "Réception",  atelier: "ISULA", phase: "isula", capacityMinDay: 840, maxOperators: 2, tamponMinAfter: T_DEFAULT, color: COLOR_ISULA, visible: true, sortOrder: 1 },
  { id: "I2", label: "Coupe float / feuilleté / formes",   shortLabel: "Coupe verre", atelier: "ISULA", phase: "isula", capacityMinDay: 840, maxOperators: 2, tamponMinAfter: T_DEFAULT, color: COLOR_ISULA, visible: true, sortOrder: 2 },
  { id: "I3", label: "Coupe intercalaire",                 shortLabel: "Coupe interc.", atelier: "ISULA", phase: "isula", capacityMinDay: 420, maxOperators: 1, tamponMinAfter: T_DEFAULT, color: COLOR_ISULA, visible: true, sortOrder: 3 },
  { id: "I4", label: "Assemblage VI",                      shortLabel: "Assemblage VI", atelier: "ISULA", phase: "isula", capacityMinDay: 840, maxOperators: 2, tamponMinAfter: T_DEFAULT, color: COLOR_ISULA, visible: true, sortOrder: 5 },
  { id: "I5", label: "Butyle",                             shortLabel: "Butyle",     atelier: "ISULA", phase: "isula", capacityMinDay: 420, maxOperators: 1, tamponMinAfter: T_DEFAULT, color: COLOR_ISULA, visible: false, sortOrder: 4 },
  { id: "I6", label: "Gaz + scellement",                   shortLabel: "Gaz+scell.", atelier: "ISULA", phase: "isula", capacityMinDay: 840, maxOperators: 2, tamponMinAfter: T_DEFAULT, color: COLOR_ISULA, visible: false, sortOrder: 6 },
  { id: "I7", label: "Contrôle final CEKAL",               shortLabel: "Ctrl CEKAL", atelier: "ISULA", phase: "isula", capacityMinDay: 420, maxOperators: 1, tamponMinAfter: T_DEFAULT, color: COLOR_ISULA, visible: false, sortOrder: 7 },
  { id: "I8", label: "Sortie chaîne + rangement",          shortLabel: "Sortie+rang.", atelier: "ISULA", phase: "isula", capacityMinDay: 1050, maxOperators: 3, tamponMinAfter: T_DEFAULT, color: COLOR_ISULA, visible: false, sortOrder: 8 },

  // ── Logistique ─────────────────────────────────────────────────────────
  { id: "L4", label: "Prépa accessoires fabrication", shortLabel: "Prépa acc.", atelier: "SIAL", phase: "logistique", capacityMinDay: 480, maxOperators: 2, tamponMinAfter: T_DEFAULT, color: COLOR_LOG, visible: true, sortOrder: 1 },
  { id: "L6", label: "Réalisation des palettes",      shortLabel: "Palettes",   atelier: "SIAL", phase: "logistique", capacityMinDay: 480, maxOperators: 2, tamponMinAfter: T_DEFAULT, color: COLOR_LOG, visible: true, sortOrder: 2 },
  { id: "L7", label: "Chargement camion",             shortLabel: "Chargement", atelier: "SIAL", phase: "logistique", capacityMinDay: 480, maxOperators: 2, tamponMinAfter: T_DEFAULT, color: COLOR_LOG, visible: true, sortOrder: 3 },
  { id: "L1", label: "Déchargement fournisseur",      shortLabel: "Déch. fourn.", atelier: "SIAL", phase: "logistique", capacityMinDay: 480, maxOperators: 2, tamponMinAfter: T_DEFAULT, color: COLOR_LOG, visible: false, sortOrder: 4 },
  { id: "L2", label: "Rangement stock profilés",      shortLabel: "Stock prof.", atelier: "SIAL", phase: "logistique", capacityMinDay: 480, maxOperators: 2, tamponMinAfter: T_DEFAULT, color: COLOR_LOG, visible: false, sortOrder: 5 },
  { id: "L3", label: "Rangement stock accessoires",   shortLabel: "Stock acc.", atelier: "SIAL", phase: "logistique", capacityMinDay: 480, maxOperators: 2, tamponMinAfter: T_DEFAULT, color: COLOR_LOG, visible: false, sortOrder: 6 },
  { id: "L5", label: "Prépa accessoires livraison",   shortLabel: "Acc. livr.", atelier: "SIAL", phase: "logistique", capacityMinDay: 480, maxOperators: 2, tamponMinAfter: T_DEFAULT, color: COLOR_LOG, visible: false, sortOrder: 7 },

  // ── Autre / Back-office ────────────────────────────────────────────────
  { id: "AUT",   label: "Autre",       shortLabel: "Autre",      atelier: "SIAL", phase: "autre", capacityMinDay: 480, maxOperators: null, tamponMinAfter: 0, color: COLOR_AUTRE, visible: true,  sortOrder: 1 },
  { id: "MAINT", label: "Maintenance", shortLabel: "Maint.",     atelier: "SIAL", phase: "autre", capacityMinDay: 480, maxOperators: null, tamponMinAfter: 0, color: COLOR_AUTRE, visible: false, sortOrder: 2 },
  { id: "FORM",  label: "Formation",   shortLabel: "Formation",  atelier: "SIAL", phase: "autre", capacityMinDay: 480, maxOperators: null, tamponMinAfter: 0, color: COLOR_AUTRE, visible: false, sortOrder: 3 },
  { id: "SUPERV", label: "Supervision", shortLabel: "Supervision", atelier: "SIAL", phase: "autre", capacityMinDay: 480, maxOperators: null, tamponMinAfter: 0, color: COLOR_AUTRE, visible: false, sortOrder: 4 },

  // ── Aliases historiques (rétro-compat planning sauvegardés) ────────────
  // Anciens IDs ISULA utilisés par les vues avant l'alignement SPEC.
  // À supprimer quand tous les planning existants seront migrés vers I1-I8.
  { id: "IL", label: "Coupe Lisec (legacy)", shortLabel: "Coupe Lisec",  atelier: "ISULA", phase: "isula", capacityMinDay: 420, maxOperators: 1, tamponMinAfter: T_DEFAULT, color: COLOR_ISULA, visible: true, sortOrder: 90 },
  { id: "IB", label: "Coupe Bottero (legacy)", shortLabel: "Coupe Bottero", atelier: "ISULA", phase: "isula", capacityMinDay: 420, maxOperators: 1, tamponMinAfter: T_DEFAULT, color: COLOR_ISULA, visible: true, sortOrder: 91 },
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

/** Phases dans l'ordre du flux de production. */
export const PHASES_ORDER: Phase[] = ["coupe", "montage", "vitrage", "isula", "logistique", "autre"];

/** Phase suivante dans le flux (null si fin). */
export function nextPhase(phase: Phase): Phase | null {
  const i = PHASES_ORDER.indexOf(phase);
  return i >= 0 && i < PHASES_ORDER.length - 1 ? PHASES_ORDER[i + 1] : null;
}
