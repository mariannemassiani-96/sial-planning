import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { buildHistorique, analyserTemps, analyserOperateurs, detecterAlertes } from "@/lib/cerveau";

const BRAIN_KEY = "__cerveau_state__";

/**
 * POST /api/cerveau/learn
 *
 * Tourne automatiquement chaque nuit à 3h via Vercel Cron.
 * Analyse tous les pointages historiques et stocke les apprentissages
 * de façon persistante. Ces apprentissages sont utilisés par :
 * - La planification automatique (meilleurs opérateurs, vrais temps)
 * - Les alertes proactives
 * - Le dashboard cerveau
 *
 * Le cerveau accumule les connaissances même si personne ne touche au code.
 */
export async function POST() {
  try {
    const startTime = Date.now();

    // 1. Charger TOUS les pointages historiques
    const records = await prisma.planningPoste.findMany({
      where: { semaine: { startsWith: "pointage_" } },
      orderBy: { semaine: "asc" },
    });

    const pointages = records.map(r => ({
      date: r.semaine.replace("pointage_", ""),
      entries: (r.plan as any)?.entries || (r.plan as Record<string, any>) || {},
      imprevu: (r.plan as any)?.imprevu || [],
    }));

    // 2. Construire l'historique complet
    const historique = buildHistorique(pointages);

    // 3. Analyser
    const tempsAppris = analyserTemps(historique);
    const operateurs = analyserOperateurs(historique);
    const alertes = detecterAlertes(historique, tempsAppris, operateurs);

    // 4. Charger les habitudes d'affectation
    const habitsRec = await prisma.planningPoste.findUnique({ where: { semaine: "aff___habits__" } });
    const habits = (habitsRec?.plan ?? {}) as Record<string, Record<string, number>>;

    // 5. Calculer les temps recommandés par poste (moyenne pondérée récente)
    const tempsRecommandes: Record<string, number> = {};
    for (const t of tempsAppris) {
      if (t.nbSamples >= 3) {
        // Pondérer : médiane pour éviter les outliers
        tempsRecommandes[t.postId] = t.medianeMin;
      }
    }

    // 6. Calculer le score de fiabilité par opérateur × poste
    const opPostScores: Record<string, Record<string, number>> = {};
    for (const op of operateurs) {
      opPostScores[op.nom] = {};
      for (const [poste, data] of Object.entries(op.tempsParPoste)) {
        // Score = fiabilité × nb tâches (plus d'expérience = meilleur score)
        const expScore = Math.min(data.nbTaches / 10, 1); // 0-1 basé sur expérience
        opPostScores[op.nom][poste] = Math.round(op.fiabilite * 0.6 + expScore * 100 * 0.4);
      }
    }

    // 7. Stocker l'état du cerveau en base
    const brainState = {
      lastUpdate: new Date().toISOString(),
      lastUpdateDuration: Date.now() - startTime,
      nbPointages: pointages.length,
      nbEntries: historique.length,
      periodeFrom: pointages[0]?.date || "",
      periodeTo: pointages[pointages.length - 1]?.date || "",

      // Apprentissages persistants
      tempsAppris,
      tempsRecommandes,
      operateurs,
      opPostScores,
      alertes,
      habits,

      // Méta-stats
      totalHeuresPointees: historique.filter(h => h.realMin > 0).reduce((s, h) => s + h.realMin, 0),
      totalTachesFaites: historique.filter(h => h.status === "fait").length,
      totalTachesPartielles: historique.filter(h => h.status === "partiel").length,
      totalTachesPasFaites: historique.filter(h => h.status === "pasfait").length,
      topRaisonsGlobales: (() => {
        const r: Record<string, number> = {};
        for (const h of historique) { if (h.raison) r[h.raison] = (r[h.raison] || 0) + 1; }
        return Object.entries(r).sort((a, b) => b[1] - a[1]).slice(0, 10);
      })(),
    };

    await prisma.planningPoste.upsert({
      where: { semaine: BRAIN_KEY },
      update: { plan: brainState as any },
      create: { semaine: BRAIN_KEY, plan: brainState as any },
    });

    const duration = Date.now() - startTime;
    console.log(`🧠 Cerveau learn OK — ${pointages.length} jours, ${historique.length} tâches, ${duration}ms`);

    return NextResponse.json({
      ok: true,
      duration,
      nbPointages: pointages.length,
      nbEntries: historique.length,
      nbAlertes: alertes.length,
      nbOperateurs: operateurs.length,
      nbTempsAppris: tempsAppris.length,
    });
  } catch (e: any) {
    console.error("🧠 Cerveau learn ERROR:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET pour pouvoir aussi déclencher manuellement
export async function GET() {
  return POST();
}
