// ═══════════════════════════════════════════════════════════════════════
// PRIORITÉ D'ORDONNANCEMENT — Critical Ratio, Goulot, Takt time.
//
// Référence : règles classiques job-shop scheduling (EDD, SPT, CR) +
// Theory of Constraints (Drum-Buffer-Rope) + Heijunka (lissage).
// Voir docs/AUDIT_LEAN.md (à venir) pour la justification métier.
// ═══════════════════════════════════════════════════════════════════════

import { calcCheminCritique, isWorkday, type CommandeCC } from "@/lib/sial-data";
import { postCapacityMinDay } from "@/lib/work-posts";
import { getRoutage } from "@/lib/routage-production";

// ── Critical Ratio ──────────────────────────────────────────────────────

/**
 * Critical Ratio = (jours ouvrés disponibles avant deadline) / (jours-personne nécessaires).
 *
 *   < 1.0  → impossible (on est déjà en retard ou au taquet)
 *   1.0-1.3 → tendu, mode crash recommandé
 *   1.3-2.0 → normal
 *   > 2.0  → peinard
 *
 * Base technique : règle classique de dispatching (Critical Ratio Rule)
 * documentée dans tous les manuels de gestion de production.
 */
export interface CriticalRatioResult {
  ratio: number;
  joursDispo: number;
  joursBesoin: number;
  level: "impossible" | "tendu" | "normal" | "peinard" | "inconnu";
  label: string;
  color: string;
}

export function calcCriticalRatio(
  cmd: CommandeCC,
  todayStr?: string,
): CriticalRatioResult {
  const a = cmd as unknown as { date_livraison_souhaitee?: string | null };
  const today = todayStr ?? new Date().toISOString().split("T")[0];
  const deadline = a.date_livraison_souhaitee;
  if (!deadline) {
    return { ratio: 0, joursDispo: 0, joursBesoin: 0, level: "inconnu",
      label: "Sans deadline", color: "#9E9E9E" };
  }

  // Jours ouvrés entre today et deadline
  const joursDispo = countWorkdays(today, deadline);

  // Jours-personne nécessaires : on agrège le routage de la commande.
  // Si le calcul échoue, fallback sur un minimum prudent.
  let totalMin = 0;
  try {
    const routage = getRoutage(
      cmd.type,
      cmd.quantite,
      cmd.hsTemps as Record<string, unknown> | null | undefined,
    );
    totalMin = routage.reduce((s, e) => s + e.estimatedMin, 0);
  } catch {
    totalMin = 0;
  }
  // Fallback via chemin critique si getRoutage ne donne rien
  if (totalMin === 0) {
    const cc = calcCheminCritique(cmd);
    if (cc) totalMin = cc.etapes.reduce((s, e) => s + e.duree_min, 0);
  }
  // 480 min = 1 jour-personne
  const joursBesoin = Math.max(0.25, totalMin / 480);

  const ratio = joursBesoin > 0 ? joursDispo / joursBesoin : 99;
  let level: CriticalRatioResult["level"];
  let label: string;
  let color: string;
  if (ratio < 1.0) { level = "impossible"; label = "🔴 Impossible"; color = "#EF5350"; }
  else if (ratio < 1.3) { level = "tendu";    label = "🟠 Tendu (crash)"; color = "#FFA726"; }
  else if (ratio < 2.0) { level = "normal";   label = "🟡 Normal"; color = "#FFCA28"; }
  else                  { level = "peinard";  label = "🟢 Marge"; color = "#66BB6A"; }

  return { ratio: Math.round(ratio * 10) / 10, joursDispo, joursBesoin: Math.round(joursBesoin * 10) / 10, level, label, color };
}

/** Compte les jours ouvrés entre deux dates YYYY-MM-DD (inclus début, exclu fin). */
export function countWorkdays(fromStr: string, toStr: string): number {
  const from = new Date(fromStr + "T00:00:00");
  const to = new Date(toStr + "T00:00:00");
  if (to <= from) return 0;
  let count = 0;
  const d = new Date(from);
  while (d < to) {
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (isWorkday(ds)) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

// ── Détection du goulot (Drum-Buffer-Rope) ──────────────────────────────

/**
 * Identifie le poste goulot de la semaine : celui dont la charge demandée
 * (besoin) est la plus proche ou dépasse la capacité disponible.
 *
 * Référence : Theory of Constraints — Drum-Buffer-Rope.
 * "Le poste goulot pilote le rythme de tout l'atelier. Toute minute
 * perdue au goulot = minute perdue pour l'usine entière."
 */
export interface BottleneckResult {
  postId: string;
  label: string;
  saturationPct: number;      // 100 = à pleine capacité, >100 = surcharge
  chargeMin: number;          // minutes de besoin cette semaine
  capacityMin: number;        // capacité hebdo du poste
  status: "surcharge" | "saturé" | "tendu" | "ok";
}

export function detectBottleneck(
  postWork: Record<string, { totalMin: number }>,
  /** Nombre de jours ouvrés effectifs cette semaine (ex: 5 - jours fériés). */
  joursOuvres = 5,
): BottleneckResult | null {
  let best: BottleneckResult | null = null;
  for (const [pid, pw] of Object.entries(postWork)) {
    if (!pw || pw.totalMin <= 0) continue;
    const capWeek = postCapacityMinDay(pid) * joursOuvres;
    if (capWeek <= 0) continue;
    const saturationPct = (pw.totalMin / capWeek) * 100;
    let status: BottleneckResult["status"];
    if (saturationPct > 100) status = "surcharge";
    else if (saturationPct > 90) status = "saturé";
    else if (saturationPct > 70) status = "tendu";
    else status = "ok";
    const r: BottleneckResult = {
      postId: pid,
      label: pid, // PostShortLabel sera appliqué côté UI
      saturationPct: Math.round(saturationPct),
      chargeMin: pw.totalMin,
      capacityMin: capWeek,
      status,
    };
    if (!best || r.saturationPct > best.saturationPct) best = r;
  }
  return best;
}

// ── Takt time ──────────────────────────────────────────────────────────

/**
 * Takt time = (temps disponible total) / (demande client en pièces).
 *
 * Si la demande est de 12 châssis et qu'on a 480 min × N opérateurs,
 * le takt time est le rythme cible que chaque poste doit tenir.
 *
 * Référence : Toyota Production System — fondement du flux tiré.
 */
export interface TaktResult {
  taktMinPerPiece: number;
  totalAvailableMin: number;
  pieces: number;
  /** Cycle time moyen observé (depuis cerveau) — null si pas mesuré. */
  cycleTimeAvg: number | null;
  /** Statut : on tient le rythme ou non. */
  status: "ok" | "retard" | "avance" | "inconnu";
}

export function calcTakt(
  /** Minutes disponibles totales sur la fenêtre (ex: 8h × 12 opérateurs = 5760). */
  totalAvailableMin: number,
  /** Nombre de pièces (châssis, ouvrants, etc.) à produire dans la fenêtre. */
  pieces: number,
  /** Temps de cycle moyen observé sur la dernière période (optionnel). */
  cycleTimeAvg?: number | null,
): TaktResult {
  if (pieces <= 0 || totalAvailableMin <= 0) {
    return {
      taktMinPerPiece: 0,
      totalAvailableMin,
      pieces,
      cycleTimeAvg: cycleTimeAvg ?? null,
      status: "inconnu",
    };
  }
  const taktMinPerPiece = Math.round((totalAvailableMin / pieces) * 10) / 10;
  let status: TaktResult["status"] = "inconnu";
  if (cycleTimeAvg && cycleTimeAvg > 0) {
    if (cycleTimeAvg > taktMinPerPiece * 1.1) status = "retard";
    else if (cycleTimeAvg < taktMinPerPiece * 0.9) status = "avance";
    else status = "ok";
  }
  return { taktMinPerPiece, totalAvailableMin, pieces, cycleTimeAvg: cycleTimeAvg ?? null, status };
}
