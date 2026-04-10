/**
 * CERVEAU — Moteur d'apprentissage et de planification
 *
 * 3 couches :
 * 1. MÉMOIRE : données historiques (pointages, affectations, temps réels)
 * 2. INTELLIGENCE : analyse des patterns, calcul des vrais temps, détection anomalies
 * 3. ACTION : planification auto, alertes proactives, recommandations
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface HistoriqueEntry {
  date: string;
  postId: string;
  chantier: string;
  cmdType: string;      // type menuiserie
  cmdQuantite: number;
  estimatedMin: number; // temps estimé par le référentiel
  realMin: number;      // temps réel pointé
  realOps: string[];    // qui a fait
  nbOps: number;        // combien de personnes
  status: string;       // fait/partiel/pasfait
  raison: string;       // raison si pas fait
  pct: number;          // % réalisé
}

export interface TempsAppris {
  postId: string;
  cmdType: string;
  nbSamples: number;
  moyenneMin: number;       // temps moyen réel
  medianeMin: number;
  minMin: number;
  maxMin: number;
  ecartVsEstime: number;    // % d'écart moyen vs estimé
  tendance: "stable" | "amelioration" | "degradation";
}

export interface OperateurProfil {
  nom: string;
  tempsParPoste: Record<string, { moyenne: number; nbTaches: number }>;
  tauxCompletion: number;     // % tâches terminées vs planifiées
  postesPrefs: string[];      // postes les plus souvent affectés (ordre)
  heuresMoyJour: number;      // heures productives moyennes par jour
  topRaisons: Array<{ raison: string; count: number }>;
  fiabilite: number;          // 0-100 score de fiabilité
}

export interface Alerte {
  type: "retard" | "surcharge" | "sous_charge" | "bottleneck" | "materiel" | "qualite" | "pattern";
  severity: "info" | "warning" | "critical";
  message: string;
  details: string;
  suggestion: string;
}

export interface PlanningRecommandation {
  postId: string;
  jourIdx: number;
  demi: string;
  chantier: string;
  ops: string[];
  confidence: number;  // 0-100
  raison: string;
}

// ── MÉMOIRE : Construction de l'historique ───────────────────────────────────

export function buildHistorique(pointages: Array<{ date: string; entries: Record<string, any>; imprevu?: any[] }>): HistoriqueEntry[] {
  const hist: HistoriqueEntry[] = [];
  for (const day of pointages) {
    if (!day.entries) continue;
    for (const [key, entry] of Object.entries(day.entries)) {
      if (!entry) continue;
      const [postId, chantier] = key.split("|");
      hist.push({
        date: day.date,
        postId,
        chantier: chantier || "",
        cmdType: "", // sera enrichi par le contexte
        cmdQuantite: 0,
        estimatedMin: 0,
        realMin: entry.realMin || 0,
        realOps: entry.realOps || [],
        nbOps: (entry.realOps || []).length,
        status: entry.status || "",
        raison: entry.raison || "",
        pct: entry.pct || 0,
      });
    }
  }
  return hist;
}

// ── INTELLIGENCE : Analyse des patterns ──────────────────────────────────────

export function analyserTemps(historique: HistoriqueEntry[]): TempsAppris[] {
  // Grouper par poste × type
  const groups: Record<string, number[]> = {};
  for (const h of historique) {
    if (h.realMin <= 0) continue;
    const key = `${h.postId}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(h.realMin);
  }

  return Object.entries(groups).map(([key, times]) => {
    times.sort((a, b) => a - b);
    const sum = times.reduce((s, t) => s + t, 0);
    const moyenne = Math.round(sum / times.length);
    const mediane = times[Math.floor(times.length / 2)];

    // Tendance : comparer la 1ère moitié vs la 2ème moitié
    const mid = Math.floor(times.length / 2);
    const firstHalf = times.slice(0, mid);
    const secondHalf = times.slice(mid);
    const avgFirst = firstHalf.length > 0 ? firstHalf.reduce((s, t) => s + t, 0) / firstHalf.length : 0;
    const avgSecond = secondHalf.length > 0 ? secondHalf.reduce((s, t) => s + t, 0) / secondHalf.length : 0;
    const tendance = avgSecond < avgFirst * 0.9 ? "amelioration" : avgSecond > avgFirst * 1.1 ? "degradation" : "stable";

    return {
      postId: key,
      cmdType: "",
      nbSamples: times.length,
      moyenneMin: moyenne,
      medianeMin: mediane,
      minMin: times[0],
      maxMin: times[times.length - 1],
      ecartVsEstime: 0,
      tendance,
    };
  });
}

export function analyserOperateurs(historique: HistoriqueEntry[]): OperateurProfil[] {
  const opData: Record<string, {
    taches: number; faites: number; realMins: number[];
    postes: Record<string, { total: number; count: number }>;
    raisons: Record<string, number>;
    jours: Set<string>;
  }> = {};

  for (const h of historique) {
    for (const op of h.realOps) {
      if (!opData[op]) opData[op] = { taches: 0, faites: 0, realMins: [], postes: {}, raisons: {}, jours: new Set() };
      const d = opData[op];
      d.taches++;
      if (h.status === "fait") d.faites++;
      if (h.realMin > 0) {
        d.realMins.push(Math.round(h.realMin / h.nbOps));
        d.jours.add(h.date);
      }
      if (!d.postes[h.postId]) d.postes[h.postId] = { total: 0, count: 0 };
      d.postes[h.postId].total += h.realMin > 0 ? Math.round(h.realMin / h.nbOps) : 0;
      d.postes[h.postId].count++;
      if (h.raison) d.raisons[h.raison] = (d.raisons[h.raison] || 0) + 1;
    }
  }

  return Object.entries(opData).map(([nom, d]) => {
    const tempsParPoste: Record<string, { moyenne: number; nbTaches: number }> = {};
    for (const [poste, data] of Object.entries(d.postes)) {
      tempsParPoste[poste] = { moyenne: data.count > 0 ? Math.round(data.total / data.count) : 0, nbTaches: data.count };
    }
    const totalMin = d.realMins.reduce((s, m) => s + m, 0);
    const nbJours = d.jours.size;
    const topRaisons = Object.entries(d.raisons).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([r, c]) => ({ raison: r, count: c }));
    const postesPrefs = Object.entries(d.postes).sort((a, b) => b[1].count - a[1].count).slice(0, 5).map(([p]) => p);

    return {
      nom,
      tempsParPoste,
      tauxCompletion: d.taches > 0 ? Math.round(d.faites / d.taches * 100) : 0,
      postesPrefs,
      heuresMoyJour: nbJours > 0 ? Math.round(totalMin / nbJours) : 0,
      topRaisons,
      fiabilite: Math.min(100, Math.round((d.faites / Math.max(d.taches, 1)) * 100 * 0.7 + (nbJours > 5 ? 30 : nbJours * 6))),
    };
  });
}

// ── ACTION : Détection d'alertes proactives ──────────────────────────────────

export function detecterAlertes(
  historique: HistoriqueEntry[],
  tempsAppris: TempsAppris[],
  operateurs: OperateurProfil[],
): Alerte[] {
  const alertes: Alerte[] = [];

  // 1. Postes en dégradation
  for (const t of tempsAppris) {
    if (t.tendance === "degradation" && t.nbSamples >= 5) {
      alertes.push({
        type: "pattern", severity: "warning",
        message: `${t.postId} : temps en augmentation`,
        details: `Moyenne ${hm(t.moyenneMin)} sur ${t.nbSamples} tâches, tendance à la hausse`,
        suggestion: "Vérifier si problème machine, formation, ou complexité croissante",
      });
    }
  }

  // 2. Opérateurs sous-productifs
  for (const op of operateurs) {
    if (op.heuresMoyJour > 0 && op.heuresMoyJour < 300 && op.tauxCompletion < 70) {
      alertes.push({
        type: "sous_charge", severity: "warning",
        message: `${op.nom} : ${hm(op.heuresMoyJour)} productif/jour (${op.tauxCompletion}% terminé)`,
        details: `Top raisons : ${op.topRaisons.map(r => r.raison).join(", ") || "aucune"}`,
        suggestion: "Vérifier les tâches non pointées ou les temps morts",
      });
    }
  }

  // 3. Raisons de blocage récurrentes
  const raisonCount: Record<string, number> = {};
  for (const h of historique) {
    if (h.raison) raisonCount[h.raison] = (raisonCount[h.raison] || 0) + 1;
  }
  for (const [raison, count] of Object.entries(raisonCount)) {
    if (count >= 5) {
      alertes.push({
        type: "materiel", severity: count >= 10 ? "critical" : "warning",
        message: `"${raison}" revient ${count} fois`,
        details: `Cette raison de blocage est systématique`,
        suggestion: raison.includes("manque") ? "Anticiper les approvisionnements" : "Investiguer la cause racine",
      });
    }
  }

  // 4. Postes goulots (temps moyen très élevé)
  const sorted = [...tempsAppris].sort((a, b) => b.moyenneMin - a.moyenneMin);
  if (sorted.length >= 3) {
    const top = sorted[0];
    const avg = tempsAppris.reduce((s, t) => s + t.moyenneMin, 0) / tempsAppris.length;
    if (top.moyenneMin > avg * 2) {
      alertes.push({
        type: "bottleneck", severity: "info",
        message: `${top.postId} est le goulot principal`,
        details: `Temps moyen ${hm(top.moyenneMin)} vs moyenne générale ${hm(Math.round(avg))}`,
        suggestion: "Envisager plus de personnes ou optimiser le process",
      });
    }
  }

  return alertes;
}

// ── ACTION : Recommandations pour la planification ───────────────────────────

export function recommanderAffectations(
  operateurs: OperateurProfil[],
  tachesASemaine: Array<{ postId: string; chantier: string; estimatedMin: number }>,
  habits: Record<string, Record<string, number>>,
): PlanningRecommandation[] {
  const recs: PlanningRecommandation[] = [];

  for (const tache of tachesASemaine) {
    // Trouver les meilleurs opérateurs pour ce poste
    const candidates = operateurs
      .filter(op => op.postesPrefs.includes(tache.postId) || (habits[tache.postId]?.[op.nom] || 0) > 0)
      .map(op => ({
        nom: op.nom,
        score: (op.fiabilite / 100) * 0.4
          + (habits[tache.postId]?.[op.nom] || 0) / 100 * 0.3
          + (op.tauxCompletion / 100) * 0.3,
      }))
      .sort((a, b) => b.score - a.score);

    if (candidates.length > 0) {
      recs.push({
        postId: tache.postId,
        jourIdx: 0,
        demi: "am",
        chantier: tache.chantier,
        ops: candidates.slice(0, 2).map(c => c.nom),
        confidence: Math.round(candidates[0].score * 100),
        raison: `Basé sur fiabilité (${Math.round(candidates[0].score * 100)}%) et habitudes`,
      });
    }
  }

  return recs;
}

// ── Helper ───────────────────────────────────────────────────────────────────

function hm(m: number): string {
  if (!m) return "0h00";
  return `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, "0")}`;
}
