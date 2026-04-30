// ═══════════════════════════════════════════════════════════════════════
// OEE / TRS — Overall Equipment Effectiveness / Taux de Rendement Synthétique
//
// Référence : norme AFNOR NF E 60-182. Indicateur de performance industrielle.
//   OEE = Disponibilité × Performance × Qualité   (en %, max = 100%)
//
//   - Disponibilité = (temps machine effectif) / (temps prévu)
//                   = 100% - temps d'arrêt non planifié
//   - Performance   = (cadence réelle) / (cadence théorique)
//                   = temps_théorique / temps_réel
//   - Qualité       = (pièces conformes) / (pièces produites)
//                   = 1 - (rebuts + reprises) / total
//
// World class OEE = 85% (référence Toyota). Industrie standard ~60%.
// ═══════════════════════════════════════════════════════════════════════

import { type TaskMetric } from "@/lib/cerveau";

export interface OEEResult {
  poste: string;
  disponibilite: number;     // 0-100
  performance: number;       // 0-100
  qualite: number;           // 0-100
  oee: number;               // 0-100 (produit des 3)
  sampleSize: number;        // nb de tâches mesurées
  rating: "world_class" | "good" | "average" | "poor";
}

/**
 * Calcule l'OEE d'un poste à partir des métriques cerveau (pointages réels).
 *
 * Hypothèses simplificatrices (à raffiner avec données plus précises) :
 *  - Disponibilité : on ne mesure pas les arrêts → on suppose 100%
 *  - Performance : ratio temps_théorique / temps_réel des tâches DONE
 *  - Qualité : 1 - (anomalies > 40% écart) / total
 */
export function computeOEE(
  poste: string,
  metrics: TaskMetric[],
): OEEResult {
  const own = metrics.filter(m => m.poste === poste);
  if (own.length === 0) {
    return {
      poste, disponibilite: 100, performance: 0, qualite: 100, oee: 0,
      sampleSize: 0, rating: "poor",
    };
  }

  // Disponibilité : pour l'instant 100% (on n'enregistre pas les arrêts)
  const disponibilite = 100;

  // Performance : moyenne des ratios theorique / reel (>1 = plus rapide)
  const ratios = own
    .filter(m => m.actualMinutes > 0 && m.estimatedMinutes > 0)
    .map(m => m.estimatedMinutes / m.actualMinutes);
  const avgPerf = ratios.length > 0
    ? ratios.reduce((s, v) => s + v, 0) / ratios.length
    : 0;
  const performance = Math.min(100, Math.max(0, Math.round(avgPerf * 100)));

  // Qualité : on considère qu'une tâche dont le réel dépasse l'estimé de
  // plus de 40 % est de mauvaise qualité (probable reprise / défaut).
  const totalEstimated = own.length;
  const anomalies = own.filter(m => {
    if (m.estimatedMinutes <= 0) return false;
    const dev = Math.abs((m.actualMinutes - m.estimatedMinutes) / m.estimatedMinutes);
    return dev > 0.4;
  }).length;
  const qualite = Math.round(((totalEstimated - anomalies) / totalEstimated) * 100);

  const oee = Math.round((disponibilite / 100) * (performance / 100) * (qualite / 100) * 100);

  let rating: OEEResult["rating"];
  if (oee >= 85) rating = "world_class";
  else if (oee >= 70) rating = "good";
  else if (oee >= 50) rating = "average";
  else rating = "poor";

  return { poste, disponibilite, performance, qualite, oee, sampleSize: own.length, rating };
}

/**
 * Calcule l'OEE pour tous les postes ayant au moins N mesures.
 */
export function computeAllOEE(metrics: TaskMetric[], minSample = 3): OEEResult[] {
  const postIds = Array.from(new Set(metrics.map(m => m.poste)));
  return postIds
    .map(p => computeOEE(p, metrics))
    .filter(r => r.sampleSize >= minSample)
    .sort((a, b) => b.oee - a.oee);
}
