"use client";
import { useState, useMemo, useCallback } from "react";
import { C, TYPES_MENUISERIE, EQUIPE, hm, CommandeCC, calcCheminCritique, fmtDate } from "@/lib/sial-data";
import { getRoutage } from "@/lib/routage-production";

// ── Helpers ──────────────────────────────────────────────────────────────────

function localStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}
function weekId(mondayStr: string): string {
  const d = new Date(mondayStr + "T00:00:00");
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const w1 = new Date(jan4);
  w1.setDate(jan4.getDate() - ((jan4.getDay() || 7) - 1));
  const wn = Math.ceil((d.getTime() - w1.getTime()) / (7 * 86400000)) + 1;
  return `S${String(wn).padStart(2, "0")}`;
}

function getWeekOptions(): Array<{ value: string; label: string }> {
  const opts: Array<{ value: string; label: string }> = [];
  const mon = getMonday(new Date());
  for (let i = -2; i < 14; i++) {
    const d = new Date(mon);
    d.setDate(d.getDate() + i * 7);
    const ms = localStr(d);
    const ven = new Date(d); ven.setDate(d.getDate() + 4);
    const wk = weekId(ms);
    const label = `${wk} (${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} → ${ven.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })})`;
    opts.push({ value: ms, label });
  }
  return opts;
}

// ── Configuration des phases ─────────────────────────────────────────────────
const PHASE_CONFIG = [
  { id: "coupe",      label: "Coupe",      color: "#42A5F5", field: "semaine_coupe",      competence: "coupe" },
  { id: "montage",    label: "Montage",    color: "#FFA726", field: "semaine_montage",    competence: "frappes" },
  { id: "vitrage",    label: "Vitrage",    color: "#26C6DA", field: "semaine_vitrage",    competence: "vitrage" },
  { id: "logistique", label: "Logistique", color: "#CE93D8", field: "semaine_logistique", competence: "logistique" },
];

// ── Capacité réelle par phase (basée sur les opérateurs) ─────────────────────
// Pour chaque phase, on calcule les heures/semaine réelles des opérateurs compétents

interface OpCapacity {
  nom: string;
  hSemaine: number; // heures par semaine
  competences: string[];
}

const OP_CAPACITIES: OpCapacity[] = EQUIPE.map(op => ({
  nom: op.nom,
  hSemaine: op.h,
  competences: op.competences,
}));

// Calcule la capacité réelle en minutes pour une phase sur une semaine
// Un opérateur partage son temps entre les phases où il est compétent
function getPhaseCapacity(phaseCompetence: string): { totalMin: number; operators: Array<{ nom: string; minDispo: number }> } {
  const operators: Array<{ nom: string; minDispo: number }> = [];

  for (const op of OP_CAPACITIES) {
    if (!op.competences.includes(phaseCompetence)) continue;

    // Combien de phases différentes cet opérateur couvre ?
    // Il partage son temps entre elles
    const nbPhasesCouvertes = PHASE_CONFIG.filter(ph =>
      op.competences.includes(ph.competence)
    ).length;

    // Sa dispo pour cette phase = ses heures / nombre de phases couvertes
    const minDispo = Math.round(op.hSemaine * 60 / Math.max(nbPhasesCouvertes, 1));
    operators.push({ nom: op.nom, minDispo });
  }

  return {
    totalMin: operators.reduce((s, o) => s + o.minDispo, 0),
    operators,
  };
}

function getOperatorsForPhase(phase: string, famille?: string): string[] {
  const competence = phase === "montage"
    ? (famille === "coulissant" || famille === "glandage" ? "coulissant" : "frappes")
    : PHASE_CONFIG.find(p => p.id === phase)?.competence || phase;
  return OP_CAPACITIES.filter(op => op.competences.includes(competence)).map(op => op.nom);
}

// ── Données batch import semaines livraison ──────────────────────────────────
const BATCH_DATA = [
{"client":"U QUERCIU","ref_chantier":"BAT F","type_commande":"chantier_pro","semaine_livraison":"S14 2026"},
{"client":"BAMPA","ref_chantier":"DEMEURES CORSES","type_commande":"chantier_direct","semaine_livraison":"S16 2026"},
{"client":"ALPI","ref_chantier":"OF à refaire","type_commande":"sav","semaine_livraison":"S16 2026"},
{"client":"DI LEGNU","ref_chantier":"Filippi 4","type_commande":"chantier_pro","semaine_livraison":"S13 2026"},
{"client":"Demeures Corses","ref_chantier":"OPA INVEST PORTE","type_commande":"chantier_pro","semaine_livraison":"S14 2026"},
{"client":"VISAJE ECO HABITAT","ref_chantier":"BUREAU","type_commande":"chantier_pro","semaine_livraison":"S14 2026"},
{"client":"MAURIZI","ref_chantier":"Alistro","type_commande":"chantier_direct","semaine_livraison":"S14 2026"},
{"client":"RANCH","ref_chantier":"NI","type_commande":"chantier_pro","semaine_livraison":"S16 2026"},
{"client":"MENCO","ref_chantier":"CAMPO LONGO LOT 112","type_commande":"chantier_pro","semaine_livraison":"S16 2026"},
{"client":"MENCO","ref_chantier":"CAMPO LONGO LOT 113","type_commande":"chantier_pro","semaine_livraison":"S16 2026"},
{"client":"Delta Alu","ref_chantier":"POLI JL 2","type_commande":"diffus","semaine_livraison":"S16 2026"},
{"client":"EGMF","ref_chantier":"SUPERETTE","type_commande":"chantier_pro","semaine_livraison":"S15 2026"},
{"client":"Marcia Diffusion","ref_chantier":"Marinella Porte","type_commande":"chantier_pro","semaine_livraison":"S16 2026"},
{"client":"Demeures Corses","ref_chantier":"OPA INVEST OUVRANTS","type_commande":"chantier_pro","semaine_livraison":"S16 2026"},
{"client":"RANCH","ref_chantier":"PATURLE","type_commande":"chantier_pro","semaine_livraison":"S16 2026"},
{"client":"RANCH","ref_chantier":"BIONDUCCI","type_commande":"chantier_pro","semaine_livraison":"S16 2026"},
{"client":"RANCH","ref_chantier":"FILISA","type_commande":"sav","semaine_livraison":"S16 2026"},
{"client":"CECCALDI","ref_chantier":"Garde Corps Partie 2","type_commande":"chantier_direct","semaine_livraison":"S17 2026"},
{"client":"DI LEGNU","ref_chantier":"Filippi 4 vitrage","type_commande":"sav","semaine_livraison":"S17 2026"},
{"client":"U QUERCIU","ref_chantier":"BAT C","type_commande":"chantier_pro","semaine_livraison":"S17 2026"},
{"client":"RANCH","ref_chantier":"TCHEUREKDJIAN","type_commande":"chantier_pro","semaine_livraison":"S17 2026"},
{"client":"RANCH","ref_chantier":"E&J","type_commande":"chantier_pro","semaine_livraison":"S17 2026"},
{"client":"CELIA","ref_chantier":"AZARA","type_commande":"chantier_pro","semaine_livraison":"S17 2026"},
{"client":"JPC","ref_chantier":"ANTONIA 2","type_commande":"chantier_pro","semaine_livraison":"S18 2026"},
{"client":"GEDIMAT CASTELLI","ref_chantier":"MRB MILANINI","type_commande":"chantier_pro","semaine_livraison":"S16 2026"},
{"client":"MATIBAT","ref_chantier":"GASNAULT","type_commande":"chantier_pro","semaine_livraison":"S17 2026"},
{"client":"Probat","ref_chantier":"Marifani","type_commande":"sav","semaine_livraison":"S17 2026"},
{"client":"RANCH","ref_chantier":"CASITA BIANCA","type_commande":"chantier_pro","semaine_livraison":"S17 2026"},
{"client":"EGMF","ref_chantier":"GUIBERT","type_commande":"chantier_pro","semaine_livraison":"S18 2026"},
{"client":"SAMMARCELLI","ref_chantier":"SUP","type_commande":"chantier_pro","semaine_livraison":"S18 2026"},
{"client":"Ranch","ref_chantier":"LUCCHINI","type_commande":"chantier_pro","semaine_livraison":"S18 2026"},
{"client":"RANCH","ref_chantier":"KH MARINA","type_commande":"chantier_pro","semaine_livraison":"S18 2026"},
{"client":"RINUVA","ref_chantier":"ALLASIO","type_commande":"chantier_pro","semaine_livraison":"S18 2026"},
{"client":"U QUERCIU","ref_chantier":"Bat B","type_commande":"chantier_pro","semaine_livraison":"S19 2026"},
{"client":"VAN HULLEBUSCH","ref_chantier":"VAN HULLEBUSCH","type_commande":"chantier_direct","semaine_livraison":"S19 2026"},
{"client":"U QUERCIU","ref_chantier":"BAT D","type_commande":"chantier_pro","semaine_livraison":"S19 2026"},
{"client":"MENCO","ref_chantier":"CAMPO LONGO 3","type_commande":"chantier_pro","semaine_livraison":"S20 2026"},
{"client":"JPC","ref_chantier":"POMPES FUNEBRE","type_commande":"sav","semaine_livraison":"S19 2026"},
{"client":"EGMF","ref_chantier":"MAMA SCI","type_commande":"chantier_pro","semaine_livraison":"S20 2026"},
{"client":"VOLPE","ref_chantier":"BEAUCE PARC","type_commande":"chantier_direct","semaine_livraison":"S20 2026"},
{"client":"RANCH","ref_chantier":"GAMBARELLI","type_commande":"chantier_pro","semaine_livraison":"S20 2026"},
{"client":"BERNARDINI","ref_chantier":"VOLET","type_commande":"chantier_pro","semaine_livraison":"S20 2026"},
{"client":"Balagne","ref_chantier":"SA CONSTRUCTION","type_commande":"chantier_pro","semaine_livraison":"S21 2026"},
{"client":"MENCO","ref_chantier":"CAMPO LONGO 4","type_commande":"chantier_pro","semaine_livraison":"S21 2026"},
{"client":"PASQUALINI Fille","ref_chantier":"Paumelle","type_commande":"sav","semaine_livraison":"S18 2026"},
{"client":"ALPHA POSE","ref_chantier":"SASSI","type_commande":"chantier_pro","semaine_livraison":"S22 2026"},
{"client":"GERONIMI","ref_chantier":"VOLETS","type_commande":"chantier_direct","semaine_livraison":"S22 2026"},
{"client":"NEPITA","ref_chantier":"PORTE BAT A","type_commande":"chantier_direct","semaine_livraison":"S22 2026"},
{"client":"BAMPA","ref_chantier":"GARDE CORPS INT","type_commande":"chantier_pro","semaine_livraison":"S22 2026"},
{"client":"BAMPA","ref_chantier":"GARDE CORPS EXT","type_commande":"chantier_pro","semaine_livraison":"S22 2026"},
{"client":"MATIBAT","ref_chantier":"GUERIN","type_commande":"chantier_pro","semaine_livraison":"S22 2026"},
{"client":"MENCO","ref_chantier":"TAMBINI","type_commande":"chantier_pro","semaine_livraison":"S22 2026"},
{"client":"REBANI","ref_chantier":"PERSO","type_commande":"chantier_pro","semaine_livraison":"S22 2026"},
{"client":"REBANI","ref_chantier":"ACHILLI","type_commande":"chantier_pro","semaine_livraison":"S22 2026"},
{"client":"REBANI","ref_chantier":"HOUARI","type_commande":"chantier_pro","semaine_livraison":"S22 2026"},
{"client":"EGMF","ref_chantier":"LOGIS CORSE AJACCIO APPARTEMENT","type_commande":"chantier_pro","semaine_livraison":"S29 2026"},
{"client":"PASQUALINI","ref_chantier":"FILLE","type_commande":"chantier_direct","semaine_livraison":"S07 2026"},
{"client":"PROBAT","ref_chantier":"ROCCA D'ISTRIA","type_commande":"sav","semaine_livraison":"S13 2026"},
{"client":"CECCALDI","ref_chantier":"GC PARTIE 3","type_commande":"chantier_direct","semaine_livraison":"S22 2026"},
{"client":"SAMMARCELLI","ref_chantier":"Garde Corps Partie 2","type_commande":"chantier_direct","semaine_livraison":"S22 2026"},
{"client":"MENCO","ref_chantier":"CAMPO LONGO 5","type_commande":"chantier_pro","semaine_livraison":"S22 2026"},
{"client":"CAS'APERTURA","ref_chantier":"MERCIER PINEA","type_commande":"chantier_pro","semaine_livraison":"S23 2026"},
{"client":"MENCO","ref_chantier":"CAMPO LONGO 6","type_commande":"chantier_pro","semaine_livraison":"S23 2026"},
{"client":"U QUERCIU","ref_chantier":"BAT E","type_commande":"chantier_pro","semaine_livraison":"S26 2026"},
{"client":"MENCO","ref_chantier":"CAMPO LONGO 7","type_commande":"chantier_pro","semaine_livraison":"S24 2026"},
{"client":"EGMF","ref_chantier":"LOGIS CORSE AJACCIO 1","type_commande":"chantier_pro","semaine_livraison":"S27 2026"},
{"client":"EGMF","ref_chantier":"LOGIS CORSE AJACCIO 2","type_commande":"chantier_pro","semaine_livraison":"S27 2026"},
{"client":"EGMF","ref_chantier":"LOGIS CORSE AJACCIO 3","type_commande":"chantier_pro","semaine_livraison":"S34 2026"},
{"client":"EGMF","ref_chantier":"LOGIS CORSE AJACCIO 4","type_commande":"chantier_pro","semaine_livraison":"S34 2026"},
{"client":"EGMF","ref_chantier":"LOGIS CORSE AJACCIO 5","type_commande":"chantier_pro","semaine_livraison":"S21 2026"},
{"client":"EGMF","ref_chantier":"LOGIS CORSE AJACCIO 6","type_commande":"chantier_pro","semaine_livraison":"S21 2026"},
{"client":"EGMF","ref_chantier":"LOGIS CORSE AJACCIO 7","type_commande":"chantier_pro","semaine_livraison":"S22 2026"},
{"client":"EGMF","ref_chantier":"LOGIS CORSE AJACCIO 8","type_commande":"chantier_pro","semaine_livraison":"S22 2026"},
{"client":"EGMF","ref_chantier":"LOGIS CORSE AJACCIO 9","type_commande":"chantier_pro","semaine_livraison":"S23 2026"},
{"client":"EGMF","ref_chantier":"LOGIS CORSE AJACCIO 10","type_commande":"chantier_pro","semaine_livraison":"S23 2026"},
{"client":"MOZZICONACCI","ref_chantier":"Partie 2","type_commande":"chantier_direct","semaine_livraison":"S10 2026"},
{"client":"SAMMARCELLI","ref_chantier":"Garde Corps Partie 1","type_commande":"chantier_direct","semaine_livraison":"S20 2026"},
{"client":"FRANGINI","ref_chantier":"VITRAGE","type_commande":"diffus","semaine_livraison":"S10 2026"},
{"client":"PETRONI","ref_chantier":"FIDUCIAIRE","type_commande":"sav","semaine_livraison":"S12 2026"},
{"client":"SCI DELIA HALLER","ref_chantier":"FACE AVANT","type_commande":"sav","semaine_livraison":"S12 2026"},
{"client":"NEPITA","ref_chantier":"GAUDICHEAU","type_commande":"sav","semaine_livraison":"S13 2026"},
{"client":"NEPITA","ref_chantier":"MORLAIX","type_commande":"sav","semaine_livraison":"S13 2026"},
{"client":"DEMEURES CORSES","ref_chantier":"PROFILES CLOQUES","type_commande":"sav","semaine_livraison":"S14 2026"},
{"client":"MIROITERIE ORSONI","ref_chantier":"ROULETTE","type_commande":"diffus","semaine_livraison":"S15 2026"},
{"client":"U VIAGHJU","ref_chantier":"CUVETTES","type_commande":"sav","semaine_livraison":"S15 2026"},
{"client":"FLORI BALBINOT","ref_chantier":"REGLAGES","type_commande":"sav","semaine_livraison":"S15 2026"},
{"client":"PIETRI","ref_chantier":"VITRAGE A CHG","type_commande":"sav","semaine_livraison":"S15 2026"},
{"client":"GEDIMAT CASTELLI","ref_chantier":"MTC GIUDICELLI","type_commande":"diffus","semaine_livraison":"S15 2026"},
{"client":"Alpha Pose","ref_chantier":"COPPOLANI","type_commande":"sav","semaine_livraison":"S16 2026"},
{"client":"BRAGHIERI","ref_chantier":"RAIL","type_commande":"diffus","semaine_livraison":"S16 2026"},
{"client":"PASQUALINI Fille","ref_chantier":"VOLETS","type_commande":"sav","semaine_livraison":"S16 2026"},
{"client":"BONIFACI","ref_chantier":"PORTE EAU","type_commande":"sav","semaine_livraison":"S16 2026"},
{"client":"RANCH","ref_chantier":"VERSUS STOCK","type_commande":"diffus","semaine_livraison":"S16 2026"},
{"client":"CANIONI","ref_chantier":"SPIGA","type_commande":"sav","semaine_livraison":"S18 2026"},
{"client":"LAURENT PAPAZIAN","ref_chantier":"VR MONOBLOC","type_commande":"chantier_pro","semaine_livraison":"S17 2026"},
{"client":"ALUTEC","ref_chantier":"SERRURE","type_commande":"diffus","semaine_livraison":"S17 2026"},
{"client":"RANCH","ref_chantier":"GAUTHEROT","type_commande":"diffus","semaine_livraison":"S17 2026"},
{"client":"CGL RESIDENCE","ref_chantier":"ACCESSOIRE","type_commande":"diffus","semaine_livraison":"S17 2026"},
{"client":"ALPHA POSE","ref_chantier":"FALLONE","type_commande":"chantier_pro","semaine_livraison":"S18 2026"},
{"client":"GRIMALDI","ref_chantier":"BAIE VITREE","type_commande":"sav","semaine_livraison":"S20 2026"},
{"client":"ORLIAC","ref_chantier":"INFILTRATION","type_commande":"sav","semaine_livraison":"S21 2026"},
];

// ── Composant principal ──────────────────────────────────────────────────────

export default function PlanningCharge({ commandes, onPatch }: {
  commandes: CommandeCC[];
  onPatch: (id: string, updates: Record<string, unknown>) => void;
}) {
  const [viewWeek, setViewWeek] = useState<string>(() => localStr(getMonday(new Date())));
  const weekOptions = useMemo(() => getWeekOptions(), []);
  const currentWeekId = weekId(viewWeek);

  // Capacité par phase (calculée une fois)
  const phaseCapacities = useMemo(() => {
    const caps: Record<string, { totalMin: number; operators: Array<{ nom: string; minDispo: number }> }> = {};
    for (const ph of PHASE_CONFIG) {
      caps[ph.id] = getPhaseCapacity(ph.competence);
    }
    return caps;
  }, []);

  // Commandes actives avec routage
  const cmdList = useMemo(() => {
    return commandes
      .filter(cmd => {
        const s = (cmd as any).statut;
        return s !== "livre" && s !== "terminee" && s !== "annulee" && cmd.type && cmd.type !== "intervention_chantier";
      })
      .map(cmd => {
        const routage = getRoutage(cmd.type, cmd.quantite, (cmd as any).hsTemps as Record<string, unknown> | null);
        const totalMin = routage.reduce((s, e) => s + e.estimatedMin, 0);
        const cc = calcCheminCritique(cmd);
        const tm = (TYPES_MENUISERIE as Record<string, any>)[cmd.type];
        const parPhase: Record<string, { min: number; postIds: string[] }> = {};
        for (const e of routage) {
          if (!parPhase[e.phase]) parPhase[e.phase] = { min: 0, postIds: [] };
          parPhase[e.phase].min += e.estimatedMin;
          if (!parPhase[e.phase].postIds.includes(e.postId)) parPhase[e.phase].postIds.push(e.postId);
        }
        return { cmd, routage, totalMin, parPhase, cc, tm, famille: tm?.famille || "" };
      })
      .sort((a, b) => {
        const da = (a.cmd as any).date_livraison_souhaitee || "9999";
        const db = (b.cmd as any).date_livraison_souhaitee || "9999";
        return da.localeCompare(db);
      });
  }, [commandes]);

  // Charge planifiée cette semaine par phase
  const weekLoad = useMemo(() => {
    const load: Record<string, { totalMin: number; count: number; cmds: string[] }> = {};
    for (const ph of PHASE_CONFIG) load[ph.id] = { totalMin: 0, count: 0, cmds: [] };
    for (const c of cmdList) {
      for (const ph of PHASE_CONFIG) {
        const sw = (c.cmd as any)[ph.field];
        if (sw === viewWeek && c.parPhase[ph.id]) {
          load[ph.id].totalMin += c.parPhase[ph.id].min;
          load[ph.id].count++;
          load[ph.id].cmds.push((c.cmd as any).client);
        }
      }
    }
    return load;
  }, [cmdList, viewWeek]);

  const handleWeekChange = useCallback((cmdId: string, field: string, value: string) => {
    onPatch(cmdId, { [field]: value || null });
  }, [onPatch]);

  const [showUnplanned, setShowUnplanned] = useState(false);

  // Séparer : planifiées cette semaine vs non planifiées
  const thisWeekCmds = useMemo(() =>
    cmdList.filter(c => PHASE_CONFIG.some(ph => (c.cmd as any)[ph.field] === viewWeek)),
    [cmdList, viewWeek]
  );
  const unplannedCmds = useMemo(() =>
    cmdList.filter(c => !PHASE_CONFIG.some(ph => (c.cmd as any)[ph.field])),
    [cmdList]
  );

  // ── Import batch des semaines de livraison ──
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const runBatchImport = async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch("/api/planning/batch-weeks?secret=batch2026sial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: BATCH_DATA }),
      });
      const data = await res.json();
      setImportResult(`${data.ok} mises à jour, ${data.fail} non trouvées sur ${data.total}`);
      // Recharger la page pour voir les changements
      window.location.reload();
    } catch {
      setImportResult("Erreur lors de l'import");
    }
    setImporting(false);
  };

  const prevWeek = () => { const d = new Date(viewWeek + "T00:00:00"); d.setDate(d.getDate() - 7); setViewWeek(localStr(d)); };
  const nextWeek = () => { const d = new Date(viewWeek + "T00:00:00"); d.setDate(d.getDate() + 7); setViewWeek(localStr(d)); };

  // Fonction de rendu d'une ligne de commande
  const renderCmdRow = (item: typeof cmdList[0]) => {
    const { cmd, parPhase, cc, tm, famille } = item;
    const borderColor = cc?.critique ? C.red : cc?.enRetard ? C.orange : C.green;
    const cmdAny = cmd as any;
    return (
      <tr key={String(cmd.id)} style={{ borderBottom: `1px solid ${C.border}` }}>
        <td style={{ padding: "6px 8px", borderLeft: `3px solid ${borderColor}`, background: C.s1, border: `1px solid ${C.border}` }}>
          <div style={{ fontWeight: 700, fontSize: 12 }}>{cmdAny.client}</div>
          <div style={{ fontSize: 10, color: C.sec }}>{cmdAny.ref_chantier} · {cmd.quantite}× {tm?.label || cmd.type}</div>
          {cc?.critique && <span style={{ fontSize: 9, color: C.red, fontWeight: 700 }}>CRITIQUE </span>}
          {cc?.enRetard && !cc?.critique && <span style={{ fontSize: 9, color: C.orange, fontWeight: 700 }}>RETARD </span>}
        </td>
        <td style={{ textAlign: "center", border: `1px solid ${C.border}`, fontSize: 9, color: borderColor }}>
          {cmdAny.date_livraison_souhaitee ? fmtDate(cmdAny.date_livraison_souhaitee) : "—"}
        </td>
        {PHASE_CONFIG.map(ph => {
          const phData = parPhase[ph.id];
          if (!phData || phData.min === 0) {
            return <td key={ph.id} style={{ textAlign: "center", border: `1px solid ${C.border}`, color: C.muted }}>—</td>;
          }
          const currentVal = cmdAny[ph.field] || "";
          const isThisWeek = currentVal === viewWeek;
          const operators = getOperatorsForPhase(ph.id, famille);
          return (
            <td key={ph.id} style={{ padding: "4px 6px", border: `1px solid ${C.border}`, background: isThisWeek ? ph.color + "10" : undefined, verticalAlign: "top" }}>
              <select
                value={currentVal}
                onChange={e => handleWeekChange(String(cmd.id), ph.field, e.target.value)}
                style={{
                  width: "100%", padding: "3px 4px", fontSize: 10,
                  background: currentVal ? (isThisWeek ? ph.color + "22" : C.s2) : C.bg,
                  border: `1px solid ${currentVal ? (isThisWeek ? ph.color : C.border) : C.muted}`,
                  borderRadius: 3, color: currentVal ? C.text : C.muted, cursor: "pointer",
                }}
              >
                <option value="">— choisir —</option>
                {weekOptions.map(w => (
                  <option key={w.value} value={w.value}>{w.label}</option>
                ))}
              </select>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3 }}>
                <span className="mono" style={{ fontSize: 10, color: ph.color, fontWeight: 700 }}>{hm(phData.min)}</span>
                <span style={{ fontSize: 8, color: C.muted }}>{phData.postIds.join(" ")}</span>
              </div>
              <div style={{ fontSize: 9, color: C.sec, marginTop: 1 }}>{operators.join(", ")}</div>
            </td>
          );
        })}
      </tr>
    );
  };

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <button onClick={prevWeek} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, padding: "6px 12px", cursor: "pointer", fontSize: 14 }}>←</button>
        <button onClick={() => setViewWeek(localStr(getMonday(new Date())))} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.sec, padding: "6px 10px", cursor: "pointer", fontSize: 11 }}>Auj.</button>
        <button onClick={nextWeek} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, padding: "6px 12px", cursor: "pointer", fontSize: 14 }}>→</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Planning {currentWeekId}</div>
        </div>
        {/* Bouton import batch (une seule fois) */}
        {unplannedCmds.length > 10 && (
          <button
            onClick={runBatchImport}
            disabled={importing}
            style={{ padding: "6px 14px", background: C.orange, border: "none", borderRadius: 4, color: "#000", fontWeight: 700, fontSize: 11, cursor: importing ? "wait" : "pointer" }}
          >
            {importing ? "Import en cours..." : "Importer les semaines de livraison"}
          </button>
        )}
        {importResult && <span style={{ fontSize: 11, color: C.green }}>{importResult}</span>}
      </div>

      {/* ── Charge vs Capacité par phase ── */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${PHASE_CONFIG.length}, 1fr)`, gap: 8, marginBottom: 16 }}>
        {PHASE_CONFIG.map(ph => {
          const load = weekLoad[ph.id];
          const capa = phaseCapacities[ph.id];
          const pct = capa.totalMin > 0 ? Math.round(load.totalMin / capa.totalMin * 100) : 0;
          const barColor = pct > 100 ? C.red : pct > 80 ? C.orange : C.green;
          const overloaded = pct > 100;
          return (
            <div key={ph.id} style={{ background: C.s1, border: `1px solid ${overloaded ? C.red : C.border}`, borderRadius: 6, padding: "8px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: ph.color }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: ph.color }}>{ph.label}</span>
                <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, color: barColor }}>{pct}%</span>
              </div>
              <div style={{ height: 6, background: C.s2, borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
                <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: barColor, borderRadius: 3 }} />
              </div>
              <div style={{ fontSize: 10, color: C.sec }}>
                <strong style={{ color: barColor }}>{hm(load.totalMin)}</strong> planifié / {hm(capa.totalMin)} dispo
              </div>
              {overloaded && (
                <div style={{ fontSize: 10, color: C.red, fontWeight: 700, marginTop: 2 }}>
                  ⚠ Surcharge de {hm(load.totalMin - capa.totalMin)}
                </div>
              )}
              {/* Opérateurs dispo pour cette phase */}
              <div style={{ fontSize: 9, color: C.muted, marginTop: 4 }}>
                {capa.operators.map(o => `${o.nom} ${hm(o.minDispo)}`).join(" · ")}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Commandes planifiées cette semaine ── */}
      <div style={{ overflowX: "auto" }}>
        {thisWeekCmds.length > 0 ? (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              Commandes planifiées {currentWeekId}
              <span style={{ fontWeight: 400, color: C.sec, marginLeft: 6 }}>({thisWeekCmds.length})</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginBottom: 16 }}>
              <thead>
                <tr>
                  <th style={{ padding: "8px 8px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "left", fontSize: 10, color: C.sec, minWidth: 180 }}>COMMANDE</th>
                  <th style={{ padding: "8px 4px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 10, color: C.sec, width: 55 }}>LIVR.</th>
                  {PHASE_CONFIG.map(ph => (
                    <th key={ph.id} style={{ padding: "8px 4px", background: ph.color + "15", borderBottom: `2px solid ${ph.color}`, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 10, fontWeight: 700, color: ph.color, minWidth: 150 }}>
                      {ph.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>{thisWeekCmds.map(renderCmdRow)}</tbody>
            </table>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: 30, color: C.sec, background: C.s1, borderRadius: 6, border: `1px solid ${C.border}`, marginBottom: 16 }}>
            Aucune commande planifiée en {currentWeekId}.
            <span style={{ fontSize: 11, color: C.muted, display: "block", marginTop: 4 }}>Affecte des semaines aux commandes ci-dessous.</span>
          </div>
        )}
      </div>

      {/* ── Commandes non planifiées (toggle) ── */}
      {unplannedCmds.length > 0 && (
        <div>
          <button
            onClick={() => setShowUnplanned(!showUnplanned)}
            style={{ padding: "8px 16px", background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6, color: C.sec, cursor: "pointer", fontSize: 12, fontWeight: 600, marginBottom: 8 }}
          >
            {showUnplanned ? "▲ Masquer" : "▼ Afficher"} les commandes non planifiées ({unplannedCmds.length})
          </button>
          {showUnplanned && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ padding: "8px 8px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "left", fontSize: 10, color: C.sec, minWidth: 180 }}>COMMANDE</th>
                    <th style={{ padding: "8px 4px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 10, color: C.sec, width: 55 }}>LIVR.</th>
                    {PHASE_CONFIG.map(ph => (
                      <th key={ph.id} style={{ padding: "8px 4px", background: ph.color + "15", borderBottom: `2px solid ${ph.color}`, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 10, fontWeight: 700, color: ph.color, minWidth: 150 }}>
                        {ph.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>{unplannedCmds.map(renderCmdRow)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {cmdList.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: C.sec }}>Aucune commande active.</div>
      )}
    </div>
  );
}
