// ═══════════════════════════════════════════════════════════════════
// Types des objets `lignes` et `vitrages` stockés dans le JSON Commande.
// Source unique pour SaisieCommande, l'algo de planification, et les
// adaptateurs Commande → Order.
// ═══════════════════════════════════════════════════════════════════

/**
 * Une ligne de menuiserie d'une commande.
 * Tous les champs sont **strings** car le formulaire produit des
 * strings (input type=number renvoie aussi une string en React).
 * Les conversions numériques se font à l'utilisation.
 */
export interface LigneCommande {
  type: string;
  quantite: number;
  coloris: string;

  /** Largeur en millimètres (peut être vide). */
  largeur_mm: string;
  /** Hauteur en millimètres (peut être vide) — Phase 0-A. */
  hauteur_mm: string;
  /** Libellé de lot peinture pour regroupement de série — Phase 0-A. */
  coloris_lot: string;

  /** Sous-traitance laquage extérieur — Phase 0-A. */
  laquage_externe: boolean;
  /** Délai laquage en jours ouvrés (string, ex "7"). */
  delai_laquage_jours: string;

  /** Mécanisme spécifique (motorisation, oscillo lourd, etc.). */
  ferrage_special: string;
  /** Minutes supplémentaires à ajouter au montage. */
  temps_supp_min: string;

  /** id opérateur préféré (clé EQUIPE.id). */
  operateur_prefere: string;
  /** id opérateur à exclure (clé EQUIPE.id). */
  operateur_interdit: string;

  /** Tampon en minutes après cette ligne (défaut 240 si vide). */
  tampon_apres_min: string;

  // ── Hors standard (existant) ───────────────────────────────────────
  hs_nb_profils: string;
  hs_t_coupe: string;
  hs_t_montage: string;
  hs_t_vitrage: string;
  hs_op_montage: string;
  hs_op_vitrage: string;
  hs_notes: string;
}

/** Valeurs par défaut d'une ligne, pour création / reset / migration. */
export const emptyLigneCommande: LigneCommande = {
  type: "ob1_pvc",
  quantite: 1,
  coloris: "blanc",
  largeur_mm: "",
  hauteur_mm: "",
  coloris_lot: "",
  laquage_externe: false,
  delai_laquage_jours: "",
  ferrage_special: "",
  temps_supp_min: "",
  operateur_prefere: "",
  operateur_interdit: "",
  tampon_apres_min: "",
  hs_nb_profils: "",
  hs_t_coupe: "",
  hs_t_montage: "",
  hs_t_vitrage: "",
  hs_op_montage: "jp",
  hs_op_vitrage: "quentin",
  hs_notes: "",
};

/**
 * Une ligne de vitrage isolant d'une commande.
 */
export interface VitrageCommande {
  composition: string;
  quantite: string;
  surface_m2: string;
  fournisseur: string;
  cmd_passee: boolean;
  date_reception: string;
  position: string;
  face_exterieure: string;
  face_interieure: string;
  couleur_intercalaire: string;
  epaisseur_intercalaire: string;
  largeur: string;
  hauteur: string;
  forme: string;
  prix_m2: string;
  prix_total: string;
  largeur_origine: string;
  hauteur_origine: string;
  surface_m2_origine: string;

  /** N° BC fournisseur / ISULA (Phase 0-A). */
  vitrage_id_ext: string;
  /** Index de la ligne menuiserie destinataire (string, "0", "1"…) (Phase 0-A). */
  ligne_menuiserie_id: string;
}

export const emptyVitrageCommande: VitrageCommande = {
  composition: "",
  quantite: "1",
  surface_m2: "",
  fournisseur: "isula",
  cmd_passee: false,
  date_reception: "",
  position: "",
  face_exterieure: "",
  face_interieure: "",
  couleur_intercalaire: "",
  epaisseur_intercalaire: "",
  largeur: "",
  hauteur: "",
  forme: "",
  prix_m2: "",
  prix_total: "",
  largeur_origine: "",
  hauteur_origine: "",
  surface_m2_origine: "",
  vitrage_id_ext: "",
  ligne_menuiserie_id: "",
};

/**
 * Helpers pour migrer un objet ancien (JSON BDD) vers le nouveau type.
 * Aucun champ manquant n'est exigé — toutes les nouvelles propriétés
 * reçoivent des valeurs par défaut.
 */
export function normalizeLigne(raw: Partial<LigneCommande> | undefined | null): LigneCommande {
  return { ...emptyLigneCommande, ...(raw || {}) };
}

export function normalizeVitrage(raw: Partial<VitrageCommande> | undefined | null): VitrageCommande {
  return { ...emptyVitrageCommande, ...(raw || {}) };
}
