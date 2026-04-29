// ═══════════════════════════════════════════════════════════════════════
// HEIJUNKA — Lissage du mix Frappes / Coulissants&Galandages.
//
// Référence : Toyota Production System — éviter d'enchainer 5 jours de
// frappes puis 5 jours de coulissants (à-coups, fatigue, surchargé/vide
// alterné). Préférer un mix régulier qui suit la demande client.
//
// Pour SIAL : le toggle "mode du jour" (Frappes ↔ Coulissants) doit
// idéalement alterner intelligemment selon la charge à venir.
// ═══════════════════════════════════════════════════════════════════════

import { TYPES_MENUISERIE, type CommandeCC } from "@/lib/sial-data";

export type ModeJour = "FRAPPES" | "COULISSANTS";

export interface ChantierWorkload {
  cmdId: string;
  refChantier: string;
  modePref: ModeJour;       // selon le type principal
  minutesMontage: number;   // charge montage estimée
  deadline: string;         // YYYY-MM-DD
}

/**
 * Pour une commande, déduit le mode "préférentiel" :
 *   frappes / portes → FRAPPES
 *   coulissants / galandages → COULISSANTS
 *   hors_standard / intervention → mode majoritaire des autres lignes
 */
export function modePrefForCmd(cmd: CommandeCC): ModeJour | null {
  const a = cmd as any;
  const lignes = Array.isArray(a.lignes) && a.lignes.length > 0 ? a.lignes : [{ type: cmd.type, quantite: cmd.quantite }];
  let frappes = 0, coul = 0;
  for (const l of lignes) {
    const tm = TYPES_MENUISERIE[l.type || cmd.type];
    if (!tm) continue;
    const qte = parseInt(l.quantite) || 1;
    if (tm.famille === "frappe" || tm.famille === "porte") frappes += qte;
    else if (tm.famille === "coulissant" || tm.famille === "glandage") coul += qte;
  }
  if (frappes === 0 && coul === 0) return null;
  return frappes >= coul ? "FRAPPES" : "COULISSANTS";
}

/**
 * Suggestion de mode jour pour les 5 jours ouvrés à venir.
 * Algorithme :
 *  1. Calculer la charge totale FRAPPES vs COULISSANTS sur la semaine.
 *  2. Répartir les jours en proportion.
 *  3. Alterner pour lisser (éviter 3 jours frappes consécutifs si possible).
 *  4. Privilégier les chantiers urgents (deadline proche) en début de semaine.
 *
 * Retourne 5 ModeJour (lun..ven).
 */
export interface HeijunkaSuggestion {
  modesByDay: ModeJour[];                // 5 valeurs
  chargeFrappes: number;                 // minutes totales
  chargeCoul: number;                    // minutes totales
  joursFrappes: number;                  // suggérés
  joursCoul: number;                     // suggérés
  raison: string;                        // explication courte
}

export function suggestModeJourSemaine(
  commandes: CommandeCC[],
  monday: string,
): HeijunkaSuggestion {
  // Filtrer les commandes actives dont la semaine_montage = monday
  const cmdsActives: ChantierWorkload[] = [];
  for (const cmd of commandes) {
    const a = cmd as any;
    if (a.statut === "livre" || a.statut === "annulee" || a.statut === "terminee") continue;
    const sem = a.semaine_montage || a.semaine_coupe;
    if (sem !== monday) continue;
    const mode = modePrefForCmd(cmd);
    if (!mode) continue;

    // Estimation grossière des minutes montage : 60 × quantité (calibrable)
    const minutesMontage = (cmd.quantite || 1) * 60;
    cmdsActives.push({
      cmdId: String(cmd.id || ""),
      refChantier: a.ref_chantier || a.client || "",
      modePref: mode,
      minutesMontage,
      deadline: a.date_livraison_souhaitee || "9999-12-31",
    });
  }

  const chargeFrappes = cmdsActives.filter(c => c.modePref === "FRAPPES").reduce((s, c) => s + c.minutesMontage, 0);
  const chargeCoul    = cmdsActives.filter(c => c.modePref === "COULISSANTS").reduce((s, c) => s + c.minutesMontage, 0);
  const total = chargeFrappes + chargeCoul;

  // Si rien à planifier, fallback FRAPPES par défaut
  if (total === 0) {
    return {
      modesByDay: ["FRAPPES", "FRAPPES", "FRAPPES", "FRAPPES", "FRAPPES"],
      chargeFrappes: 0, chargeCoul: 0, joursFrappes: 5, joursCoul: 0,
      raison: "Aucune charge planifiée cette semaine — mode par défaut FRAPPES.",
    };
  }

  // Répartir 5 jours en proportion de la charge
  const ratioFrappes = chargeFrappes / total;
  const joursFrappesIdeal = ratioFrappes * 5;
  const joursFrappes = Math.round(joursFrappesIdeal);
  const joursCoul = 5 - joursFrappes;

  // Construire la séquence en alternant pour lissage (heijunka)
  // Si 3 jours frappes / 2 jours coul → F C F C F (alternance max)
  // Si 4 jours frappes / 1 jour coul → F F C F F (coul au milieu)
  const modesByDay = buildAlternatingSequence(joursFrappes, joursCoul);

  // Bonus : si une deadline urgente <= jeudi force un mode dès lundi,
  // on permute le 1er jour pour matcher le mode du chantier le plus urgent.
  const cmdsAvecDeadline = cmdsActives
    .filter(c => c.deadline !== "9999-12-31")
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  if (cmdsAvecDeadline.length > 0) {
    const urgent = cmdsAvecDeadline[0];
    if (modesByDay[0] !== urgent.modePref) {
      // Permuter le 1er jour avec le 1er jour qui matche
      const swapIdx = modesByDay.findIndex(m => m === urgent.modePref);
      if (swapIdx > 0) {
        [modesByDay[0], modesByDay[swapIdx]] = [modesByDay[swapIdx], modesByDay[0]];
      }
    }
  }

  const raison = `Charge montage : ${Math.round(chargeFrappes / 60)}h frappes / ${Math.round(chargeCoul / 60)}h coulissants → ${joursFrappes}j frappes + ${joursCoul}j coulissants en alternance.`;

  return { modesByDay, chargeFrappes, chargeCoul, joursFrappes, joursCoul, raison };
}

/**
 * Construit une séquence de 5 jours alternant FRAPPES/COULISSANTS de façon
 * la plus régulière possible étant donné le nombre de chaque type.
 * Inspiré du Bresenham line algorithm pour répartir N éléments sur 5 cases.
 */
function buildAlternatingSequence(nF: number, nC: number): ModeJour[] {
  const result: ModeJour[] = [];
  let countF = 0, countC = 0;
  for (let i = 0; i < 5; i++) {
    const remaining = 5 - i;
    const remF = nF - countF;
    const remC = nC - countC;
    if (remF === 0) { result.push("COULISSANTS"); countC++; continue; }
    if (remC === 0) { result.push("FRAPPES"); countF++; continue; }
    // Choisir le mode dominant restant pour rester équilibré
    if (remF / remaining >= 0.5) {
      // mais alterner si on a fait le même 2 fois de suite
      const lastTwo = result.slice(-2);
      if (lastTwo.length === 2 && lastTwo.every(m => m === "FRAPPES") && remC > 0) {
        result.push("COULISSANTS"); countC++;
      } else {
        result.push("FRAPPES"); countF++;
      }
    } else {
      const lastTwo = result.slice(-2);
      if (lastTwo.length === 2 && lastTwo.every(m => m === "COULISSANTS") && remF > 0) {
        result.push("FRAPPES"); countF++;
      } else {
        result.push("COULISSANTS"); countC++;
      }
    }
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════
// SETUP TIME — temps de changement de série (SMED)
// Référence : SMED Toyota — chaque changement coloris/matière/type coûte
// un temps de setup (nettoyage machine, changement outils). Regrouper les
// chantiers de même coloris réduit ce temps perdu.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Estime le temps de setup (en minutes) pour passer du chantier A au chantier B
 * sur le même poste de coupe ou de soudure.
 *
 * Règles empiriques (à calibrer avec le terrain) :
 *  - Même coloris ET même matière (ALU/PVC) : 0 min
 *  - Coloris différent, même matière : 5 min (changement outil)
 *  - Matière différente : 15 min (nettoyage machine + changement outil)
 *  - Type très différent (frappe → coulissant grand format) : 30 min
 */
export function estimateSetupTime(
  prev: { type?: string; coloris?: string; mat?: string },
  next: { type?: string; coloris?: string; mat?: string },
): number {
  if (!prev.type) return 0;
  const sameColoris = (prev.coloris || "").toLowerCase().trim() === (next.coloris || "").toLowerCase().trim();
  const matA = (prev.mat || matFromType(prev.type) || "").toUpperCase();
  const matB = (next.mat || matFromType(next.type || "") || "").toUpperCase();
  const sameMat = matA === matB;

  if (sameColoris && sameMat) return 0;
  if (sameMat && !sameColoris) return 5;
  if (!sameMat) return 15;
  return 0;
}

function matFromType(typeId: string): string | null {
  const tm = TYPES_MENUISERIE[typeId];
  return tm?.mat ?? null;
}

/**
 * Calcule le temps total de setup pour une séquence de chantiers donnée.
 * Utile pour comparer 2 séquencements et choisir celui qui minimise les setups.
 */
export function totalSetupTime(
  sequence: Array<{ type?: string; coloris?: string; mat?: string }>,
): number {
  let total = 0;
  for (let i = 1; i < sequence.length; i++) {
    total += estimateSetupTime(sequence[i - 1], sequence[i]);
  }
  return total;
}

/**
 * Réordonne une liste de chantiers pour minimiser les changements de série.
 * Algorithme glouton : à chaque étape, choisit le suivant qui a le setup le plus
 * faible avec le précédent. Pas optimal global mais bon en pratique.
 */
export function optimizeSequenceForSetup<T extends { type?: string; coloris?: string; mat?: string }>(
  cmds: T[],
): T[] {
  if (cmds.length <= 1) return [...cmds];
  const remaining = [...cmds];
  const result: T[] = [];
  // Premier chantier : on prend celui qui a le moins de "voisins coûteux"
  result.push(remaining.shift()!);
  while (remaining.length > 0) {
    const last = result[result.length - 1];
    let bestIdx = 0;
    let bestSetup = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const setup = estimateSetupTime(last, remaining[i]);
      if (setup < bestSetup) {
        bestSetup = setup;
        bestIdx = i;
      }
    }
    result.push(remaining.splice(bestIdx, 1)[0]);
  }
  return result;
}
