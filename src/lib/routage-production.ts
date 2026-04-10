/**
 * Routage de production — Lien type menuiserie → séquence de postes de travail
 *
 * Pour chaque type de menuiserie saisi dans une commande, ce module détermine :
 * 1. La séquence ordonnée de postes de travail (WorkPost IDs)
 * 2. Le temps estimé à chaque poste (en minutes)
 * 3. Les dépendances entre postes (quel poste doit finir avant le suivant)
 */

import { TYPES_MENUISERIE } from "./sial-data";

// ── Temps unitaires (minutes) ────────────────────────────────────────────────
const T = {
  // Coupe
  coupe_profil:           1,    // par profil LMT
  coupe_double_tete:      1.5,  // par profil DT
  coupe_renfort:          2,    // par renfort acier
  soudure_pvc:            5,    // par cadre PVC
  poincon_alu:            10,   // par cadre ALU
  // Montage
  prep_dormant:           5,
  pose_rails_accessoires: 10,
  montage_dormant_coul:   30,
  montage_dormant_gland:  60,
  ferrage_ouvrant:        10,   // par ouvrant
  mise_en_bois:           5,
  // Vitrage
  vitrage_frappe:         10,   // par ouvrant
  vitrage_coul_gland:     20,   // par ouvrant
  controle:               2,
  // Logistique
  prep_accessoires_fab:   5,
  emballage:              5,
  palette:                5,
  chargement:             3,
};

// ── Types de familles ────────────────────────────────────────────────────────
type Famille = "frappe" | "coulissant" | "glandage" | "porte" | "hors_standard" | "intervention";

// ── Étape de routage ─────────────────────────────────────────────────────────
export interface EtapeRoutage {
  postId: string;         // ID du WorkPost (C1, V1, L6, etc.)
  label: string;          // Description lisible
  estimatedMin: number;   // Temps estimé en minutes
  phase: "coupe" | "montage" | "vitrage" | "logistique";
  order: number;          // Ordre dans la séquence
}

// ── Fonction principale : routage pour un type de menuiserie ─────────────────
export function getRoutage(
  typeId: string,
  quantite: number = 1,
  hsTemps?: Record<string, unknown> | null,
): EtapeRoutage[] {
  const tid = typeId.toLowerCase();
  const tm = (TYPES_MENUISERIE as Record<string, any>)[tid];
  if (!tm) return [];

  const famille: Famille = tm.famille;
  const mat: string = tm.mat;
  const isPVC = mat === "PVC";
  const ouvrants: number = tm.ouvrants || 0;
  const lmt: number = tm.lmt || 0;
  const dt: number = tm.dt || 0;
  const renfort: number = tm.renfort || 0;
  const nbCadres = 1 + ouvrants;
  const q = quantite;

  // Intervention : pas de postes atelier
  if (famille === "intervention") return [];

  // Hors standard : temps manuels
  if (famille === "hors_standard") {
    const tCoupe = Math.round(parseFloat(String(hsTemps?.t_coupe)) || 0);
    const tMontage = Math.round(parseFloat(String(hsTemps?.t_montage)) || 0);
    const tVitrage = Math.round(parseFloat(String(hsTemps?.t_vitrage)) || 0);
    const etapes: EtapeRoutage[] = [];
    let ord = 0;
    if (tCoupe > 0) {
      etapes.push({ postId: "C3", label: "Coupe hors standard", estimatedMin: tCoupe, phase: "coupe", order: ord++ });
    }
    if (tMontage > 0) {
      etapes.push({ postId: "MHS", label: "Montage hors standard", estimatedMin: tMontage, phase: "montage", order: ord++ });
    }
    if (tVitrage > 0) {
      etapes.push({ postId: "V1", label: "Vitrage hors standard", estimatedMin: tVitrage, phase: "vitrage", order: ord++ });
    }
    etapes.push({ postId: "V3", label: "Emballage", estimatedMin: T.emballage * q, phase: "vitrage", order: ord++ });
    etapes.push({ postId: "L6", label: "Réalisation palette", estimatedMin: T.palette * q, phase: "logistique", order: ord++ });
    etapes.push({ postId: "L7", label: "Chargement palette", estimatedMin: T.chargement * q, phase: "logistique", order: ord++ });
    return etapes;
  }

  // ── Routage standard ──────────────────────────────────────────────────────
  const isFrappe = famille === "frappe";
  const isPorte = famille === "porte";
  const isCoul = famille === "coulissant";
  const isGland = famille === "glandage";
  const etapes: EtapeRoutage[] = [];
  let ord = 0;

  // ── PHASE COUPE ───────────────────────────────────────────────────────────
  // C2 : Préparation barres (minimum 3 min)
  etapes.push({ postId: "C2", label: "Préparation barres", estimatedMin: Math.max(3, Math.round(lmt * T.coupe_profil * q * 0.3)), phase: "coupe", order: ord++ });

  // C3 : Coupe LMT
  etapes.push({ postId: "C3", label: "Coupe LMT", estimatedMin: Math.round(lmt * T.coupe_profil * q), phase: "coupe", order: ord++ });

  // C4 : Coupe double tête (si dt > 0)
  if (dt > 0) {
    etapes.push({ postId: "C4", label: "Coupe double tête", estimatedMin: Math.round(dt * T.coupe_double_tete * q), phase: "coupe", order: ord++ });
  }

  // C5 : Coupe renfort acier (PVC seulement)
  if (isPVC && renfort > 0) {
    etapes.push({ postId: "C5", label: "Coupe renfort acier", estimatedMin: Math.round(renfort * T.coupe_renfort * q), phase: "coupe", order: ord++ });
  }

  // C6 : Soudure PVC (frappes PVC seulement)
  if (isPVC && isFrappe) {
    etapes.push({ postId: "C6", label: "Soudure PVC", estimatedMin: Math.round(T.soudure_pvc * nbCadres * q), phase: "coupe", order: ord++ });
  }

  // ── PHASE LOGISTIQUE AMONT ────────────────────────────────────────────────
  etapes.push({ postId: "L4", label: "Prépa accessoires fabrication", estimatedMin: Math.round(T.prep_accessoires_fab * q), phase: "logistique", order: ord++ });

  // ── PHASE MONTAGE ─────────────────────────────────────────────────────────
  if (isFrappe) {
    // Frappes ALU : poinçonnage en F1
    if (!isPVC) {
      etapes.push({ postId: "F1", label: "Dormants frappe ALU", estimatedMin: Math.round(T.poincon_alu * nbCadres * q), phase: "montage", order: ord++ });
    }
    etapes.push({ postId: "F2", label: "Ouvrants frappe + ferrage", estimatedMin: Math.round((T.prep_dormant + T.ferrage_ouvrant * ouvrants) * q), phase: "montage", order: ord++ });
    etapes.push({ postId: "F3", label: "Mise en bois + contrôle", estimatedMin: Math.round((T.mise_en_bois + T.controle) * q), phase: "montage", order: ord++ });
  }

  if (isPorte) {
    // Portes ALU : poste dédié M3 (poinçonnage + rails + ferrage + mise en bois)
    const tPorte = Math.round((T.poincon_alu * nbCadres + T.pose_rails_accessoires + T.ferrage_ouvrant * ouvrants + T.prep_dormant + T.mise_en_bois + T.controle) * q);
    etapes.push({ postId: "M3", label: "Montage porte ALU", estimatedMin: tPorte, phase: "montage", order: ord++ });
  }

  if (isCoul) {
    etapes.push({ postId: "M1", label: "Dormants coulissants", estimatedMin: Math.round((T.pose_rails_accessoires + T.montage_dormant_coul) * q), phase: "montage", order: ord++ });
  }

  if (isGland) {
    etapes.push({ postId: "M2", label: "Dormants galandage", estimatedMin: Math.round((T.pose_rails_accessoires + T.montage_dormant_gland) * q), phase: "montage", order: ord++ });
  }

  // ── PHASE VITRAGE ─────────────────────────────────────────────────────────
  if (isFrappe || isPorte) {
    etapes.push({ postId: "V1", label: "Vitrage frappe", estimatedMin: Math.round(T.vitrage_frappe * Math.max(ouvrants, 1) * q), phase: "vitrage", order: ord++ });
  }

  if (isCoul || isGland) {
    etapes.push({ postId: "V2", label: "Vitrage coulissant/galandage", estimatedMin: Math.round(T.vitrage_coul_gland * ouvrants * q), phase: "vitrage", order: ord++ });
  }

  // V3 : Emballage (toujours)
  etapes.push({ postId: "V3", label: "Emballage", estimatedMin: Math.round(T.emballage * q), phase: "vitrage", order: ord++ });

  // ── PHASE LOGISTIQUE AVAL ─────────────────────────────────────────────────
  etapes.push({ postId: "L6", label: "Réalisation palette", estimatedMin: Math.round(T.palette * q), phase: "logistique", order: ord++ });
  etapes.push({ postId: "L7", label: "Chargement palette", estimatedMin: Math.round(T.chargement * q), phase: "logistique", order: ord++ });

  return etapes;
}

// ── Résumé du routage par poste (agrégé) ─────────────────────────────────────
export function getRoutageResume(
  typeId: string,
  quantite: number = 1,
  hsTemps?: Record<string, unknown> | null,
): Record<string, { label: string; totalMin: number; etapes: string[] }> {
  const etapes = getRoutage(typeId, quantite, hsTemps);
  const resume: Record<string, { label: string; totalMin: number; etapes: string[] }> = {};

  for (const e of etapes) {
    if (!resume[e.postId]) {
      resume[e.postId] = { label: e.postId, totalMin: 0, etapes: [] };
    }
    resume[e.postId].totalMin += e.estimatedMin;
    resume[e.postId].etapes.push(e.label);
  }

  return resume;
}

// ── Routage complet pour une commande entière ────────────────────────────────
export function getRoutageCommande(
  commande: { type: string; quantite: number; hsTemps?: Record<string, unknown> | null; lignes?: Array<{ type: string; quantite: number }> | null },
): EtapeRoutage[] {
  // Si la commande a des lignes détaillées, cumuler les routages
  if (commande.lignes && Array.isArray(commande.lignes) && commande.lignes.length > 0) {
    const all: EtapeRoutage[] = [];
    for (const ligne of commande.lignes) {
      all.push(...getRoutage(ligne.type, ligne.quantite));
    }
    return all;
  }

  // Sinon utiliser le type principal
  return getRoutage(commande.type, commande.quantite, commande.hsTemps);
}

// ── Matrice complète : tous les types × tous les postes ──────────────────────
export function getMatriceRoutage(): Array<{
  typeId: string;
  label: string;
  famille: string;
  postes: Array<{ postId: string; estimatedMin: number; phase: string }>;
}> {
  const types = Object.entries(TYPES_MENUISERIE as Record<string, any>);
  return types
    .filter(([, tm]) => tm.famille !== "intervention")
    .map(([typeId, tm]) => ({
      typeId,
      label: tm.label,
      famille: tm.famille,
      postes: getRoutage(typeId, 1).map(e => ({
        postId: e.postId,
        estimatedMin: e.estimatedMin,
        phase: e.phase,
      })),
    }));
}
