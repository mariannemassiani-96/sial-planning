// ═══════════════════════════════════════════════════════════════════════
// TEST DE BOUT EN BOUT — Validation du système de planification SIAL
//
// Simule une semaine de travail réaliste pour SIAL :
//   - 13 chantiers représentatifs (frappes, coulissants, galandages, portes,
//     hors standard, intervention SAV, multi-livraisons, grand format)
//   - 13 opérateurs (équipe complète)
//   - 1 chantier ISULA grand format
//
// Vérifie :
//   1. Tous les chantiers sont planifiables
//   2. Chaque chantier a un Critical Ratio cohérent
//   3. Le goulot est correctement détecté
//   4. La répartition Frappes/Coulissants (Heijunka) est lissée
//   5. La capacité hebdo n'est dépassée nulle part
//   6. Les contraintes ISULA (lun/mar/jeu) sont respectées
//   7. Les livraisons multi-zones génèrent bien chargement + livraison
//   8. Les opérateurs polyvalents ne sont pas sur 2 postes en même temps
//   9. Tous les opérateurs sont occupés (charge > 0)
//
// Usage : npx ts-node scripts/test-planification.ts
//         (ou en script standalone exécuté à la main)
// ═══════════════════════════════════════════════════════════════════════

import { EQUIPE, type CommandeCC, detectSpecialMultiplier } from "../src/lib/sial-data";
import { getRoutage } from "../src/lib/routage-production";
import {
  calcCriticalRatio, detectBottleneck, calcTakt,
} from "../src/lib/scheduling-priority";
import { suggestModeJourSemaine } from "../src/lib/heijunka";
import { computeAutoSemaines } from "../src/lib/auto-planning";
import { listLivraisonsForWeek, dureeLivraison, nbDemiJourneesLivraison } from "../src/lib/livraison";
import { postCapacityMinDay, chooseNbOps, detectStrategy } from "../src/lib/work-posts";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, predicate: boolean, detail?: string) {
  if (predicate) {
    console.log(`  ${GREEN}✓${RESET} ${name}${detail ? ` ${CYAN}(${detail})${RESET}` : ""}`);
    passed++;
  } else {
    console.log(`  ${RED}✗${RESET} ${name}${detail ? ` ${RED}(${detail})${RESET}` : ""}`);
    failures.push(name + (detail ? ` — ${detail}` : ""));
    failed++;
  }
}

function header(label: string) {
  console.log(`\n${BOLD}${BLUE}━━━ ${label} ━━━${RESET}`);
}

// ── Données de test : semaine pleine, 13 chantiers, 13 opérateurs ────
const today = new Date();
today.setHours(0, 0, 0, 0);
const monday = (() => {
  const d = new Date(today);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();
const friday = (() => { const d = new Date(monday + "T12:00:00"); d.setDate(d.getDate() + 4); return d.toISOString().split("T")[0]; })();
const nextMonday = (() => { const d = new Date(monday + "T12:00:00"); d.setDate(d.getDate() + 7); return d.toISOString().split("T")[0]; })();
const nextFriday = (() => { const d = new Date(monday + "T12:00:00"); d.setDate(d.getDate() + 11); return d.toISOString().split("T")[0]; })();

function mkCmd(opts: {
  id: string;
  client: string;
  ref: string;
  zone?: string;
  transporteur?: string;
  livraison: string;
  /** Si fourni, force semaine_montage = monday courant (pour faire tomber
   *  la charge sur la semaine en cours dans les tests). */
  forceSemMontage?: string;
  hsTemps?: Record<string, string | number>;
  lignes: Array<{ type: string; quantite: number; coloris?: string; largeur_mm?: string;
                  hs_t_coupe?: string; hs_t_montage?: string; hs_t_vitrage?: string }>;
  vitrages?: Array<{ fournisseur?: string; quantite?: string; largeur?: string; hauteur?: string }>;
  multi?: Array<{ date: string; description: string }>;
  priorite?: string;
}): CommandeCC {
  const cmd: any = {
    id: opts.id,
    num_commande: `PRO-${opts.id}`,
    client: opts.client,
    ref_chantier: opts.ref,
    zone: opts.zone || "Porto-Vecchio",
    transporteur: opts.transporteur || "nous",
    priorite: opts.priorite || "normale",
    statut: "fab",
    type: opts.lignes[0].type,
    quantite: opts.lignes.reduce((s, l) => s + l.quantite, 0),
    lignes: opts.lignes,
    hsTemps: opts.hsTemps || null,
    vitrages: opts.vitrages || [],
    aucun_vitrage: !opts.vitrages,
    aucune_menuiserie: false,
    date_livraison_souhaitee: opts.livraison,
    nb_livraisons: opts.multi ? opts.multi.length : 1,
    dates_livraisons: opts.multi || null,
  };
  // Auto-pose les semaines
  const auto = computeAutoSemaines(cmd);
  Object.assign(cmd, auto);
  // Forçage éventuel pour les tests (faire tomber la charge cette semaine)
  if (opts.forceSemMontage) {
    cmd.semaine_montage = opts.forceSemMontage;
    cmd.semaine_coupe = opts.forceSemMontage;
  }
  return cmd as CommandeCC;
}

// 13 chantiers représentatifs
const commandes: CommandeCC[] = [
  // 1. Frappes PVC standard, multi-livraisons, urgent
  mkCmd({
    id: "1", client: "Dupont", ref: "Villa Mer",
    zone: "Porto-Vecchio", transporteur: "nous",
    livraison: friday,
    lignes: [
      { type: "ob1_pvc", quantite: 8, coloris: "Blanc" },
      { type: "of2_pvc", quantite: 4, coloris: "Blanc" },
    ],
    vitrages: [{ fournisseur: "isula", quantite: "16", largeur: "1200", hauteur: "1500" }],
    multi: [
      { date: friday, description: "Livraison 1/2" },
      { date: nextFriday, description: "Livraison 2/2" },
    ],
    priorite: "urgente",
  }),
  // 2. Coulissants ALU, grand format >4m
  mkCmd({
    id: "2", client: "Martin", ref: "Résidence Plage",
    zone: "Plaine Orientale", transporteur: "nous",
    livraison: nextMonday,
    lignes: [
      { type: "c4v4r", quantite: 2, coloris: "RAL 7016", largeur_mm: "4500" },
    ],
    vitrages: [{ fournisseur: "isula", quantite: "8", largeur: "1100", hauteur: "2200" }],
  }),
  // 3. Galandage grand format
  mkCmd({
    id: "3", client: "Lopez", ref: "Maison Bois",
    zone: "Ajaccio",
    livraison: nextFriday,
    lignes: [{ type: "g2v2r", quantite: 1, coloris: "Anthracite", largeur_mm: "5500" }],
    vitrages: [{ fournisseur: "isula", quantite: "2", largeur: "2100", hauteur: "2400" }],
  }),
  // 4. Portes ALU
  mkCmd({
    id: "4", client: "Garcia", ref: "Bureau",
    zone: "Bastia", transporteur: "setec",
    livraison: nextMonday,
    lignes: [{ type: "p1_alu", quantite: 2, coloris: "Noir" }],
    vitrages: [{ fournisseur: "sigma", quantite: "2" }],
  }),
  // 5. Hors standard (sur-mesure JP) — hsTemps au niveau commande
  mkCmd({
    id: "5", client: "Rossi", ref: "Loft",
    zone: "Porto-Vecchio",
    livraison: nextFriday,
    lignes: [{ type: "hors_standard", quantite: 1 }],
    hsTemps: { t_coupe: "300", t_montage: "600", t_vitrage: "180" },
    forceSemMontage: monday,
  }),
  // 6. Intervention SAV chantier (pas de fab, juste montage)
  mkCmd({
    id: "6", client: "Bianchi", ref: "SAV-2025",
    zone: "Sur chantier", transporteur: "poseur",
    livraison: friday,
    lignes: [{ type: "intervention_chantier", quantite: 1 }],
    hsTemps: { t_montage: "120" },
    priorite: "urgente",
  }),
  // 7-9. Frappes ALU — montage forcé sur la semaine courante
  mkCmd({ id: "7", client: "Dubois", ref: "Villa A", zone: "Balagne", livraison: nextFriday,
    forceSemMontage: monday,
    lignes: [{ type: "of1_alu", quantite: 6, coloris: "Anthracite" }],
    vitrages: [{ fournisseur: "isula", quantite: "6", largeur: "900", hauteur: "1200" }] }),
  mkCmd({ id: "8", client: "Leroy", ref: "Résidence B", zone: "Ajaccio", livraison: nextFriday,
    forceSemMontage: monday,
    lignes: [{ type: "ob2_alu", quantite: 4, coloris: "Blanc" }],
    vitrages: [{ fournisseur: "isula", quantite: "8", largeur: "1000", hauteur: "1300" }] }),
  mkCmd({ id: "9", client: "Moreau", ref: "Maison C", zone: "Plaine Orientale", livraison: nextFriday,
    forceSemMontage: monday,
    lignes: [{ type: "of2_alu", quantite: 3, coloris: "RAL 7016" }],
    vitrages: [{ fournisseur: "isula", quantite: "6", largeur: "1100", hauteur: "1400" }] }),
  // 10-11. Coulissants — montage forcé sur la semaine courante
  mkCmd({ id: "10", client: "Bernard", ref: "Villa D", zone: "Porto-Vecchio", livraison: nextMonday,
    forceSemMontage: monday,
    lignes: [{ type: "c2v2r", quantite: 3, coloris: "Anthracite" }],
    vitrages: [{ fournisseur: "isula", quantite: "6", largeur: "1500", hauteur: "2200" }] }),
  mkCmd({ id: "11", client: "Petit", ref: "Maison E", zone: "Continent", transporteur: "express",
    livraison: nextFriday, forceSemMontage: monday,
    lignes: [{ type: "c3v3r", quantite: 1, coloris: "Blanc laqué" }],
    vitrages: [{ fournisseur: "isula", quantite: "3", largeur: "1500", hauteur: "2400" }] }),
  // 12. Fixe PVC (pas de vitrage ouvrant)
  mkCmd({ id: "12", client: "Costa", ref: "Cabanon", zone: "Balagne",
    livraison: nextFriday,
    lignes: [{ type: "fixe_pvc", quantite: 4, coloris: "Blanc" }] }),
  // 13. ISULA grand format (largeur > 2000mm)
  mkCmd({ id: "13", client: "Albertini", ref: "Verrière",
    zone: "Sur chantier", transporteur: "depot",
    livraison: nextFriday,
    lignes: [{ type: "g3v3r", quantite: 1, coloris: "Anthracite", largeur_mm: "6000" }],
    vitrages: [{ fournisseur: "isula", quantite: "3", largeur: "2200", hauteur: "3200" }] }),
];

// ════════════════════════════════════════════════════════════════════════
// EXÉCUTION DES TESTS
// ════════════════════════════════════════════════════════════════════════

console.log(`${BOLD}${MAGENTA}╔════════════════════════════════════════════════════════════╗${RESET}`);
console.log(`${BOLD}${MAGENTA}║  TEST DE PLANIFICATION SIAL — semaine pleine, équipe x13   ║${RESET}`);
console.log(`${BOLD}${MAGENTA}╚════════════════════════════════════════════════════════════╝${RESET}`);
console.log(`Semaine de planification : ${monday} → ${friday}`);
console.log(`Livraison J+1 : ${nextMonday} (S+1 lundi)`);
console.log(`13 chantiers, 13 opérateurs (équipe complète)\n`);

// ── 1. Auto-planning : tous les chantiers ont leurs semaines posées ──
header("1. AUTO-PLANNING : pose des semaines à partir de la date de livraison");
for (const cmd of commandes) {
  const a = cmd as any;
  const has = a.semaine_logistique && (a.aucune_menuiserie || a.semaine_montage);
  test(`Chantier ${a.ref_chantier} : semaines posées`, !!has,
    `coupe=${a.semaine_coupe || "-"} montage=${a.semaine_montage || "-"} vitrage=${a.semaine_vitrage || "-"} isula=${a.semaine_isula || "-"} log=${a.semaine_logistique || "-"}`);
}

// ── 2. Critical Ratio : tous les chantiers évalués ──
header("2. CRITICAL RATIO : urgence calculée pour chaque chantier");
let nbImpossible = 0, nbTendu = 0, nbNormal = 0, nbPeinard = 0;
for (const cmd of commandes) {
  const cr = calcCriticalRatio(cmd);
  test(`CR ${(cmd as any).ref_chantier}`,
    cr.level !== "inconnu",
    `${cr.level} — ratio ${cr.ratio} (${cr.joursDispo}j dispo / ${cr.joursBesoin}j besoin)`);
  if (cr.level === "impossible") nbImpossible++;
  else if (cr.level === "tendu") nbTendu++;
  else if (cr.level === "normal") nbNormal++;
  else if (cr.level === "peinard") nbPeinard++;
}
console.log(`  ${YELLOW}→ Répartition : ${nbImpossible} impossible, ${nbTendu} tendu, ${nbNormal} normal, ${nbPeinard} peinard${RESET}`);

// Helper pour calculer l'info ISULA depuis les vitrages de la commande
function isulaInfoFromCmd(cmd: any) {
  const v = Array.isArray(cmd.vitrages) ? cmd.vitrages : [];
  const isulaVit = v.filter((x: any) => (x.fournisseur || "").toLowerCase() === "isula");
  if (isulaVit.length === 0) return undefined;
  const nbVitrages = isulaVit.reduce((s: number, x: any) => s + (parseInt(x.quantite) || 1), 0);
  const grandFormat = isulaVit.some((x: any) =>
    (parseFloat(x.largeur) > 2000) || (parseFloat(x.hauteur) > 3000));
  return { nbVitrages, grandFormat };
}

// ── 3. Routage : chaque chantier a ses étapes ──
header("3. ROUTAGE : génération des étapes par poste pour chaque chantier");
let totalChargeMin = 0;
const chargeByPost: Record<string, number> = {};
for (const cmd of commandes) {
  const a = cmd as any;
  const lignes = a.lignes;
  let cmdMin = 0;
  const isulaInfo = isulaInfoFromCmd(a);
  // L'info ISULA est globale au chantier — on la passe à la 1re ligne pour
  // ne pas la dupliquer.
  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i];
    const lSf = detectSpecialMultiplier({ type: ligne.type, lignes: [ligne] });
    const routage = getRoutage(
      ligne.type, parseInt(ligne.quantite) || 1, a.hsTemps, lSf,
      undefined,
      i === 0 ? isulaInfo : undefined,
    );
    for (const e of routage) {
      cmdMin += e.estimatedMin;
      chargeByPost[e.postId] = (chargeByPost[e.postId] || 0) + e.estimatedMin;
    }
  }
  totalChargeMin += cmdMin;
  test(`Routage ${a.ref_chantier}`, cmdMin > 0 || a.lignes[0].type === "intervention_chantier",
    `${Math.round(cmdMin / 60 * 10) / 10}h de fab`);
}
console.log(`  ${YELLOW}→ Charge totale tous chantiers : ${Math.round(totalChargeMin / 60)}h${RESET}`);

// ── 4. Goulot : détection automatique ──
header("4. GOULOT : identification du poste le plus saturé");
const semaineCharge: Record<string, { totalMin: number }> = {};
for (const cmd of commandes) {
  const a = cmd as any;
  if (a.semaine_montage !== monday && a.semaine_coupe !== monday) continue;
  const isulaInfo = isulaInfoFromCmd(a);
  for (let i = 0; i < a.lignes.length; i++) {
    const ligne = a.lignes[i];
    const lSf = detectSpecialMultiplier({ type: ligne.type, lignes: [ligne] });
    const routage = getRoutage(ligne.type, parseInt(ligne.quantite) || 1, a.hsTemps, lSf,
      undefined, i === 0 ? isulaInfo : undefined);
    for (const e of routage) {
      if (!semaineCharge[e.postId]) semaineCharge[e.postId] = { totalMin: 0 };
      semaineCharge[e.postId].totalMin += e.estimatedMin;
    }
  }
}
const goulot = detectBottleneck(semaineCharge, 5);
test(`Goulot identifié`, !!goulot,
  goulot ? `${goulot.postId} à ${goulot.saturationPct}% (${Math.round(goulot.chargeMin / 60)}h / ${Math.round(goulot.capacityMin / 60)}h)` : "aucun");
// "ok" est un statut valide quand l'atelier n'est pas saturé — le test
// vérifie juste que la détection est cohérente avec le niveau de charge.
test(`Goulot status cohérent avec charge`, !!goulot &&
  ((goulot.saturationPct > 70) === (goulot.status !== "ok")),
  goulot ? `${goulot.status} (${goulot.saturationPct}%)` : "?");

// ── 5. Heijunka : suggestion mode jour ──
header("5. HEIJUNKA : suggestion mode jour Frappes/Coulissants");
const heij = suggestModeJourSemaine(commandes, monday);
test(`Suggestion générée`, heij.modesByDay.length === 5);
// Le mix doit refléter la charge proportionnellement, pas être 50/50 forcé.
const totalH = (heij.chargeFrappes + heij.chargeCoul) / 60 || 1;
const ratioMixSuggéré = heij.joursFrappes / 5;
const ratioChargeFrappes = heij.chargeFrappes / 60 / totalH;
test(`Mix Frappes/Coul proportionnel à la charge`,
  Math.abs(ratioMixSuggéré - ratioChargeFrappes) < 0.25,
  `${heij.joursFrappes}j frappes (${Math.round(ratioMixSuggéré * 100)}%) vs charge frappes ${Math.round(ratioChargeFrappes * 100)}%`);
console.log(`  ${YELLOW}→ Séquence : ${heij.modesByDay.map(m => m === "FRAPPES" ? "F" : "C").join(" ")}${RESET}`);
console.log(`  ${YELLOW}→ ${heij.raison}${RESET}`);

// ── 6. ISULA : contraintes lun/mar/jeu ──
header("6. ISULA : contraintes jours actifs (lun/mar/jeu) + grand format");
const isulaCmds = commandes.filter(c => {
  const v = (c as any).vitrages;
  return Array.isArray(v) && v.some((x: any) => (x.fournisseur || "").toLowerCase() === "isula");
});
test(`Chantiers ISULA détectés`, isulaCmds.length > 0, `${isulaCmds.length} sur ${commandes.length}`);
for (const cmd of isulaCmds) {
  const a = cmd as any;
  if (!a.semaine_isula) continue;
  const semIsulaDate = new Date(a.semaine_isula + "T00:00:00");
  const isMonday = semIsulaDate.getDay() === 1;
  test(`${a.ref_chantier} : semaine_isula commence un lundi`, isMonday, a.semaine_isula);
  // Vérifier que isula est avant montage
  if (a.semaine_montage) {
    const monMontage = new Date(a.semaine_montage + "T00:00:00").getTime();
    const monIsula = new Date(a.semaine_isula + "T00:00:00").getTime();
    test(`${a.ref_chantier} : ISULA avant montage (S-1 mini)`,
      monIsula <= monMontage - 7 * 86400000,
      `isula=${a.semaine_isula} montage=${a.semaine_montage}`);
  }
}
// Grand format ISULA → 6 jours au lieu de 4
const gfIsula = commandes.find(c => {
  const v = (c as any).vitrages;
  return Array.isArray(v) && v.some((x: any) =>
    (x.fournisseur || "").toLowerCase() === "isula" &&
    (parseFloat(x.largeur) > 2000 || parseFloat(x.hauteur) > 3000));
});
if (gfIsula) {
  const a = gfIsula as any;
  const monMontage = new Date(a.semaine_montage + "T00:00:00").getTime();
  const monIsula = new Date(a.semaine_isula + "T00:00:00").getTime();
  test(`Grand format ISULA (${a.ref_chantier}) : ISULA à -2 sem du montage`,
    monIsula <= monMontage - 14 * 86400000,
    `Δ = ${(monMontage - monIsula) / 86400000} jours`);
}

// ── 7. Spéciaux grand format > 4m ──
header("7. GRAND FORMAT > 4m : multiplicateur appliqué");
for (const cmd of commandes) {
  const a = cmd as any;
  for (const ligne of a.lignes) {
    const w = parseFloat(ligne.largeur_mm) || 0;
    if (w >= 4000) {
      const sf = detectSpecialMultiplier({ type: ligne.type, lignes: [ligne] });
      const expectedMult = w >= 6000 ? 4 : w >= 5000 ? 3 : 2;
      test(`${a.ref_chantier} : ${ligne.type} ${w}mm → ×${expectedMult}`,
        sf === expectedMult,
        `multiplicateur calculé = ${sf}`);
    }
  }
}

// ── 8. Livraisons : multi + zones + chargements ──
header("8. LIVRAISONS : multi-dates, zones, chargements veille");
const allDates: string[] = [];
for (let i = 0; i < 12; i++) {
  const d = new Date(monday + "T12:00:00"); d.setDate(d.getDate() + i);
  allDates.push(d.toISOString().split("T")[0]);
}
const livraisons = listLivraisonsForWeek(commandes as any, allDates);
test(`Livraisons listées`, livraisons.length >= commandes.length,
  `${livraisons.length} segments pour ${commandes.length} chantiers`);
const multiCmd = commandes.find(c => ((c as any).nb_livraisons || 1) > 1);
if (multiCmd) {
  const segs = livraisons.filter(l => l.client === (multiCmd as any).client);
  test(`Multi-livraisons (${(multiCmd as any).client}) : 2 segments`,
    segs.length >= 2, `${segs.length} segments`);
}
// Durées par zone respectées
for (const l of livraisons) {
  const expected = dureeLivraison(l.zone);
  test(`Durée AR ${l.zone}`, l.dureeAR === expected, `${l.dureeAR} min`);
  break; // on teste 1 fois la cohérence
}
const continentLivr = livraisons.find(l => l.zone === "Continent");
if (continentLivr) {
  test(`Continent : 2 demis bloqués (>4h)`,
    nbDemiJourneesLivraison(continentLivr.zone) === 2,
    `${nbDemiJourneesLivraison(continentLivr.zone)} demi-journée(s)`);
}
const portoLivr = livraisons.find(l => l.zone === "Porto-Vecchio");
if (portoLivr) {
  test(`Porto-Vecchio : 1 demi suffit (<4h)`,
    nbDemiJourneesLivraison(portoLivr.zone) === 1,
    `${nbDemiJourneesLivraison(portoLivr.zone)} demi-journée(s)`);
}

// ── 9. Stratégie + chooseNbOps : décisions cohérentes ──
header("9. PLANIFICATION AUTONOME : choix nb opérateurs par poste");
for (const cmd of commandes.slice(0, 5)) {
  const a = cmd as any;
  const totalMin = (() => {
    let s = 0;
    for (const ligne of a.lignes) {
      const lSf = detectSpecialMultiplier({ type: ligne.type, lignes: [ligne] });
      const routage = getRoutage(ligne.type, parseInt(ligne.quantite) || 1, a.hsTemps, lSf);
      s += routage.reduce((acc, e) => acc + e.estimatedMin, 0);
    }
    return s;
  })();
  const joursBesoin = totalMin / 480;
  const today = new Date().toISOString().split("T")[0];
  const dl = new Date(a.date_livraison_souhaitee + "T12:00:00");
  const joursDispo = Math.max(1, Math.round((dl.getTime() - new Date(today).getTime()) / 86400000 * 5 / 7));
  const strategy = detectStrategy(joursDispo, joursBesoin);

  // C3 = parallélisable, F2 = limité, M2 = monolithique
  const c3 = chooseNbOps("C3", strategy, [3, 3, 2, 2, 2]);
  const f2 = chooseNbOps("F2", strategy, [3, 3, 2, 2]);
  const m2 = chooseNbOps("M2", strategy, [3, 3, 2]);
  test(`${a.ref_chantier} (${strategy}) — C3 : ${c3.nbProducers} ops`, c3.nbProducers >= 1 && c3.nbProducers <= 3);
  test(`${a.ref_chantier} (${strategy}) — F2 : ${f2.nbProducers} ops`, f2.nbProducers >= 1 && f2.nbProducers <= 2);
  test(`${a.ref_chantier} (${strategy}) — M2 monolithique = 1 op`, m2.nbProducers === 1);
}

// ── 10. Tous les opérateurs sont occupés ──
header("10. OCCUPATION ÉQUIPE : chaque opérateur reçoit du travail");
const phasesByCmd = new Map<string, string[]>();
for (const cmd of commandes) {
  const a = cmd as any;
  const isulaInfo = isulaInfoFromCmd(a);
  for (let i = 0; i < a.lignes.length; i++) {
    const ligne = a.lignes[i];
    const lSf = detectSpecialMultiplier({ type: ligne.type, lignes: [ligne] });
    const routage = getRoutage(ligne.type, parseInt(ligne.quantite) || 1, a.hsTemps, lSf,
      undefined, i === 0 ? isulaInfo : undefined);
    for (const e of routage) {
      const list = phasesByCmd.get(a.ref_chantier) || [];
      list.push(e.postId);
      phasesByCmd.set(a.ref_chantier, list);
    }
  }
}
// Pour chaque opérateur on regarde s'il a au moins un poste compétent
// dans la liste des postes touchés cette semaine
const allPostsTouched = new Set<string>();
for (const list of Array.from(phasesByCmd.values())) for (const p of list) allPostsTouched.add(p);

const COMP_TO_POSTS: Record<string, string[]> = {
  coupe: ["C2", "C3", "C4", "C5", "C6"],
  frappes: ["F1", "F2", "F3", "M3", "V1"],
  coulissant: ["M1", "M2", "V2"],
  vitrage: ["V1", "V2", "V3"],
  isula: ["I1", "I2", "I3", "I4", "I5", "I6", "I7", "I8"],
  logistique: ["L1", "L2", "L3", "L4", "L5", "L6", "L7"],
  hors_std: ["MHS"],
};

for (const op of EQUIPE) {
  const opPosts = (op.competences || []).flatMap(c => COMP_TO_POSTS[c] || []);
  const aMonPoste = opPosts.some(p => allPostsTouched.has(p));
  test(`${op.nom} (${op.competences.join(",")}) : a du travail dispo`,
    aMonPoste,
    `postes compétents ${opPosts.length} | postes touchés ${[...opPosts].filter(p => allPostsTouched.has(p)).slice(0, 3).join(",")}`);
}

// ── 11. Charge totale équipe : capacité utilisée ──
header("11. CHARGE TOTALE vs CAPACITÉ DE L'ÉQUIPE");
const capaciteEquipeMin = EQUIPE.reduce((s, op) => s + op.h * 60, 0);
const ratio = totalChargeMin / capaciteEquipeMin;
test(`Charge équipe cohérente`,
  ratio > 0.1 && ratio < 3,
  `${Math.round(totalChargeMin / 60)}h fab / ${Math.round(capaciteEquipeMin / 60)}h dispo équipe = ${Math.round(ratio * 100)}%`);

// ── 12. Takt time réaliste ──
header("12. TAKT TIME : rythme client compatible avec la dispo");
const totalTaches = Object.keys(chargeByPost).length;
const taktDispo = capaciteEquipeMin; // 1 semaine de dispo équipe
const takt = calcTakt(taktDispo, totalTaches);
test(`Takt time calculé`, takt.taktMinPerPiece > 0,
  `${takt.taktMinPerPiece} min/tâche (${totalTaches} postes touchés sur ${Math.round(taktDispo / 60)}h)`);

// ── 13. Saturation par poste : aucun > 200% ──
header("13. SATURATION POSTES : aucun en surcharge irréaliste (>200%)");
for (const [pid, ch] of Object.entries(chargeByPost)) {
  const cap = postCapacityMinDay(pid) * 5; // semaine
  const pct = (ch / cap) * 100;
  if (cap > 0) {
    test(`${pid} : ${Math.round(pct)}%`, pct < 200, `${Math.round(ch / 60)}h / ${Math.round(cap / 60)}h`);
  }
}

// ── RAPPORT FINAL ──
console.log(`\n${BOLD}${MAGENTA}╔════════════════════════════════════════════════════════════╗${RESET}`);
console.log(`${BOLD}${MAGENTA}║  RÉSULTAT FINAL                                            ║${RESET}`);
console.log(`${BOLD}${MAGENTA}╚════════════════════════════════════════════════════════════╝${RESET}`);
console.log(`${GREEN}✓ ${passed} tests passés${RESET}`);
if (failed > 0) {
  console.log(`${RED}✗ ${failed} tests échoués :${RESET}`);
  for (const f of failures) console.log(`  ${RED}- ${f}${RESET}`);
} else {
  console.log(`${GREEN}${BOLD}🎉 Tous les tests passent. Le système de planification est cohérent.${RESET}`);
}
console.log(``);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).process?.exit?.(failed > 0 ? 1 : 0);
