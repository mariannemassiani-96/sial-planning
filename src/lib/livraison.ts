// ═══════════════════════════════════════════════════════════════════════
// LIVRAISONS — durée estimée par zone + helpers de planification.
//
// La durée AR (aller-retour depuis SIAL) varie fortement selon la zone.
// Cette table sert à calculer l'occupation réelle du livreur sur la
// journée et à éviter de bloquer 2 demi-journées pour une livraison
// qui prend en réalité 1h30.
// ═══════════════════════════════════════════════════════════════════════

import { JOURS_FERIES, isWorkday } from "@/lib/sial-data";

/** Durée AR estimée par zone, en minutes. */
export const ZONE_DUREE_AR: Record<string, number> = {
  "SIAL":              30,    // sur place ou client qui retire
  "Porto-Vecchio":    180,    // 1h30 aller + 1h30 retour
  "Ajaccio":          120,
  "Bastia":            90,
  "Balagne":          150,
  "Plaine Orientale": 240,
  "Continent":        480,    // journée complète
  "Sur chantier":     120,    // par défaut, à ajuster
  "Autre":            120,
};

/**
 * Durée AR pour une zone donnée. Fallback sur 120 min (2h) si zone inconnue.
 */
export function dureeLivraison(zone: string | null | undefined): number {
  if (!zone) return 120;
  return ZONE_DUREE_AR[zone] ?? 120;
}

/**
 * Combien de demi-journées bloque une livraison pour cette zone ?
 *  - ≤ 240 min → 1 demi-journée
 *  - > 240 min → la journée complète (2 demis)
 */
export function nbDemiJourneesLivraison(zone: string | null | undefined): number {
  return dureeLivraison(zone) > 240 ? 2 : 1;
}

/**
 * Calcule la date du chargement pour une livraison donnée :
 * idéalement la veille en PM, mais si la veille tombe un weekend ou férié,
 * on recule jusqu'au dernier jour ouvré précédent.
 */
export function dateChargementPour(livraisonDate: string): string {
  const d = new Date(livraisonDate + "T12:00:00");
  d.setDate(d.getDate() - 1);
  let s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  while (!isWorkday(s)) {
    d.setDate(d.getDate() - 1);
    s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return s;
}

/**
 * Liste toutes les dates de livraison d'une commande (1 ou plusieurs).
 * Fusionne `date_livraison_souhaitee` (première) et `dates_livraisons[]`
 * (cas multi-livraisons).
 */
export function getLivraisonDates(cmd: {
  date_livraison_souhaitee?: string | null;
  dates_livraisons?: unknown;
  nb_livraisons?: number;
}): Array<{ date: string; description: string; index: number }> {
  const arr = Array.isArray(cmd.dates_livraisons) ? (cmd.dates_livraisons as Array<{ date?: string; description?: string }>) : [];
  const result: Array<{ date: string; description: string; index: number }> = [];
  if (arr.length > 0) {
    arr.forEach((x, i) => {
      if (x?.date) result.push({ date: x.date, description: x.description || `Livraison ${i + 1}`, index: i });
    });
  }
  // Si pas de dates_livraisons, fallback sur la date principale
  if (result.length === 0 && cmd.date_livraison_souhaitee) {
    result.push({ date: cmd.date_livraison_souhaitee, description: "Livraison", index: 0 });
  }
  return result;
}

/**
 * Ce que le système doit savoir pour une livraison atomique.
 */
export interface LivraisonInfo {
  date: string;             // jour de livraison
  zone: string;
  transporteur: string;     // "nous", "setec", "express", "poseur", "depot"
  client: string;
  chantier: string;
  description: string;      // libellé livraison (ex "Livraison 2/3")
  /** Le chargement doit-il être planifié ?
   *  - "nous", "setec", "express" : oui (on charge le camion)
   *  - "poseur", "depot" : oui (le client/poseur récupère, mais marchandise doit être prête)
   *  → toujours oui en pratique
   */
  needsLoading: boolean;
  /** Le livreur doit-il être planifié ? Uniquement si transporteur = "nous". */
  needsDriver: boolean;
  /** Durée AR en minutes (pour calculer si la livraison bloque 1 ou 2 demis). */
  dureeAR: number;
}

/**
 * Liste tous les segments de livraison à planifier pour la semaine courante.
 * Inclut les livraisons multiples par commande.
 */
export function listLivraisonsForWeek(
  commandes: Array<{
    id?: string | number;
    client?: string;
    ref_chantier?: string | null;
    zone?: string | null;
    transporteur?: string | null;
    date_livraison_souhaitee?: string | null;
    dates_livraisons?: unknown;
    nb_livraisons?: number;
    statut?: string;
  }>,
  weekDates: string[],
): LivraisonInfo[] {
  const result: LivraisonInfo[] = [];
  for (const cmd of commandes) {
    if (cmd.statut === "annulee") continue;
    const dates = getLivraisonDates(cmd);
    for (const dl of dates) {
      if (!weekDates.includes(dl.date)) continue;
      const transporteur = cmd.transporteur || "";
      const zone = cmd.zone || "";
      result.push({
        date: dl.date,
        zone,
        transporteur,
        client: cmd.client || "",
        chantier: cmd.ref_chantier || "",
        description: dates.length > 1 ? `${dl.description} (${dl.index + 1}/${dates.length})` : "Livraison",
        needsLoading: transporteur !== "depot", // si client retire, pas de chargement de notre part
        needsDriver: transporteur === "nous",
        dureeAR: dureeLivraison(zone),
      });
    }
  }
  return result;
}

/** Voir si une date YYYY-MM-DD est ouvrée (alias pour cohérence). */
export function isDateWorkday(dateStr: string): boolean {
  return isWorkday(dateStr);
}

/** Voir si une date YYYY-MM-DD est fériée (label si oui). */
export function getFerieLabel(dateStr: string): string | null {
  return JOURS_FERIES[dateStr] ?? null;
}
