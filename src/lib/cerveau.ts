// ═══════════════════════════════════════════════════════════════════════
// CERVEAU — Moteur d'apprentissage du planning industriel SIAL
// Collecte les metriques, analyse les tendances, genere des recommandations
// et nourrit le planning avec des temps appris (remplace les theoriques)
// ═══════════════════════════════════════════════════════════════════════

import prisma from "@/lib/prisma";
import { TYPES_MENUISERIE, EQUIPE, POSTES_COMPETENCES } from "@/lib/sial-data";

// ── Cles de stockage PlanningPoste ──────────────────────────────────

const CERVEAU_KEYS = {
  metrics: "__cerveau_metrics__",
  analysis: "__cerveau_analysis__",
  recommendations: "__cerveau_recommendations__",
  anomalies: "__cerveau_anomalies__",
} as const;

// ── Seuils de detection ──────────────────────────────────────────────

/** Ecart en % a partir duquel un temps est considere comme anomalie */
const ANOMALY_THRESHOLD_PERCENT = 40;

/** Nombre minimum de taches pour que le temps appris soit fiable */
const MIN_SAMPLE_SIZE = 5;

/** Ecart en % a partir duquel on recommande un ajustement de temps */
const ADJUST_TIME_THRESHOLD_PERCENT = 15;

/** Ratio actual/estimated a partir duquel un operateur est en difficulte */
const OPERATOR_SLOW_THRESHOLD = 1.3;

/** Ratio actual/estimated en dessous duquel un operateur est rapide */
const OPERATOR_FAST_THRESHOLD = 0.85;

/** Nombre de semaines analysees pour le trend */
const _TREND_WEEKS = 8;

/** Seuil de charge (%) a partir duquel un poste est en alerte capacite */
const CAPACITY_ALERT_THRESHOLD = 90;

// ── Interfaces publiques ─────────────────────────────────────────────

export interface TaskMetric {
  commandeId: string;
  typeId: string;
  poste: string;
  operatorIds: string[];
  estimatedMinutes: number;
  actualMinutes: number;
  date: string;
  weekNumber: number;
  recordedAt: string;
}

export interface AnalysisResult {
  tasksAnalyzed: number;
  anomaliesDetected: number;
  recommendationsGenerated: number;
  postAnalysis: PostAnalysis[];
  operatorAnalysis: OperatorAnalysis[];
}

export interface PostAnalysis {
  poste: string;
  typeId: string;
  sampleSize: number;
  avgEstimated: number;
  avgActual: number;
  ecartPercent: number;
  trend: "improving" | "degrading" | "stable";
}

export interface OperatorAnalysis {
  operatorId: string;
  operatorName: string;
  poste: string;
  taskCount: number;
  avgTimeRatio: number;
  qualityScore: number;
  bestPostes: string[];
  trend: "improving" | "degrading" | "stable";
}

export interface OperatorScore {
  operatorId: string;
  avgTimeRatio: number;
  taskCount: number;
  qualityScore: number;
}

export interface Recommendation {
  id: string;
  type: "adjust_time" | "reassign_operator" | "capacity_alert" | "skill_upgrade";
  severity: "info" | "warning" | "critical";
  message: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface Anomaly {
  id: string;
  typeId: string;
  poste: string;
  operatorId?: string;
  estimated: number;
  actual: number;
  deviationPercent: number;
  date: string;
  resolved: boolean;
}

// ── Helpers internes ─────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function getISOWeekNumber(dateStr: string): number {
  const d = new Date(dateStr);
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getOperatorName(operatorId: string): string {
  const op = EQUIPE.find((e) => e.id === operatorId);
  return op?.nom ?? operatorId;
}

function _median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function trimmedMean(values: number[], trimPercent = 0.1): number {
  if (values.length < 4) return mean(values);
  const sorted = [...values].sort((a, b) => a - b);
  const trimCount = Math.floor(sorted.length * trimPercent);
  const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
  return mean(trimmed);
}

// ── Stockage (PlanningPoste key-value JSON) ──────────────────────────

async function readCerveauData<T>(key: string, fallback: T): Promise<T> {
  try {
    const record = await (prisma as any).planningPoste.findUnique({
      where: { semaine: key },
    });
    if (!record) return fallback;
    return record.plan as T;
  } catch {
    return fallback;
  }
}

async function writeCerveauData(key: string, data: unknown): Promise<void> {
  await (prisma as any).planningPoste.upsert({
    where: { semaine: key },
    create: { semaine: key, plan: data, updatedAt: new Date() },
    update: { plan: data, updatedAt: new Date() },
  });
}

// ── API Publique ─────────────────────────────────────────────────────

/**
 * Enregistre une tache terminee avec ses temps reel vs estime.
 * Ajoute la metrique a la base et detecte les anomalies en temps reel.
 */
export async function recordTaskCompletion(data: {
  commandeId: string;
  typeId: string;
  poste: string;
  operatorIds: string[];
  estimatedMinutes: number;
  actualMinutes: number;
  date: string;
  weekNumber?: number;
}): Promise<TaskMetric> {
  const weekNumber = data.weekNumber ?? getISOWeekNumber(data.date);

  const metric: TaskMetric = {
    commandeId: data.commandeId,
    typeId: data.typeId,
    poste: data.poste,
    operatorIds: data.operatorIds,
    estimatedMinutes: data.estimatedMinutes,
    actualMinutes: data.actualMinutes,
    date: data.date,
    weekNumber,
    recordedAt: new Date().toISOString(),
  };

  // Lire les metriques existantes
  const metrics = await readCerveauData<TaskMetric[]>(CERVEAU_KEYS.metrics, []);
  metrics.push(metric);
  await writeCerveauData(CERVEAU_KEYS.metrics, metrics);

  // Detection d'anomalie en temps reel
  if (data.estimatedMinutes > 0) {
    const deviation =
      ((data.actualMinutes - data.estimatedMinutes) / data.estimatedMinutes) * 100;
    if (Math.abs(deviation) >= ANOMALY_THRESHOLD_PERCENT) {
      const anomalies = await readCerveauData<Anomaly[]>(CERVEAU_KEYS.anomalies, []);
      const anomaly: Anomaly = {
        id: generateId(),
        typeId: data.typeId,
        poste: data.poste,
        operatorId: data.operatorIds[0],
        estimated: data.estimatedMinutes,
        actual: data.actualMinutes,
        deviationPercent: Math.round(deviation * 10) / 10,
        date: data.date,
        resolved: false,
      };
      anomalies.push(anomaly);
      await writeCerveauData(CERVEAU_KEYS.anomalies, anomalies);
    }
  }

  return metric;
}

/**
 * Lance l'analyse hebdomadaire complete.
 * Analyse les metriques accumulees, detecte les tendances,
 * genere des recommandations et met a jour les temps appris.
 */
export async function runWeeklyAnalysis(): Promise<AnalysisResult> {
  const metrics = await readCerveauData<TaskMetric[]>(CERVEAU_KEYS.metrics, []);

  if (metrics.length === 0) {
    const emptyResult: AnalysisResult = {
      tasksAnalyzed: 0,
      anomaliesDetected: 0,
      recommendationsGenerated: 0,
      postAnalysis: [],
      operatorAnalysis: [],
    };
    await writeCerveauData(CERVEAU_KEYS.analysis, emptyResult);
    return emptyResult;
  }

  // ── 1. Analyse par poste + type ───────────────────────────────────

  const postAnalysis: PostAnalysis[] = [];
  const byPosteType = new Map<string, TaskMetric[]>();

  for (const m of metrics) {
    const key = `${m.poste}::${m.typeId}`;
    if (!byPosteType.has(key)) byPosteType.set(key, []);
    byPosteType.get(key)!.push(m);
  }

  for (const [key, tasks] of Array.from(byPosteType.entries())) {
    const [poste, typeId] = key.split("::");
    const estimated = tasks.map((t: TaskMetric) => t.estimatedMinutes);
    const actual = tasks.map((t: TaskMetric) => t.actualMinutes);
    const avgEst = mean(estimated);
    const avgAct = trimmedMean(actual);
    const ecart = avgEst > 0 ? ((avgAct - avgEst) / avgEst) * 100 : 0;

    // Calculer le trend sur les TREND_WEEKS dernieres semaines
    const trend = computeTrend(tasks);

    postAnalysis.push({
      poste,
      typeId,
      sampleSize: tasks.length,
      avgEstimated: Math.round(avgEst * 10) / 10,
      avgActual: Math.round(avgAct * 10) / 10,
      ecartPercent: Math.round(ecart * 10) / 10,
      trend,
    });
  }

  // ── 2. Analyse par operateur ──────────────────────────────────────

  const operatorAnalysis: OperatorAnalysis[] = [];
  const byOperatorPoste = new Map<string, TaskMetric[]>();

  for (const m of metrics) {
    for (const opId of m.operatorIds) {
      const key = `${opId}::${m.poste}`;
      if (!byOperatorPoste.has(key)) byOperatorPoste.set(key, []);
      byOperatorPoste.get(key)!.push(m);
    }
  }

  // Per-operator aggregation
  const operatorPostesMap = new Map<string, Map<string, TaskMetric[]>>();
  for (const [key, tasks] of Array.from(byOperatorPoste.entries())) {
    const [opId, poste] = key.split("::");
    if (!operatorPostesMap.has(opId)) operatorPostesMap.set(opId, new Map());
    operatorPostesMap.get(opId)!.set(poste, tasks);
  }

  for (const [opId, postesMap] of Array.from(operatorPostesMap.entries())) {
    // Find best postes (lowest avg ratio)
    const posteRatios: { poste: string; ratio: number; count: number }[] = [];

    for (const [poste, tasks] of Array.from(postesMap.entries())) {
      const ratios = tasks
        .filter((t: TaskMetric) => t.estimatedMinutes > 0)
        .map((t: TaskMetric) => t.actualMinutes / t.estimatedMinutes);

      if (ratios.length === 0) continue;

      const avgRatio = trimmedMean(ratios);
      const anomalyCount = tasks.filter(
        (t) =>
          t.estimatedMinutes > 0 &&
          Math.abs(
            ((t.actualMinutes - t.estimatedMinutes) / t.estimatedMinutes) * 100
          ) >= ANOMALY_THRESHOLD_PERCENT
      ).length;
      const qualityScore =
        tasks.length > 0
          ? Math.round(((tasks.length - anomalyCount) / tasks.length) * 100)
          : 100;

      const trend = computeTrend(tasks);

      posteRatios.push({ poste, ratio: avgRatio, count: tasks.length });

      operatorAnalysis.push({
        operatorId: opId,
        operatorName: getOperatorName(opId),
        poste,
        taskCount: tasks.length,
        avgTimeRatio: Math.round(avgRatio * 100) / 100,
        qualityScore,
        bestPostes: [], // Filled below
        trend,
      });
    }

    // Set bestPostes for all analyses of this operator
    const sortedPostes = posteRatios
      .filter((p) => p.count >= 3)
      .sort((a, b) => a.ratio - b.ratio)
      .map((p) => p.poste);
    const bestPostes = sortedPostes.slice(0, 3);

    for (const analysis of operatorAnalysis) {
      if (analysis.operatorId === opId) {
        analysis.bestPostes = bestPostes;
      }
    }
  }

  // ── 3. Generer les recommandations ────────────────────────────────

  const recommendations: Recommendation[] = [];
  const now = new Date().toISOString();

  // 3a. Ajustements de temps
  for (const pa of postAnalysis) {
    if (
      pa.sampleSize >= MIN_SAMPLE_SIZE &&
      Math.abs(pa.ecartPercent) >= ADJUST_TIME_THRESHOLD_PERCENT
    ) {
      const direction = pa.ecartPercent > 0 ? "superieur" : "inferieur";
      const severity: Recommendation["severity"] =
        Math.abs(pa.ecartPercent) >= 30 ? "warning" : "info";
      const typeLabel =
        TYPES_MENUISERIE[pa.typeId]?.label ?? pa.typeId;

      recommendations.push({
        id: generateId(),
        type: "adjust_time",
        severity,
        message:
          `Le temps reel au poste "${pa.poste}" pour "${typeLabel}" est ${Math.abs(pa.ecartPercent).toFixed(0)}% ` +
          `${direction} a l'estime (${pa.avgActual.toFixed(0)} min vs ${pa.avgEstimated.toFixed(0)} min estimes). ` +
          `Recommandation : ajuster le temps theorique a ${pa.avgActual.toFixed(0)} min.`,
        data: {
          poste: pa.poste,
          typeId: pa.typeId,
          currentEstimate: pa.avgEstimated,
          suggestedTime: pa.avgActual,
          sampleSize: pa.sampleSize,
          ecartPercent: pa.ecartPercent,
        },
        createdAt: now,
      });
    }
  }

  // 3b. Recommandations operateurs
  for (const oa of operatorAnalysis) {
    if (oa.taskCount < MIN_SAMPLE_SIZE) continue;

    if (oa.avgTimeRatio >= OPERATOR_SLOW_THRESHOLD) {
      const posteLabel =
        POSTES_COMPETENCES.find((p) => p.id === oa.poste)?.label ?? oa.poste;
      recommendations.push({
        id: generateId(),
        type: "reassign_operator",
        severity: oa.avgTimeRatio >= 1.5 ? "warning" : "info",
        message:
          `${oa.operatorName} est ${Math.round((oa.avgTimeRatio - 1) * 100)}% plus lent que l'estime au poste "${posteLabel}" ` +
          `(ratio ${oa.avgTimeRatio.toFixed(2)}, ${oa.taskCount} taches). ` +
          (oa.bestPostes.length > 0
            ? `Ses meilleurs postes sont : ${oa.bestPostes.join(", ")}.`
            : `Envisager une formation complementaire.`),
        data: {
          operatorId: oa.operatorId,
          operatorName: oa.operatorName,
          poste: oa.poste,
          avgTimeRatio: oa.avgTimeRatio,
          taskCount: oa.taskCount,
          bestPostes: oa.bestPostes,
        },
        createdAt: now,
      });
    }

    // Skill upgrade suggestion for fast operators on limited postes
    if (
      oa.avgTimeRatio <= OPERATOR_FAST_THRESHOLD &&
      oa.taskCount >= MIN_SAMPLE_SIZE * 2
    ) {
      const posteLabel =
        POSTES_COMPETENCES.find((p) => p.id === oa.poste)?.label ?? oa.poste;
      recommendations.push({
        id: generateId(),
        type: "skill_upgrade",
        severity: "info",
        message:
          `${oa.operatorName} est tres performant au poste "${posteLabel}" ` +
          `(ratio ${oa.avgTimeRatio.toFixed(2)}, ${oa.taskCount} taches, qualite ${oa.qualityScore}%). ` +
          `Envisager de le valoriser comme referent ou formateur sur ce poste.`,
        data: {
          operatorId: oa.operatorId,
          operatorName: oa.operatorName,
          poste: oa.poste,
          avgTimeRatio: oa.avgTimeRatio,
          qualityScore: oa.qualityScore,
        },
        createdAt: now,
      });
    }
  }

  // 3c. Alertes de capacite par poste
  const posteTotalActual = new Map<string, number>();
  const posteTotalEstimated = new Map<string, number>();
  for (const m of metrics) {
    posteTotalActual.set(
      m.poste,
      (posteTotalActual.get(m.poste) ?? 0) + m.actualMinutes
    );
    posteTotalEstimated.set(
      m.poste,
      (posteTotalEstimated.get(m.poste) ?? 0) + m.estimatedMinutes
    );
  }

  for (const poste of POSTES_COMPETENCES.map((p) => p.id)) {
    const totalActual = posteTotalActual.get(poste) ?? 0;
    const totalEstimated = posteTotalEstimated.get(poste) ?? 0;
    if (totalEstimated > 0) {
      const loadPercent = (totalActual / totalEstimated) * 100;
      if (loadPercent >= CAPACITY_ALERT_THRESHOLD) {
        const posteLabel =
          POSTES_COMPETENCES.find((p) => p.id === poste)?.label ?? poste;
        recommendations.push({
          id: generateId(),
          type: "capacity_alert",
          severity: loadPercent >= 110 ? "critical" : "warning",
          message:
            `Le poste "${posteLabel}" est a ${loadPercent.toFixed(0)}% de charge reelle vs estimee. ` +
            (loadPercent >= 110
              ? `Situation critique : les taches prennent systematiquement plus de temps que prevu. Redistribution ou renfort necessaire.`
              : `Le poste approche de la saturation. Surveiller la tendance.`),
          data: {
            poste,
            totalActualMinutes: totalActual,
            totalEstimatedMinutes: totalEstimated,
            loadPercent: Math.round(loadPercent),
          },
          createdAt: now,
        });
      }
    }
  }

  // ── 4. Detecter les anomalies non resolues ────────────────────────

  const anomalies = await readCerveauData<Anomaly[]>(CERVEAU_KEYS.anomalies, []);
  const unresolvedAnomalies = anomalies.filter((a) => !a.resolved);

  // ── 5. Stocker les resultats ──────────────────────────────────────

  const result: AnalysisResult = {
    tasksAnalyzed: metrics.length,
    anomaliesDetected: unresolvedAnomalies.length,
    recommendationsGenerated: recommendations.length,
    postAnalysis,
    operatorAnalysis,
  };

  await writeCerveauData(CERVEAU_KEYS.analysis, result);
  await writeCerveauData(CERVEAU_KEYS.recommendations, recommendations);

  return result;
}

/**
 * Retourne le temps appris (median trimme) pour un type + poste.
 * Retourne null si pas assez de donnees (< MIN_SAMPLE_SIZE).
 * Le temps appris est plus fiable que le theorique car base sur le reel.
 */
export async function getLearnedTime(
  typeId: string,
  poste: string
): Promise<number | null> {
  const metrics = await readCerveauData<TaskMetric[]>(CERVEAU_KEYS.metrics, []);
  const relevant = metrics.filter(
    (m) => m.typeId === typeId && m.poste === poste
  );

  if (relevant.length < MIN_SAMPLE_SIZE) return null;

  // Utiliser un trimmed mean pour exclure les outliers
  const actualTimes = relevant.map((m) => m.actualMinutes);
  const learned = trimmedMean(actualTimes);

  return Math.round(learned);
}

/**
 * Retourne tous les temps appris sous forme de map { "typeId|poste": minutes }.
 * Utilisé côté client pour réinjecter les temps réels dans le routage.
 */
export interface LearnedTimesEntry {
  minutes: number;
  sampleSize: number;
  ratio: number; // ratio actuel/estime moyen (1.0 = identique)
}

export async function getAllLearnedTimes(): Promise<Record<string, LearnedTimesEntry>> {
  const metrics = await readCerveauData<TaskMetric[]>(CERVEAU_KEYS.metrics, []);
  const byKey = new Map<string, TaskMetric[]>();
  for (const m of metrics) {
    const k = `${m.typeId}|${m.poste}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(m);
  }
  const out: Record<string, LearnedTimesEntry> = {};
  for (const [k, arr] of Array.from(byKey.entries())) {
    if (arr.length < MIN_SAMPLE_SIZE) continue;
    const actuals = arr.map(m => m.actualMinutes);
    const estimates = arr.map(m => m.estimatedMinutes).filter(v => v > 0);
    const avgActual = trimmedMean(actuals);
    const avgEstimate = estimates.length > 0 ? mean(estimates) : 0;
    out[k] = {
      minutes: Math.round(avgActual),
      sampleSize: arr.length,
      ratio: avgEstimate > 0 ? Math.round((avgActual / avgEstimate) * 100) / 100 : 1,
    };
  }
  return out;
}

/**
 * Score de performance d'un operateur sur un poste.
 * avgTimeRatio < 1 = plus rapide que l'estime, > 1 = plus lent.
 * qualityScore = % de taches sans anomalie.
 */
export async function getOperatorScore(
  operatorId: string,
  poste: string
): Promise<OperatorScore | null> {
  const metrics = await readCerveauData<TaskMetric[]>(CERVEAU_KEYS.metrics, []);
  const relevant = metrics.filter(
    (m) => m.operatorIds.includes(operatorId) && m.poste === poste
  );

  if (relevant.length === 0) return null;

  const ratios = relevant
    .filter((t) => t.estimatedMinutes > 0)
    .map((t) => t.actualMinutes / t.estimatedMinutes);

  if (ratios.length === 0) return null;

  const avgRatio = trimmedMean(ratios);
  const anomalyCount = relevant.filter(
    (t) =>
      t.estimatedMinutes > 0 &&
      Math.abs(
        ((t.actualMinutes - t.estimatedMinutes) / t.estimatedMinutes) * 100
      ) >= ANOMALY_THRESHOLD_PERCENT
  ).length;
  const qualityScore =
    relevant.length > 0
      ? Math.round(((relevant.length - anomalyCount) / relevant.length) * 100)
      : 100;

  return {
    operatorId,
    avgTimeRatio: Math.round(avgRatio * 100) / 100,
    taskCount: relevant.length,
    qualityScore,
  };
}

// ── Helpers internes pour l'analyse ──────────────────────────────────

/**
 * Calcule le trend d'un ensemble de metriques sur les dernieres semaines.
 * Compare la moyenne des semaines recentes vs anciennes.
 */
function computeTrend(
  tasks: TaskMetric[]
): "improving" | "degrading" | "stable" {
  if (tasks.length < 4) return "stable";

  // Grouper par semaine
  const byWeek = new Map<number, number[]>();
  for (const t of tasks) {
    if (t.estimatedMinutes <= 0) continue;
    const ratio = t.actualMinutes / t.estimatedMinutes;
    if (!byWeek.has(t.weekNumber)) byWeek.set(t.weekNumber, []);
    byWeek.get(t.weekNumber)!.push(ratio);
  }

  const weeks = Array.from(byWeek.keys()).sort((a, b) => a - b);
  if (weeks.length < 2) return "stable";

  // Diviser en moitie ancienne / moitie recente
  const midpoint = Math.floor(weeks.length / 2);
  const oldWeeks = weeks.slice(0, midpoint);
  const recentWeeks = weeks.slice(midpoint);

  const oldRatios: number[] = [];
  for (const w of oldWeeks) {
    oldRatios.push(...(byWeek.get(w) ?? []));
  }

  const recentRatios: number[] = [];
  for (const w of recentWeeks) {
    recentRatios.push(...(byWeek.get(w) ?? []));
  }

  if (oldRatios.length === 0 || recentRatios.length === 0) return "stable";

  const oldAvg = mean(oldRatios);
  const recentAvg = mean(recentRatios);

  // Un ratio qui diminue = amelioration (actual/estimated baisse)
  const change = ((recentAvg - oldAvg) / oldAvg) * 100;

  if (change <= -10) return "improving"; // Ratio baisse de 10%+
  if (change >= 10) return "degrading"; // Ratio monte de 10%+
  return "stable";
}
