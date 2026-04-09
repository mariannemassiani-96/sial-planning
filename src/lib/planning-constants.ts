// ── Seuils stocks tampons (min / cible / max) ────────────────────────────
export const BUFFER_THRESHOLDS: Record<string, { min: number; cible: number; max: number; unit: string; label: string }> = {
  PROFILES_COUPES:      { min: 1, cible: 2,   max: 4,   unit: "chariots", label: "Profilés coupés" },
  VITRAGES_ISULA:       { min: 2, cible: 3,   max: 6,   unit: "chariots", label: "Vitrages ISULA prêts" },
  OUVRANTS_VITRES:      { min: 2, cible: 4,   max: 10,  unit: "palettes", label: "Ouvrants coulissants vitrés" },
  ACCESSOIRES_PREPARES: { min: 1, cible: 3,   max: 5,   unit: "jours",    label: "Accessoires préparés" },
  PROFILES_BRUTS:       { min: 2, cible: 3,   max: 4,   unit: "semaines", label: "Profilés bruts magasin" },
  VERRE_BRUT_ISULA:     { min: 100, cible: 250, max: 400, unit: "m²",    label: "Verre brut ISULA" },
};

// ── Tampons chemin critique (jours ouvrés) ───────────────────────────────
export const BUFFER_JOURS = {
  entre_etapes_min: 240,       // 4h en minutes
  coupe_livraison: 15,         // jours ouvrés
  isula_livraison_std: 4,      // jours ouvrés
  isula_livraison_gf: 6,       // jours ouvrés (grand format)
};

// ── Jours ISULA actifs (0=dim, 1=lun, 2=mar, 3=mer, 4=jeu, 5=ven, 6=sam) ─
export const ISULA_ACTIVE_DAYS = [1, 2, 4]; // lundi, mardi, jeudi

// ── Postes actifs selon le mode du jour ─────────────────────────────────
export const POSTS_BY_MODE = {
  COULISSANTS: ["C1","C2","C3","C4","C5","C6","M1","M2","M3","V1","V2"],
  FRAPPES:     ["C1","C2","C3","C4","C5","C6","F1","F2","F3","V1","V2"],
};

// ── Seuil alerte ATTENTE_VITRAGE (jours) ─────────────────────────────────
export const ATTENTE_VITRAGE_SEUIL_JOURS = 3;

// ── Labels statuts en français ───────────────────────────────────────────
export const STATUT_LABELS: Record<string, string> = {
  A_LANCER:        "À lancer",
  EN_COURS:        "En cours",
  ATTENTE_VITRAGE: "En attente vitrage",
  ATTENTE_IGU:     "En attente IGU",
  PRET_LIVRAISON:  "Prêt à livrer",
  LIVRE:           "Livré",
  SUSPENDU:        "Suspendu",
};

export const TASK_STATUT_LABELS: Record<string, string> = {
  PENDING:     "À faire",
  IN_PROGRESS: "En cours",
  DONE:        "Terminé",
  BLOCKED:     "Bloqué",
  SKIPPED:     "Ignoré",
};
