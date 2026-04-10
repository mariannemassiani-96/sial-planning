"use client";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { C, EQUIPE, TYPES_MENUISERIE, hm, CommandeCC } from "@/lib/sial-data";
import { getRoutage } from "@/lib/routage-production";
import { openPrintWindow } from "@/lib/print-utils";

// ── Types opérateurs chargés depuis la base ──────────────────────────────────
interface OpFromDB {
  id: string;
  name: string;
  weekHours: number;
  posts: string[];
  workingDays: number[];
  skills: Array<{ workPostId: string | null; level: number }>;
}
// Opérateur résolu avec les postes où il est compétent (niveau > 0)
interface OpResolved {
  id: string;     // cuid
  key: string;    // clé EQUIPE (guillaume, julien...)
  nom: string;
  competentPosts: string[]; // ["C2","C3","F1","F2"...] — depuis les skills cochées en base
  skillLevels: Record<string, number>; // { "C3": 2, "F1": 1 } — niveau par poste
  vendrediOff: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function localStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function weekId(mondayStr: string): string {
  const d = new Date(mondayStr + "T00:00:00");
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const w1 = new Date(jan4);
  w1.setDate(jan4.getDate() - ((jan4.getDay() || 7) - 1));
  const wn = Math.ceil((d.getTime() - w1.getTime()) / (7 * 86400000)) + 1;
  return `S${String(wn).padStart(2, "0")}`;
}

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven"];
const POST_GROUPS = [
  { label: "Coupe & Prépa", color: "#42A5F5", phase: "coupe", competence: "coupe", ids: ["C2","C3","C4","C5","C6"] },
  { label: "Montage",       color: "#FFA726", phase: "montage", competence: "frappes", ids: ["M1","M2","M3","F1","F2","F3","MHS"] },
  { label: "Vitrage",       color: "#26C6DA", phase: "vitrage", competence: "vitrage", ids: ["V1","V2","V3"] },
  { label: "Logistique",    color: "#CE93D8", phase: "logistique", competence: "logistique", ids: ["L4","L6","L7"] },
  { label: "ISULA",         color: "#4DB6AC", phase: "isula", competence: "isula", ids: ["IL","IB","I3","I4"] },
  { label: "Autre",         color: "#78909C", phase: "autre", competence: "", ids: ["AUT"] },
];
const POST_LABELS: Record<string, string> = {
  C2:"Prépa barres",C3:"Coupe LMT",C4:"Coupe 2 têtes",C5:"Renfort acier",C6:"Soudure PVC",
  M1:"Dorm. couliss.",M2:"Dorm. galand.",M3:"Portes ALU",F1:"Dorm. frappe ALU",F2:"Ouv.+ferrage",F3:"Mise bois+CQ",
  MHS:"Montage HS",
  V1:"Vitr. Frappe",V2:"Vitr. Coul/Gal",V3:"Emballage",
  L4:"Prépa acc.",L6:"Palettes",L7:"Chargement",
  IL:"Coupe Lisec",IB:"Coupe Bottero",I3:"Coupe interc.",I4:"Assemblage VI",
  AUT:"Autre",
};
const PHASE_FIELD: Record<string, string> = {
  coupe: "semaine_coupe", montage: "semaine_montage", vitrage: "semaine_vitrage", logistique: "semaine_logistique", isula: "semaine_vitrage",
};
// Fallback statique (utilisé seulement si l'API ne répond pas)
const OPS_FALLBACK = EQUIPE.map(op => ({
  id: op.id, key: op.id, nom: op.nom, competentPosts: [] as string[], skillLevels: {} as Record<string, number>, vendrediOff: op.vendrediOff,
}));
const OP_COLORS: Record<string, string> = {
  guillaume:"#CE93D8", momo:"#4DB6AC", bruno:"#FFA726", ali:"#26C6DA",
  jp:"#FF7043", jf:"#66BB6A", michel:"#42A5F5", alain:"#FFCA28",
  francescu:"#AB47BC", julien:"#80CBC4", laurent:"#A5D6A7", mateo:"#EF5350", kentin:"#7E57C2",
};
const DEMI_MIN = 240;

// Capacité max par poste en minutes par semaine (contrainte machine)
// Si pas listé → pas de plafond (limité seulement par les opérateurs)
const POST_MAX_WEEK: Record<string, number> = {
  C3: 39 * 60, // Coupe LMT : 39h/semaine max
  C6: 39 * 60, // Soudure PVC : 39h/semaine max
};

// ── Types ────────────────────────────────────────────────────────────────────

// Chaque cellule poste|jour|demi contient : opérateurs + chantiers + tâches extras
interface CellData {
  ops: string[];     // noms opérateurs
  cmds: string[];    // "client · chantier"
  extras?: string[]; // tâches supplémentaires ("INTERV: SAV Dupont 2h", "SUPERVISION")
}
type AffMap = Record<string, CellData>;

// Tâche supplémentaire (intervention, supervision, etc.)
interface ExtraTask {
  id: string;
  label: string;
  min: number;
  type: "intervention" | "supervision" | "autre";
}

// ── Composant ────────────────────────────────────────────────────────────────

export default function PlanningAffectations({ commandes, viewWeek, onPatch, onWeekChange }: {
  commandes: CommandeCC[];
  viewWeek: string;
  onPatch?: (id: string, updates: Record<string, unknown>) => void;
  onWeekChange?: (w: string) => void;
}) {
  const [aff, setAff] = useState<AffMap>({});
  const [locked, setLocked] = useState(false);
  // Tâches masquées : "C3|BAT C", "C6|AZARA", etc.
  const [hiddenTasks, setHiddenTasks] = useState<Set<string>>(new Set());
  const [ops, setOps] = useState<OpResolved[]>(OPS_FALLBACK);
  // Habitudes : { "C3": { "Julien": 45, "Laurent": 38 }, ... }
  const [habits, setHabits] = useState<Record<string, Record<string, number>>>({});
  // Absences RH
  const [rhPlan, setRhPlan] = useState<Record<string, Record<string, number>>>({});
  // Tâches supplémentaires (interventions, etc.)
  const [extraTasks, setExtraTasks] = useState<ExtraTask[]>([]);
  const [newExtra, setNewExtra] = useState({ label: "", min: "" });
  // Popup détail chantier
  const [detailCmd, setDetailCmd] = useState<{ chantier: string; cmdId: string; cmd: any } | null>(null);
  const [cmdOverrides, setCmdOverrides] = useState<Record<string, number>>({});
  // Overrides par commande pour recalcul postWork : { cmdId: { "C3": 1200 } }
  const [allCmdOverrides, setAllCmdOverrides] = useState<Record<string, Record<string, number>>>({});

  // Charger les overrides quand on ouvre un détail
  useEffect(() => {
    if (!detailCmd) { setCmdOverrides({}); return; }
    fetch(`/api/planning/affectations?semaine=cmd_temps_${detailCmd.cmdId}`)
      .then(r => r.ok ? r.json() : {})
      .then(data => { if (data && typeof data === "object" && !Array.isArray(data)) setCmdOverrides(data as Record<string, number>); })
      .catch(() => setCmdOverrides({}));
  }, [detailCmd?.cmdId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [dragOp, setDragOp] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Charger les opérateurs + compétences depuis la base ──
  useEffect(() => {
    fetch("/api/operators")
      .then(r => r.ok ? r.json() : [])
      .then((data: OpFromDB[]) => {
        if (!Array.isArray(data) || data.length === 0) return;
        const resolved: OpResolved[] = data.map(op => {
          const equipeEntry = EQUIPE.find(e => e.nom === op.name);
          const competentPosts = op.skills
            .filter(s => s.workPostId && s.level > 0)
            .map(s => s.workPostId as string);
          const skillLevels: Record<string, number> = {};
          for (const s of op.skills) {
            if (s.workPostId && s.level > 0) skillLevels[s.workPostId] = s.level;
          }
          return {
            id: op.id,
            key: equipeEntry?.id || op.name.toLowerCase(),
            nom: op.name,
            competentPosts,
            skillLevels,
            vendrediOff: equipeEntry?.vendrediOff || !op.workingDays.includes(4),
          };
        });
        setOps(resolved);
      })
      .catch(() => {});
  }, []);

  // ── Charger les habitudes d'affectation ──
  useEffect(() => {
    fetch("/api/planning/affectations?semaine=__habits__")
      .then(r => r.ok ? r.json() : {})
      .then(data => { if (data && typeof data === "object") setHabits(data as Record<string, Record<string, number>>); })
      .catch(() => {});
  }, []);

  // ── Charger les absences RH ──
  useEffect(() => {
    const d = new Date(viewWeek + "T00:00:00");
    const jan4 = new Date(d.getFullYear(), 0, 4);
    const w1 = new Date(jan4); w1.setDate(jan4.getDate() - ((jan4.getDay() || 7) - 1));
    const wn = Math.ceil((d.getTime() - w1.getTime()) / (7 * 86400000)) + 1;
    const semRH = `${d.getFullYear()}-W${String(wn).padStart(2, "0")}`;
    fetch(`/api/planning-rh?semaine=${encodeURIComponent(semRH)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.plan) setRhPlan(data.plan); else setRhPlan({}); })
      .catch(() => setRhPlan({}));
  }, [viewWeek]);

  // ── Charger les affectations depuis la base ──
  useEffect(() => {
    setLoaded(null);
    fetch(`/api/planning/affectations?semaine=${viewWeek}`)
      .then(r => r.ok ? r.json() : {})
      .then(data => {
        if (data && typeof data === "object" && Object.keys(data).length > 0) {
          // Migrer l'ancien format (string[]) vers le nouveau (CellData)
          const migrated: AffMap = {};
          for (const [key, val] of Object.entries(data)) {
            if (Array.isArray(val)) {
              // Ancien format : string[] → { ops: string[], cmds: [] }
              migrated[key] = { ops: val as string[], cmds: [] };
            } else if (val && typeof val === "object" && "ops" in (val as any)) {
              migrated[key] = val as CellData;
            }
          }
          setAff(migrated);
        } else {
          setAff({});
        }
        setLoaded(viewWeek);
      })
      .catch(() => { setAff({}); setLoaded(viewWeek); });
    // Charger le statut verrouillé + postes masqués
    fetch(`/api/planning/affectations?semaine=lock_${viewWeek}`)
      .then(r => r.ok ? r.json() : {})
      .then(data => {
        setLocked(!!(data as any)?.locked);
        const hidden = (data as any)?.hiddenTasks || (data as any)?.hiddenPosts;
        setHiddenTasks(Array.isArray(hidden) ? new Set(hidden) : new Set());
      })
      .catch(() => { setLocked(false); setHiddenTasks(new Set()); });
    // Charger les overrides par commande
    const cmdIds = commandes.filter(c => { const s = (c as any).statut; return s !== "livre" && s !== "terminee" && s !== "annulee"; }).map(c => String(c.id));
    Promise.all(cmdIds.slice(0, 50).map(id =>
      fetch(`/api/planning/affectations?semaine=cmd_temps_${id}`).then(r => r.ok ? r.json() : null).then(d => ({ id, d })).catch(() => ({ id, d: null }))
    )).then(results => {
      const ov: Record<string, Record<string, number>> = {};
      for (const { id, d } of results) {
        if (d && typeof d === "object" && !Array.isArray(d) && Object.keys(d).length > 0) ov[id] = d as Record<string, number>;
      }
      setAllCmdOverrides(ov);
    });
    // Charger les tâches extras de la semaine
    fetch(`/api/planning/affectations?semaine=extras_${viewWeek}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (Array.isArray(data)) setExtraTasks(data); else if (data?.tasks) setExtraTasks(data.tasks); else setExtraTasks([]); })
      .catch(() => setExtraTasks([]));
  }, [viewWeek]);

  // ── Rafraîchissement auto toutes les 10s (si pas en train de sauvegarder) ──
  useEffect(() => {
    const interval = setInterval(() => {
      if (saving || saveTimer.current) return; // ne pas écraser pendant une sauvegarde
      fetch(`/api/planning/affectations?semaine=${viewWeek}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data || typeof data !== "object") return;
          const migrated: AffMap = {};
          for (const [key, val] of Object.entries(data)) {
            if (Array.isArray(val)) migrated[key] = { ops: val as string[], cmds: [] };
            else if (val && typeof val === "object" && "ops" in (val as any)) migrated[key] = val as CellData;
          }
          if (Object.keys(migrated).length > 0) setAff(migrated);
        })
        .catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [viewWeek, saving]);

  // ── Sauvegarde auto (debounce 1s) + apprentissage ──
  const saveAff = useCallback((newAff: AffMap) => {
    setAff(newAff);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      // Sauvegarder les affectations
      await fetch("/api/planning/affectations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semaine: viewWeek, affectations: newAff }),
      }).catch(() => {});

      // Apprendre des affectations : compter opérateur × poste
      const newHabits = { ...habits };
      for (const [key, cell] of Object.entries(newAff)) {
        if (!cell?.ops?.length) continue;
        const postId = key.split("|")[0];
        if (!newHabits[postId]) newHabits[postId] = {};
        for (const opNom of cell.ops) {
          newHabits[postId][opNom] = (newHabits[postId][opNom] || 0) + 1;
        }
      }
      setHabits(newHabits);
      // Persister les habitudes
      await fetch("/api/planning/affectations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semaine: "__habits__", affectations: newHabits }),
      }).catch(() => {});

      setSaving(false);
    }, 1000);
  }, [viewWeek, habits]);

  // ── Travail par poste ──
  const postWork = useMemo(() => {
    const work: Record<string, { totalMin: number; cmds: Array<{ client: string; chantier: string; min: number }> }> = {};
    for (const cmd of commandes) {
      const s = (cmd as any).statut;
      if (s === "livre" || s === "terminee" || s === "annulee") continue;
      if (!cmd.type) continue;

      const client = (cmd as any).client || "";
      const chantier = (cmd as any).ref_chantier || "";
      const lignes = Array.isArray((cmd as any).lignes) && (cmd as any).lignes.length > 0
        ? (cmd as any).lignes
        : [{ type: cmd.type, quantite: cmd.quantite }];

      // Agréger les temps par poste pour cette commande
      const cmdPostTotals: Record<string, { min: number; phase: string }> = {};
      for (const ligne of lignes) {
        const lType = ligne.type || cmd.type;
        if (lType === "intervention_chantier") continue;
        const lQte = parseInt(ligne.quantite) || cmd.quantite || 1;
        const lHs = lType === "hors_standard" ? {
          t_coupe: ligne.hs_t_coupe, t_montage: ligne.hs_t_montage, t_vitrage: ligne.hs_t_vitrage,
        } : (cmd as any).hsTemps;
        const routage = getRoutage(lType, lQte, lHs as Record<string, unknown> | null);
        for (const e of routage) {
          if (!cmdPostTotals[e.postId]) cmdPostTotals[e.postId] = { min: 0, phase: e.phase };
          cmdPostTotals[e.postId].min += e.estimatedMin;
        }
      }

      // Appliquer les overrides par commande
      const cmdOv = allCmdOverrides[String(cmd.id)] || {};

      // C3 dynamique : recalculer si nb_barres est défini, en fonction des opérateurs affectés
      const nbBarres = cmdOv["_nb_barres_lmt"];
      if (nbBarres && nbBarres > 0) {
        let maxOpsC3 = 0;
        for (const [k, cell] of Object.entries(aff)) {
          if (k.startsWith("C3|") && cell?.ops?.length) maxOpsC3 = Math.max(maxOpsC3, cell.ops.length);
        }
        const pers = maxOpsC3 || 2;
        const minPerBar = pers >= 3 ? 480 / 120 : pers >= 2 ? 480 / 80 : 480 / 50;
        const c3Dynamic = Math.round(nbBarres * minPerBar);
        if (cmdPostTotals["C3"]) cmdPostTotals["C3"].min = c3Dynamic;
        else cmdPostTotals["C3"] = { min: c3Dynamic, phase: "coupe" };
      }

      for (const [pid, ov] of Object.entries(cmdOv)) {
        if (pid.startsWith("_")) continue; // ignorer les méta-champs (_nb_barres_lmt)
        if (pid === "C3" && nbBarres && nbBarres > 0) continue; // C3 déjà calculé dynamiquement
        if (cmdPostTotals[pid]) cmdPostTotals[pid].min = ov;
        else cmdPostTotals[pid] = { min: ov, phase: "coupe" };
      }

      // Ajouter au postWork
      for (const [pid, data] of Object.entries(cmdPostTotals)) {
        const grp = POST_GROUPS.find(g => g.ids.includes(pid));
        if (!grp) continue;
        if ((cmd as any)[PHASE_FIELD[grp.phase]] !== viewWeek) continue;
        if (!work[pid]) work[pid] = { totalMin: 0, cmds: [] };
        work[pid].totalMin += data.min;
        if (!work[pid].cmds.some(c => c.client === client && c.chantier === chantier)) {
          work[pid].cmds.push({ client, chantier, min: 0 });
        }
        const existing = work[pid].cmds.find(c => c.client === client && c.chantier === chantier);
        if (existing) existing.min += data.min;
      }

      // Postes ISULA : si la commande a des vitrages ISULA et est planifiée cette semaine
      const isulaField = (cmd as any).semaine_isula || (cmd as any).semaine_vitrage;
      if (isulaField === viewWeek && !(cmd as any).aucun_vitrage) {
        const vitrages = Array.isArray((cmd as any).vitrages) ? (cmd as any).vitrages : [];
        const isulaVitrages = vitrages.filter((v: any) => (v.fournisseur || "").toLowerCase() === "isula");
        if (isulaVitrages.length > 0) {
          const nbVitrages = isulaVitrages.reduce((s: number, v: any) => s + (parseInt(v.quantite) || 1), 0);
          // Overrides par commande pour nb plaques
          const cmdOvI = allCmdOverrides[String(cmd.id)] || {};
          const nbPlaquesLisec = cmdOvI["_nb_plaques_lisec"] || 0;
          const nbPlaquesBottero = cmdOvI["_nb_plaques_bottero"] || 0;

          // Coupe Lisec : 15 min/plaque (ou estimé par nb vitrages si pas de plaques saisies)
          const ilMin = nbPlaquesLisec > 0 ? nbPlaquesLisec * 15 : nbVitrages * 15;
          // Coupe Bottero : 40 min/plaque
          const ibMin = nbPlaquesBottero > 0 ? nbPlaquesBottero * 40 : 0; // 0 si pas de plaques saisies (pas toujours utilisé)

          // I4 Assemblage VI : 20 pièces/jour à 3 pers = 24 min/pièce (base 3 pers)
          // Adapte selon nb opérateurs sur I4
          let maxOpsI4 = 0;
          for (const [k, cell] of Object.entries(aff)) {
            if (k.startsWith("I4|") && cell?.ops?.length) maxOpsI4 = Math.max(maxOpsI4, cell.ops.length);
          }
          const i4Pers = maxOpsI4 || 3;
          const i4MinPerVitrage = Math.round(480 / (20 * i4Pers / 3)); // proportionnel
          const i4Min = nbVitrages * i4MinPerVitrage;

          const ISULA_TIMES: Record<string, number> = {
            IL: ilMin, IB: ibMin,
            I3: 8 * nbVitrages,
            I4: i4Min,
          };
          for (const [pid, min] of Object.entries(ISULA_TIMES)) {
            if (min <= 0) continue;
            if (!work[pid]) work[pid] = { totalMin: 0, cmds: [] };
            work[pid].totalMin += min;
            if (!work[pid].cmds.some(c => c.client === client && c.chantier === chantier)) {
              work[pid].cmds.push({ client, chantier, min: 0 });
            }
            const existing = work[pid].cmds.find(c => c.client === client && c.chantier === chantier);
            if (existing) existing.min += min;
          }
        }
      }
    }
    return work;
  }, [commandes, viewWeek, allCmdOverrides, aff]);

  const activePosts = useMemo(() =>
    POST_GROUPS.map(grp => {
      const allPosts = grp.phase === "autre" ? grp.ids : grp.ids.filter(pid => postWork[pid]?.totalMin > 0);
      // Un poste est masqué si TOUS ses chantiers sont marqués "fait"
      const visiblePosts = allPosts.filter(pid => {
        const pw = postWork[pid];
        if (!pw || pw.cmds.length === 0) return true; // poste AUTRE ou vide = toujours visible
        const allDone = pw.cmds.every(c => hiddenTasks.has(`${pid}|${c.chantier || c.client}`));
        return !allDone;
      });
      return { ...grp, posts: allPosts, visiblePosts, allPosts };
    }).filter(g => g.allPosts.length > 0),
    [postWork, hiddenTasks]
  );

  const ck = (pid: string, j: number, d: string) => `${pid}|${j}|${d}`;

  // ── Drop opérateur ou tâche extra sur cellule ──
  const onDrop = useCallback((key: string, e?: React.DragEvent) => {
    if (locked) return;
    // Vérifier si c'est un extra
    const data = e?.dataTransfer?.getData("text/plain") || "";
    if (data.startsWith("extra:")) {
      const extraLabel = data.slice(6);
      const newAff = { ...aff };
      const cell = newAff[key] || { ops: [], cmds: [], extras: [] };
      const extras = cell.extras || [];
      if (!extras.includes(extraLabel)) {
        newAff[key] = { ...cell, extras: [...extras, extraLabel] };
        saveAff(newAff);
      }
      setDropTarget(null);
      return;
    }
    // Chantier glissé depuis la palette
    if (data.startsWith("cmd:")) {
      const cmdLabel = data.slice(4);
      const newAff = { ...aff };
      const cell = newAff[key] || { ops: [], cmds: [] };
      if (!cell.cmds.includes(cmdLabel)) {
        newAff[key] = { ...cell, cmds: [...cell.cmds, cmdLabel] };
        saveAff(newAff);
      }
      setDropTarget(null);
      return;
    }
    // Sinon c'est un opérateur
    if (!dragOp) return;
    const newAff = { ...aff };
    const cell = newAff[key] || { ops: [], cmds: [] };
    if (!cell.ops.includes(dragOp)) {
      newAff[key] = { ...cell, ops: [...cell.ops, dragOp] };
      saveAff(newAff);
    }
    setDragOp(null);
    setDropTarget(null);
  }, [dragOp, aff, saveAff]);

  const removeOp = useCallback((key: string, opNom: string) => {
    const newAff = { ...aff };
    const cell = newAff[key] || { ops: [], cmds: [] };
    const newOps = cell.ops.filter(o => o !== opNom);
    if (newOps.length === 0 && cell.cmds.length === 0) delete newAff[key];
    else newAff[key] = { ...cell, ops: newOps };
    saveAff(newAff);
  }, [aff, saveAff]);

  const toggleCmd = useCallback((key: string, cmdLabel: string) => {
    const newAff = { ...aff };
    const cell = newAff[key] || { ops: [], cmds: [] };
    const hasCm = cell.cmds.includes(cmdLabel);
    const newCmds = hasCm ? cell.cmds.filter(c => c !== cmdLabel) : [...cell.cmds, cmdLabel];
    if (newCmds.length === 0 && cell.ops.length === 0) delete newAff[key];
    else newAff[key] = { ...cell, cmds: newCmds };
    saveAff(newAff);
  }, [aff, saveAff]);

  // ── Verrouiller/déverrouiller la semaine ──
  const saveLockState = useCallback(async (newLocked: boolean, newHidden: Set<string>) => {
    await fetch("/api/planning/affectations", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ semaine: `lock_${viewWeek}`, affectations: { locked: newLocked, hiddenTasks: Array.from(newHidden) } }),
    }).catch(() => {});
  }, [viewWeek]);

  const toggleLock = useCallback(async () => {
    const newLocked = !locked;
    setLocked(newLocked);
    saveLockState(newLocked, hiddenTasks);
  }, [locked, hiddenTasks, saveLockState]);

  const toggleHideTask = useCallback((pid: string, chantier: string) => {
    const key = `${pid}|${chantier}`;
    const newHidden = new Set(hiddenTasks);
    if (newHidden.has(key)) newHidden.delete(key); else newHidden.add(key);
    setHiddenTasks(newHidden);
    saveLockState(locked, newHidden);
  }, [hiddenTasks, locked, saveLockState]);

  // ── Gestion tâches extras ──
  const addExtra = useCallback(() => {
    if (!newExtra.label.trim()) return;
    const task: ExtraTask = {
      id: `ext_${Date.now()}`,
      label: newExtra.label.trim(),
      min: parseInt(newExtra.min) || 60,
      type: newExtra.label.toLowerCase().includes("superv") ? "supervision" : newExtra.label.toLowerCase().includes("interv") ? "intervention" : "autre",
    };
    const updated = [...extraTasks, task];
    setExtraTasks(updated);
    setNewExtra({ label: "", min: "" });
    // Sauvegarder
    fetch("/api/planning/affectations", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ semaine: `extras_${viewWeek}`, affectations: { tasks: updated } }),
    }).catch(() => {});
  }, [newExtra, extraTasks, viewWeek]);

  const removeExtra = useCallback((id: string) => {
    const updated = extraTasks.filter(t => t.id !== id);
    setExtraTasks(updated);
    fetch("/api/planning/affectations", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ semaine: `extras_${viewWeek}`, affectations: { tasks: updated } }),
    }).catch(() => {});
  }, [extraTasks, viewWeek]);

  const toggleExtra = useCallback((key: string, extraLabel: string) => {
    const newAff = { ...aff };
    const cell = newAff[key] || { ops: [], cmds: [], extras: [] };
    const extras = cell.extras || [];
    const has = extras.includes(extraLabel);
    const newExtras = has ? extras.filter(e => e !== extraLabel) : [...extras, extraLabel];
    newAff[key] = { ...cell, extras: newExtras };
    saveAff(newAff);
  }, [aff, saveAff]);

  // ── Proposition automatique ──
  const autoAssign = useCallback(() => {
    const newAff: AffMap = {};

    // Minimum de personnes par créneau selon la phase
    const MIN_PERS: Record<string, number> = { coupe: 2, montage: 1, vitrage: 1, logistique: 1 };

    for (const grp of activePosts) {
      const minPers = MIN_PERS[grp.phase] || 1;

      for (const pid of grp.posts) {
        const pw = postWork[pid];
        if (!pw || pw.totalMin === 0) continue;

        // Combien de demi-journées faut-il avec minPers opérateurs ?
        const slotsNeeded = Math.ceil(pw.totalMin / (DEMI_MIN * minPers));

        // Opérateurs compétents pour CE poste
        // 1) D'abord ceux qui ont le poste coché en base
        let competentOps = ops.filter(op => op.competentPosts.includes(pid));
        // 2) Fallback : opérateurs avec la compétence de la phase (depuis EQUIPE)
        if (competentOps.length === 0) {
          const equipeComp = grp.competence;
          competentOps = ops.filter(op => {
            const eq = EQUIPE.find(e => e.nom === op.nom);
            return eq?.competences.includes(equipeComp);
          });
        }
        if (competentOps.length === 0) continue;

        // Affecter par journée complète (AM+PM ensemble) pour ne pas faire sauter les gens d'un poste à l'autre
        let slotsPlaced = 0;
        for (let j = 0; j < 5 && slotsPlaced < slotsNeeded; j++) {
          const demis = j === 4
            ? ["am", "pm"].filter(d => !(d === "pm" && competentOps.every(op => op.vendrediOff || op.id === "jp")))
            : ["am", "pm"];

          // Trouver les meilleurs opérateurs : habitude élevée + charge faible
          const postHabits = habits[pid] || {};
          const opScores = competentOps
            .filter(op => !(j === 4 && op.vendrediOff))
            .map(op => {
              let load = 0;
              for (const k of Object.keys(newAff)) {
                const parts = k.split("|");
                if (parseInt(parts[1]) === j && (newAff[k]?.ops || []).includes(op.nom)) load++;
              }
              const habit = postHabits[op.nom] || 0;
              return { op, load, habit };
            })
            // Trier : d'abord les libres, puis par habitude (le plus souvent = en premier)
            .sort((a, b) => {
              if (a.load !== b.load) return a.load - b.load;
              return b.habit - a.habit; // plus d'habitude = prioritaire
            });

          // Prendre les N meilleurs (N = minPers)
          const toAssign = opScores.filter(o => o.load === 0).slice(0, minPers);
          if (toAssign.length < minPers) {
            const needed = minPers - toAssign.length;
            const more = opScores.filter(o => o.load > 0).slice(0, needed);
            toAssign.push(...more);
          }

          if (toAssign.length > 0) {
            for (const d of demis) {
              const key = ck(pid, j, d);
              const names = toAssign
                .filter(o => !(j === 4 && d === "pm" && o.op.id === "jp"))
                .map(o => o.op.nom);
              if (names.length > 0) {
                // Aussi affecter les chantiers de ce poste
                const cmdLabels = pw.cmds.map(c => c.chantier || c.client);
                newAff[key] = { ops: names, cmds: cmdLabels };
              }
            }
            slotsPlaced += demis.length;
          }
        }
      }
    }

    saveAff(newAff);
  }, [activePosts, postWork, saveAff]);

  // ── Tout effacer ──
  const clearAll = useCallback(() => { saveAff({}); }, [saveAff]);

  // ── Audit des affectations ──
  const [auditResult, setAuditResult] = useState<string[] | null>(null);
  const runAudit = useCallback(() => {
    const issues: string[] = [];
    const JOURS_N = ["Lun", "Mar", "Mer", "Jeu", "Ven"];

    // 1. Vérifier heures par opérateur par jour
    for (const op of ops) {
      const eq = EQUIPE.find(e => e.nom === op.nom);
      const opRH = rhPlan[eq?.id || ""] || {};

      for (let j = 0; j < 5; j++) {
        const d = new Date(viewWeek + "T00:00:00");
        d.setDate(d.getDate() + j);
        const dayStr = localStr(d);
        const dayDispo = opRH[dayStr];
        const isAbsent = dayDispo !== undefined && dayDispo === 0;
        const isVenOff = j === 4 && eq?.vendrediOff;

        // Max heures ce jour pour cet opérateur
        let maxDayMin: number;
        if (isAbsent || isVenOff) {
          maxDayMin = 0;
        } else if (j === 4) {
          maxDayMin = eq?.h === 39 ? 420 : eq?.h === 36 ? 240 : eq?.h === 35 ? 420 : 450;
        } else {
          maxDayMin = eq?.h === 39 ? 480 : eq?.h === 36 ? 480 : eq?.h === 35 ? 420 : 450;
        }

        // Compter les heures réelles de tâches affectées ce jour
        let affDayMin = 0;
        let hasAnySlot = false;
        for (const demi of ["am", "pm"]) {
          for (const [key, cell] of Object.entries(aff)) {
            if (!cell?.ops?.includes(op.nom)) continue;
            const p = key.split("|");
            if (parseInt(p[1]) !== j || p[2] !== demi) continue;
            hasAnySlot = true;
            const pid = p[0];
            const pw = postWork[pid];
            const nbOps = cell.ops.length;
            // Heures réelles = somme des tâches (chantiers) dans cette cellule / nb opérateurs
            let cellWorkMin = 0;
            if (pw && cell.cmds?.length) {
              for (const cmdLabel of cell.cmds) {
                const cmd = pw.cmds.find(c => (c.chantier || c.client) === cmdLabel);
                if (cmd) cellWorkMin += cmd.min;
              }
            }
            // Extras comptent comme 4h
            if (cell.extras?.length) { for (const ext of cell.extras) { const m = ext.match(/\((\d+)h(\d+)?\)/); cellWorkMin += m ? parseInt(m[1]) * 60 + (parseInt(m[2]) || 0) : DEMI_MIN; } }
            // Si pas de chantier ni extra mais des ops → travail non spécifié, compter 4h
            if (cellWorkMin === 0 && (cell.cmds?.length || 0) === 0 && (cell.extras?.length || 0) === 0) {
              cellWorkMin = DEMI_MIN;
            }
            // Part de cet opérateur = total / nb opérateurs sur ce créneau
            affDayMin += Math.round(Math.min(cellWorkMin, DEMI_MIN) / nbOps);
          }
        }

        if (isAbsent && hasAnySlot) {
          issues.push(`🔴 ${op.nom} ${JOURS_N[j]} : affecté mais ABSENT (RH)`);
        } else if (isVenOff && hasAnySlot) {
          issues.push(`🔴 ${op.nom} ${JOURS_N[j]} : affecté mais ne travaille pas le vendredi`);
        } else if (affDayMin > maxDayMin && maxDayMin > 0) {
          issues.push(`🟠 ${op.nom} ${JOURS_N[j]} : ${hm(affDayMin)} affecté mais max ${hm(maxDayMin)}/jour`);
        } else if (maxDayMin > 0 && !hasAnySlot) {
          let totalWeekSlots = 0;
          for (const [, cell] of Object.entries(aff)) { if (cell?.ops?.includes(op.nom)) totalWeekSlots++; }
          if (totalWeekSlots > 0) {
            issues.push(`⚪ ${op.nom} ${JOURS_N[j]} : journée vide (dispo ${hm(maxDayMin)})`);
          }
        }
      }

      // Total semaine
      // Total semaine = somme des heures réelles de tâches par créneau
      let totalAffMin = 0;
      for (const [key, cell] of Object.entries(aff)) {
        if (!cell?.ops?.includes(op.nom)) continue;
        const pid = key.split("|")[0];
        const pw = postWork[pid];
        const nbOps = cell.ops.length;
        let cellWorkMin = 0;
        if (pw && cell.cmds?.length) {
          for (const cmdLabel of cell.cmds) {
            const cmd = pw.cmds.find(c => (c.chantier || c.client) === cmdLabel);
            if (cmd) cellWorkMin += cmd.min;
          }
        }
        if (cell.extras?.length) { for (const ext of cell.extras) { const m = ext.match(/\((\d+)h(\d+)?\)/); cellWorkMin += m ? parseInt(m[1]) * 60 + (parseInt(m[2]) || 0) : DEMI_MIN; } }
        if (cellWorkMin === 0 && (cell.cmds?.length || 0) === 0 && (cell.extras?.length || 0) === 0) cellWorkMin = DEMI_MIN;
        totalAffMin += Math.round(Math.min(cellWorkMin, DEMI_MIN) / nbOps);
      }
      const baseMin = (eq?.h || 39) * 60;
      let absTotal = 0;
      for (let j = 0; j < 5; j++) {
        const d = new Date(viewWeek + "T00:00:00"); d.setDate(d.getDate() + j);
        const dv = opRH[localStr(d)];
        if (dv !== undefined && dv === 0) absTotal += j === 4 ? (eq?.h === 39 ? 420 : 420) : 480;
      }
      const dispoMin = Math.max(0, baseMin - absTotal);
      if (totalAffMin > dispoMin && dispoMin > 0) {
        issues.push(`🔴 ${op.nom} SEMAINE : ${hm(totalAffMin)} affecté mais dispo ${hm(dispoMin)}`);
      }
    }

    // 2. Postes avec chantiers mais sans opérateurs
    for (const [key, cell] of Object.entries(aff)) {
      if (!cell) continue;
      const hasWork = (cell.cmds?.length || 0) > 0 || (cell.extras?.length || 0) > 0;
      const hasOps = (cell.ops?.length || 0) > 0;
      if (hasWork && !hasOps) {
        const p = key.split("|");
        issues.push(`🟠 ${p[0]} ${JOURS_N[parseInt(p[1])]} ${p[2] === "am" ? "AM" : "PM"} : tâches sans opérateur`);
      }
    }

    // 3. Opérateurs sur des postes sans compétence
    for (const [key, cell] of Object.entries(aff)) {
      if (!cell?.ops?.length) continue;
      const pid = key.split("|")[0];
      if (pid === "AUT") continue; // poste Autre = pas de contrôle
      const grp = POST_GROUPS.find(g => g.ids.includes(pid));
      for (const opNom of cell.ops) {
        const op = ops.find(o => o.nom === opNom);
        if (!op) continue;
        // Vérifier : 1) poste coché en base 2) fallback compétence EQUIPE par phase
        const hasPostSkill = op.competentPosts.includes(pid);
        if (hasPostSkill) continue;
        const eq = EQUIPE.find(e => e.nom === opNom);
        const hasPhaseSkill = grp && eq?.competences.includes(grp.competence);
        if (hasPhaseSkill) continue;
        // Aucune compétence
        const p = key.split("|");
        issues.push(`🔴 ${opNom} sur ${pid} ${JOURS_N[parseInt(p[1])]} ${p[2] === "am" ? "AM" : "PM"} : aucune compétence sur ce poste`);
      }
    }

    // 4. Débutants seuls sans expert (seulement si des skills sont cochées)
    for (const [key, cell] of Object.entries(aff)) {
      if (!cell?.ops?.length) continue;
      const pid = key.split("|")[0];
      if (pid === "AUT") continue;
      // Vérifier uniquement si au moins un opérateur a un skill level coché pour ce poste
      const opLevels = cell.ops.map(opNom => {
        const op = ops.find(o => o.nom === opNom);
        return { nom: opNom, level: op?.skillLevels[pid] || 0 };
      });
      const anyLevelSet = opLevels.some(o => o.level > 0);
      if (!anyLevelSet) continue; // pas de niveaux cochés → on ne peut pas vérifier
      const hasExpert = opLevels.some(o => o.level >= 3);
      const hasAutonome = opLevels.some(o => o.level >= 2);
      const debutants = opLevels.filter(o => o.level === 1);
      if (debutants.length > 0 && !hasExpert && !hasAutonome) {
        const p = key.split("|");
        issues.push(`🟠 ${pid} ${JOURS_N[parseInt(p[1])]} ${p[2] === "am" ? "AM" : "PM"} : ${debutants.map(d => d.nom).join(", ")} débutant${debutants.length > 1 ? "s" : ""} seul${debutants.length > 1 ? "s" : ""} — besoin supervision ② ou ③`);
      }
    }

    // 5. Règle ISULA S-1 : vitrage doit être fini 1 semaine avant montage
    for (const cmd of commandes) {
      const a = cmd as any;
      const semMontage = a.semaine_montage || a.semaine_coupe;
      const semIsula = a.semaine_isula;
      if (semMontage && semIsula) {
        const monM = new Date(semMontage + "T00:00:00").getTime();
        const monI = new Date(semIsula + "T00:00:00").getTime();
        if (monI > monM - 7 * 86400000) {
          issues.push(`🟠 ${a.ref_chantier || a.client} : ISULA ${weekId(semIsula)} doit être avant montage ${weekId(semMontage)} (min S-1)`);
        }
      }
    }

    if (issues.length === 0) issues.push("✅ Aucun problème détecté !");
    setAuditResult(issues);
  }, [ops, aff, viewWeek, rhPlan]);

  // ── Impression fiches par opérateur ──
  const printFiches = useCallback(() => {
    const wk = weekId(viewWeek);
    // Construire le planning par opérateur
    const opPlannings: Record<string, Array<{ jour: string; demi: string; postId: string; postLabel: string; cmds: string[] }>> = {};

    for (const [key, cell] of Object.entries(aff)) {
      if (!cell || (!cell.ops?.length && !cell.cmds?.length)) continue;
      const [pid, jourStr, demi] = key.split("|");
      const jourIdx = parseInt(jourStr);
      const grp = POST_GROUPS.find(g => g.ids.includes(pid));
      const cellCmds = cell.cmds?.length > 0 ? cell.cmds : (postWork[pid]?.cmds.map(c => c.chantier ? `${c.client} · ${c.chantier}` : c.client) || []);

      for (const opNom of (cell.ops || [])) {
        if (!opPlannings[opNom]) opPlannings[opNom] = [];
        opPlannings[opNom].push({
          jour: JOURS[jourIdx],
          demi: demi === "am" ? "Matin" : "Après-midi",
          postId: pid,
          postLabel: `${POST_LABELS[pid] || pid} (${grp?.label || ""})`,
          cmds: cellCmds,
        });
      }
    }

    // Trier par jour/demi
    const jourOrder: Record<string, number> = { Lun: 0, Mar: 1, Mer: 2, Jeu: 3, Ven: 4 };
    for (const opNom of Object.keys(opPlannings)) {
      opPlannings[opNom].sort((a, b) => {
        const da = jourOrder[a.jour] * 2 + (a.demi === "Matin" ? 0 : 1);
        const db = jourOrder[b.jour] * 2 + (b.demi === "Matin" ? 0 : 1);
        return da - db;
      });
    }

    // Générer le HTML
    let html = "";
    const allOps = ops.filter(op => opPlannings[op.nom]);

    for (const op of allOps) {
      const planning = opPlannings[op.nom];
      if (!planning || planning.length === 0) continue;

      html += `
        <div style="page-break-after: always; ${allOps.indexOf(op) === allOps.length - 1 ? "page-break-after: auto;" : ""}">
          <div class="header">
            <div class="header-left">
              <h1>SIAL <span>+</span> ISULA</h1>
              <div class="subtitle">Planning de la semaine ${wk}</div>
            </div>
            <div class="header-right">
              Fiche opérateur<br>
              Imprimé le ${new Date().toLocaleDateString("fr-FR")}
            </div>
          </div>

          <h2 style="font-size: 18px; border: 2px solid #000; padding: 8px 12px; border-radius: 4px; display: inline-block;">
            ${op.nom}
          </h2>
          <p style="margin: 8px 0 16px; color: #555; font-size: 11px;">
            Postes : ${op.competentPosts.join(", ") || "aucun coché"}
          </p>

          <table>
            <thead>
              <tr>
                <th style="width: 60px;">JOUR</th>
                <th style="width: 80px;">CRÉNEAU</th>
                <th style="width: 60px;">POSTE</th>
                <th>DESCRIPTION</th>
                <th>COMMANDES</th>
              </tr>
            </thead>
            <tbody>
      `;

      // Grouper par jour
      let lastJour = "";
      for (const slot of planning) {
        const showJour = slot.jour !== lastJour;
        lastJour = slot.jour;
        html += `
          <tr>
            <td style="font-weight: 700; ${showJour ? "" : "border-top: none; color: #fff;"}">${showJour ? slot.jour : ""}</td>
            <td>${slot.demi}</td>
            <td style="font-weight: 700;">${slot.postId}</td>
            <td>${slot.postLabel}</td>
            <td>${slot.cmds.join(", ") || "—"}</td>
          </tr>
        `;
      }

      // Ajouter les jours sans affectation
      for (const j of JOURS) {
        const hasSlots = planning.some(s => s.jour === j);
        if (!hasSlots) {
          const isOff = (j === "Ven" && op.vendrediOff);
          html += `
            <tr>
              <td style="font-weight: 700;">${j}</td>
              <td colspan="4" style="color: #999; text-align: center;">${isOff ? "REPOS" : "Non affecté"}</td>
            </tr>
          `;
        }
      }

      html += `
            </tbody>
          </table>

          <div class="footer">
            <span>SIAL + ISULA — Planning Industriel</span>
            <span>${wk} · ${op.nom}</span>
          </div>
        </div>
      `;
    }

    if (allOps.length === 0) {
      html = "<p style='text-align:center; padding: 40px; color: #999;'>Aucune affectation à imprimer. Utilisez 'Proposition auto' d'abord.</p>";
    }

    openPrintWindow(`Planning ${wk} — Fiches opérateurs`, html);
  }, [aff, postWork, viewWeek]);

  // ── Livraisons auto → tâches chargement + livraison ──
  const autoDeliveryTasks = useMemo(() => {
    const tasks: Array<{ key: string; label: string; type: "chargement" | "livraison" }> = [];
    // Grouper les livraisons par (jour, transporteur, zone)
    const deliveries = new Map<string, { date: string; transporteur: string; zone: string; clients: string[] }>();

    for (const cmd of commandes) {
      const dlDate = (cmd as any).date_livraison_souhaitee;
      if (!dlDate) continue;
      const transporteur = (cmd as any).transporteur || "";
      const zone = (cmd as any).zone || "";
      const dKey = `${dlDate}|${transporteur}|${zone}`;

      if (!deliveries.has(dKey)) {
        deliveries.set(dKey, { date: dlDate, transporteur, zone, clients: [] });
      }
      deliveries.get(dKey)!.clients.push((cmd as any).client);
    }

    // Pour chaque livraison unique dans la semaine courante ou la semaine d'après
    deliveries.forEach((del) => {
      const dlDay = new Date(del.date + "T00:00:00");
      const dlDayStr = localStr(dlDay);

      // Vérifier si la livraison est dans la semaine affichée
      const weekDays: string[] = [];
      for (let i = 0; i < 5; i++) {
        const d = new Date(viewWeek + "T00:00:00");
        d.setDate(d.getDate() + i);
        weekDays.push(localStr(d));
      }

      // Chargement = demi-journée avant la livraison
      const dayBefore = new Date(dlDay);
      dayBefore.setDate(dayBefore.getDate() - 1);
      // Si livraison lundi → chargement vendredi d'avant
      const chargeDayStr = localStr(dayBefore);
      const chargeJourIdx = weekDays.indexOf(chargeDayStr);

      if (chargeJourIdx >= 0) {
        const label = `🚛 Chargement ${del.zone || "livraison"} (${del.clients.length} client${del.clients.length > 1 ? "s" : ""})`;
        tasks.push({ key: `AUT|${chargeJourIdx}|pm`, label, type: "chargement" });
      }

      // Livraison = jour de livraison, seulement si transporteur "nous"
      if (del.transporteur === "nous") {
        const livrJourIdx = weekDays.indexOf(dlDayStr);
        if (livrJourIdx >= 0) {
          const label = `🚚 Livraison ${del.zone || ""} (${del.clients.join(", ")})`;
          tasks.push({ key: `AUT|${livrJourIdx}|am`, label, type: "livraison" });
          tasks.push({ key: `AUT|${livrJourIdx}|pm`, label, type: "livraison" });
        }
      }
    });
    return tasks;
  }, [commandes, viewWeek]);

  // Injecter les tâches auto dans les affectations (sans écraser les manuelles)
  const affWithAuto = useMemo(() => {
    const merged = { ...aff };
    for (const task of autoDeliveryTasks) {
      const cell = merged[task.key] || { ops: [], cmds: [], extras: [] };
      const extras = cell.extras || [];
      if (!extras.includes(task.label)) {
        merged[task.key] = { ...cell, extras: [...extras, task.label] };
      }
    }
    return merged;
  }, [aff, autoDeliveryTasks]);

  // ── Calcul de couverture globale ──
  const coverage = useMemo(() => {
    let totalNeeded = 0;
    let totalAffected = 0;
    const uncoveredPosts: Array<{ postId: string; label: string; needed: number; affected: number; deficit: number }> = [];

    for (const grp of activePosts) {
      for (const pid of grp.visiblePosts) {
        const pw = postWork[pid];
        if (!pw || pw.totalMin === 0) continue;

        // Un poste est couvert si les chantiers sont positionnés OU des opérateurs affectés
        let affMin = 0;
        for (let j = 0; j < 5; j++) {
          for (const d of ["am", "pm"]) {
            const cell = aff[ck(pid, j, d)];
            if (!cell) continue;
            // Compter 4h si le créneau a des chantiers OU des opérateurs
            if ((cell.cmds?.length || 0) > 0 || (cell.ops?.length || 0) > 0) {
              affMin += DEMI_MIN;
            }
          }
        }
        // Aussi compter les chantiers masqués (✓ fait) comme couverts
        for (const c of pw.cmds) {
          const ch = c.chantier || c.client;
          if (hiddenTasks.has(`${pid}|${ch}`)) affMin += c.min;
        }

        totalNeeded += pw.totalMin;
        totalAffected += Math.min(affMin, pw.totalMin);
        if (affMin < pw.totalMin) {
          uncoveredPosts.push({ postId: pid, label: POST_LABELS[pid] || pid, needed: pw.totalMin, affected: affMin, deficit: pw.totalMin - affMin });
        }
      }
    }
    const pct = totalNeeded > 0 ? Math.round(totalAffected / totalNeeded * 100) : 0;
    return { pct, totalNeeded, totalAffected, uncoveredPosts, complete: pct >= 100 };
  }, [activePosts, postWork, aff, hiddenTasks]);

  // ── Reporter les tâches non couvertes à la semaine suivante ──
  const reportNextWeek = useCallback(() => {
    if (!onPatch) return;
    const nextMonday = new Date(viewWeek + "T00:00:00");
    nextMonday.setDate(nextMonday.getDate() + 7);
    const nextWeekStr = localStr(nextMonday);

    // Pour chaque commande qui a une phase sur cette semaine avec un poste non couvert
    for (const cmd of commandes) {
      const s = (cmd as any).statut;
      if (s === "livre" || s === "terminee" || s === "annulee") continue;

      for (const ph of ["coupe", "montage", "vitrage", "logistique"]) {
        const field = PHASE_FIELD[ph];
        if ((cmd as any)[field] !== viewWeek) continue;

        // Vérifier si cette phase a des postes non couverts
        const routage = getRoutage(cmd.type, cmd.quantite, (cmd as any).hsTemps as Record<string, unknown> | null);
        const phasePostIds = routage.filter(e => e.phase === ph).map(e => e.postId);
        const hasUncovered = phasePostIds.some(pid => coverage.uncoveredPosts.some(u => u.postId === pid));

        if (hasUncovered) {
          onPatch(String(cmd.id), { [field]: nextWeekStr });
        }
      }
    }
  }, [commandes, viewWeek, coverage, onPatch]);

  const todayIdx = (() => {
    const today = localStr(new Date());
    for (let i = 0; i < 5; i++) {
      const d = new Date(viewWeek + "T00:00:00");
      d.setDate(d.getDate() + i);
      if (localStr(d) === today) return i;
    }
    return -1;
  })();

  if (loaded !== viewWeek) {
    return <div style={{ textAlign: "center", padding: 40, color: C.sec }}>Chargement...</div>;
  }

  if (activePosts.length === 0) {
    return <div style={{ textAlign: "center", padding: 40, color: C.sec }}>Aucun poste actif en {weekId(viewWeek)}.</div>;
  }

  return (
    <div>
      {/* ── Navigation semaine ── */}
      {onWeekChange && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <button onClick={() => { const d = new Date(viewWeek + "T00:00:00"); d.setDate(d.getDate() - 7); onWeekChange(localStr(d)); }} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, padding: "6px 12px", cursor: "pointer", fontSize: 14 }}>←</button>
          <button onClick={() => { const d = new Date(); const day = d.getDay(); d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); onWeekChange(localStr(d)); }} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.sec, padding: "6px 10px", cursor: "pointer", fontSize: 11 }}>Auj.</button>
          <button onClick={() => { const d = new Date(viewWeek + "T00:00:00"); d.setDate(d.getDate() + 7); onWeekChange(localStr(d)); }} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, padding: "6px 12px", cursor: "pointer", fontSize: 14 }}>→</button>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Affectations {weekId(viewWeek)}</div>
        </div>
      )}

      {/* ── Palettes opérateurs + chantiers + boutons ── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Palette opérateurs avec dispo restante */}
          <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 12px" }}>
            <div style={{ fontSize: 10, color: C.sec, marginBottom: 4, fontWeight: 700 }}>OPÉRATEURS — glisse vers un poste</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {ops.map(op => {
                const eq = EQUIPE.find(e => e.nom === op.nom);
                const baseMin = (eq?.h || 39) * 60;
                // Soustraire les absences RH
                const opRH = rhPlan[eq?.id || ""] || {};
                let absMin = 0;
                for (let j = 0; j < 5; j++) {
                  const d = new Date(viewWeek + "T00:00:00");
                  d.setDate(d.getDate() + j);
                  const dayDispo = opRH[localStr(d)];
                  if (dayDispo !== undefined && dayDispo === 0) {
                    absMin += j === 4 ? (eq?.h === 39 ? 420 : eq?.h === 36 ? 240 : eq?.h === 35 ? 420 : 450) : (eq?.h === 39 ? 480 : eq?.h === 36 ? 480 : eq?.h === 35 ? 420 : 450);
                  }
                }
                const dispoMin = Math.max(0, baseMin - absMin);
                // Heures réelles de tâches affectées
                let affMin = 0;
                for (const [key, cell] of Object.entries(aff)) {
                  if (!cell?.ops?.includes(op.nom)) continue;
                  const pid = key.split("|")[0];
                  const pw2 = postWork[pid];
                  const nbOps = cell.ops.length;
                  let cellWork = 0;
                  if (pw2 && cell.cmds?.length) {
                    for (const cl of cell.cmds) { const cm = pw2.cmds.find(c2 => (c2.chantier || c2.client) === cl); if (cm) cellWork += cm.min; }
                  }
                  if (cell.extras?.length) { for (const ext of cell.extras) { const m = ext.match(/\((\d+)h(\d+)?\)/); cellWork += m ? parseInt(m[1]) * 60 + (parseInt(m[2]) || 0) : DEMI_MIN; } }
                  if (cellWork === 0) cellWork = DEMI_MIN;
                  affMin += Math.round(Math.min(cellWork, DEMI_MIN) / nbOps);
                }
                const restant = Math.max(0, dispoMin - affMin);
                const full = restant <= 0;
                return (
                  <div key={op.id}
                    draggable={!full}
                    onDragStart={!full ? (e) => { setDragOp(op.nom); e.dataTransfer.effectAllowed = "copy"; } : undefined}
                    style={{
                      padding: "3px 8px", borderRadius: 4, userSelect: "none",
                      cursor: full ? "default" : "grab",
                      background: full ? C.s2 : OP_COLORS[op.key] || C.s2,
                      color: full ? C.muted : "#000",
                      fontSize: 10, fontWeight: 700,
                      opacity: full ? 0.4 : 1,
                    }}>
                    {op.nom} <span style={{ fontSize: 8, fontWeight: 400 }}>{hm(restant)}</span>
                    {full && <span style={{ fontSize: 8 }}> ✓</span>}
                  </div>
                );
              })}
            </div>
          </div>
          {/* Palette chantiers par poste — disparaît quand placé */}
          <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 12px" }}>
            <div style={{ fontSize: 10, color: C.sec, marginBottom: 4, fontWeight: 700 }}>CHANTIERS À PLACER — glisse vers une demi-journée</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {(() => {
                // Calculer heures affectées par chantier par poste
                // Un chantier sur un créneau = 1 demi-journée (4h) de couverture
                const affectedMinByPostCmd: Record<string, number> = {}; // "pid|chantier" → minutes
                for (const [key, cell] of Object.entries(aff)) {
                  if (!cell?.cmds?.length) continue;
                  const pid = key.split("|")[0];
                  for (const ch of cell.cmds) {
                    const k = `${pid}|${ch}`;
                    affectedMinByPostCmd[k] = (affectedMinByPostCmd[k] || 0) + DEMI_MIN;
                  }
                }
                return activePosts.map(grp => {
                  const postChantiers: Record<string, Array<{ ch: string; affected: number; needed: number }>> = {};
                  for (const pid of grp.visiblePosts || grp.posts) {
                    const pw = postWork[pid];
                    if (!pw) continue;
                    const remaining: Array<{ ch: string; affected: number; needed: number }> = [];
                    for (const c of pw.cmds) {
                      const ch = c.chantier || c.client;
                      if (hiddenTasks.has(`${pid}|${ch}`)) continue;
                      const affected = affectedMinByPostCmd[`${pid}|${ch}`] || 0;
                      if (affected < c.min) remaining.push({ ch, affected, needed: c.min });
                    }
                    if (remaining.length > 0) postChantiers[pid] = remaining;
                    if (remaining.length > 0) postChantiers[pid] = remaining;
                    if (remaining.length > 0) postChantiers[pid] = remaining;
                  }
                  const hasCmds = Object.values(postChantiers).some(v => v.length > 0);
                  if (!hasCmds) return null;
                  return (
                    <div key={grp.label}>
                      <div style={{ display: "flex", gap: 6, alignItems: "flex-start", flexWrap: "wrap" }}>
                        {Object.entries(postChantiers).map(([pid, items]) => (
                          <div key={pid} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: grp.color, minWidth: 22 }}>{pid}</span>
                            {(items as Array<{ ch: string; affected: number; needed: number }>).map(({ ch, affected, needed }) => (
                              <div key={`${pid}_${ch}`} draggable
                                onDragStart={(e) => { setDragOp(null); e.dataTransfer.setData("text/plain", `cmd:${ch}`); e.dataTransfer.effectAllowed = "copy"; }}
                                style={{ padding: "2px 6px", borderRadius: 3, cursor: "grab", userSelect: "none", background: grp.color + "22", border: `1px solid ${grp.color}44`, color: grp.color, fontSize: 9, fontWeight: 600 }}>
                                {ch} <span style={{ fontSize: 8, opacity: 0.7 }}>{hm(affected)}/{hm(needed)}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <button onClick={autoAssign} style={{ padding: "8px 16px", background: C.orange, border: "none", borderRadius: 4, color: "#000", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            Proposition auto
          </button>
          <button onClick={clearAll} style={{ padding: "6px 16px", background: C.s2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.sec, fontSize: 11, cursor: "pointer" }}>
            Tout effacer
          </button>
          <button onClick={runAudit} style={{ padding: "6px 16px", background: C.blue + "22", border: `1px solid ${C.blue}`, borderRadius: 4, color: C.blue, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
            Audit
          </button>
          <button onClick={printFiches} style={{ padding: "6px 16px", background: C.s2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.sec, fontSize: 11, cursor: "pointer" }}>
            Imprimer les fiches
          </button>
          <button onClick={toggleLock} style={{ padding: "6px 16px", background: locked ? C.red + "22" : C.s2, border: `1px solid ${locked ? C.red : C.border}`, borderRadius: 4, color: locked ? C.red : C.sec, fontSize: 11, cursor: "pointer", fontWeight: locked ? 700 : 400 }}>
            {locked ? "🔒 Figé" : "🔓 Figer"}
          </button>
          <span style={{ fontSize: 9, color: saving ? C.orange : locked ? C.red : C.green, textAlign: "center" }}>
            {saving ? "Sauvegarde..." : locked ? "Semaine figée" : "Sauvegardé"}
          </span>
        </div>
      </div>

      {/* ── Bandeau couverture ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", marginBottom: 12,
        background: coverage.complete ? C.green + "15" : C.orange + "15",
        border: `1px solid ${coverage.complete ? C.green : C.orange}`,
        borderRadius: 6,
      }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: coverage.complete ? C.green : coverage.pct >= 50 ? C.orange : C.red }}>
          {coverage.pct}%
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ height: 8, background: C.s2, borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
            <div style={{ width: `${coverage.pct}%`, height: "100%", background: coverage.complete ? C.green : coverage.pct >= 50 ? C.orange : C.red, borderRadius: 4 }} />
          </div>
          {coverage.complete ? (
            <div style={{ fontSize: 12, fontWeight: 700, color: C.green }}>Toutes les tâches sont couvertes pour {weekId(viewWeek)}</div>
          ) : (
            <div style={{ fontSize: 11, color: C.sec }}>
              <span style={{ fontWeight: 700, color: C.orange }}>{hm(coverage.totalNeeded - coverage.totalAffected)}</span> non couvertes —{" "}
              {coverage.uncoveredPosts.map(u => `${u.postId} (${hm(u.deficit)})`).join(", ")}
            </div>
          )}
        </div>
        {!coverage.complete && onPatch && (
          <button onClick={reportNextWeek} style={{
            padding: "8px 14px", background: C.orange, border: "none", borderRadius: 4,
            color: "#000", fontWeight: 700, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap",
          }}>
            Reporter à {weekId((() => { const d = new Date(viewWeek + "T00:00:00"); d.setDate(d.getDate() + 7); return localStr(d); })())}
          </button>
        )}
      </div>

      {/* ── Résultat audit ── */}
      {auditResult && (
        <div style={{ background: C.s1, border: `1px solid ${C.blue}`, borderRadius: 6, padding: "10px 14px", marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.blue }}>Audit {weekId(viewWeek)}</span>
            <button onClick={() => setAuditResult(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 12 }}>✕</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {auditResult.map((issue, i) => (
              <div key={i} style={{ fontSize: 11, color: issue.startsWith("✅") ? C.green : issue.startsWith("🔴") ? C.red : issue.startsWith("🟠") ? C.orange : C.sec }}>
                {issue}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Occupation opérateurs ── */}
      {(() => {
        // Calculer heures affectées par opérateur
        const opStats: Array<{ nom: string; key: string; affMin: number; dispoMin: number; pct: number; absentDays: number }> = [];
        for (const op of ops) {
          const eq = EQUIPE.find(e => e.nom === op.nom);
          // Calculer la dispo réelle en tenant compte des absences RH
          const baseMin = (eq?.h || 39) * 60;
          // Compter les jours d'absence cette semaine depuis le plan RH
          const opRH = rhPlan[eq?.id || ""] || {};
          let absMin = 0;
          let absentDays = 0;
          for (let i = 0; i < 5; i++) {
            const d = new Date(viewWeek + "T00:00:00");
            d.setDate(d.getDate() + i);
            const dayStr = localStr(d);
            const dayDispo = opRH[dayStr];
            if (dayDispo !== undefined && dayDispo === 0) {
              // Absent ce jour
              const isVendredi = i === 4;
              absMin += isVendredi ? (eq?.h === 39 ? 420 : eq?.h === 36 ? 240 : eq?.h === 35 ? 420 : 450) : (eq?.h === 39 ? 480 : eq?.h === 36 ? 480 : eq?.h === 35 ? 420 : 450);
              absentDays++;
            } else if (dayDispo !== undefined && dayDispo < 480) {
              // Demi-journée ou dispo réduite
              const normalMin = i === 4 ? (eq?.h === 39 ? 420 : eq?.h === 36 ? 240 : eq?.h === 35 ? 420 : 450) : 480;
              absMin += normalMin - dayDispo;
            }
          }
          const dispoMin = Math.max(0, baseMin - absMin);
          let affMin = 0;
          for (const [key, cell] of Object.entries(aff)) {
            if (!cell?.ops?.includes(op.nom)) continue;
            const pidOcc = key.split("|")[0];
            const pwOcc = postWork[pidOcc];
            const nbOpsOcc = cell.ops.length;
            let cellW = 0;
            if (pwOcc && cell.cmds?.length) { for (const cl of cell.cmds) { const cm = pwOcc.cmds.find(c2 => (c2.chantier || c2.client) === cl); if (cm) cellW += cm.min; } }
            if (cell.extras?.length) { for (const ext of cell.extras) { const m = ext.match(/\((\d+)h(\d+)?\)/); cellW += m ? parseInt(m[1]) * 60 + (parseInt(m[2]) || 0) : DEMI_MIN; } }
            if (cellW === 0) cellW = DEMI_MIN;
            affMin += Math.round(Math.min(cellW, DEMI_MIN) / nbOpsOcc);
          }
          opStats.push({ nom: op.nom, key: op.key, affMin, dispoMin, pct: dispoMin > 0 ? Math.round(affMin / dispoMin * 100) : 0, absentDays });
        }
        const avgPct = opStats.length > 0 ? Math.round(opStats.reduce((s, o) => s + o.pct, 0) / opStats.length) : 0;
        const overloaded = opStats.filter(o => o.pct > 100);
        const idle = opStats.filter(o => o.pct === 0);

        return (
          <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 14px", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Occupation opérateurs</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: avgPct > 90 ? C.red : avgPct > 60 ? C.orange : C.green }}>{avgPct}% moyen</span>
              {overloaded.length > 0 && <span style={{ fontSize: 10, color: C.red }}>⚠ {overloaded.map(o => o.nom).join(", ")} surchargé{overloaded.length > 1 ? "s" : ""}</span>}
              {idle.length > 0 && <span style={{ fontSize: 10, color: C.muted }}>{idle.length} non affecté{idle.length > 1 ? "s" : ""}</span>}
            </div>
            {/* Alerte journées vides par opérateur */}
            {(() => {
              const alerts: string[] = [];
              for (const op of opStats) {
                if (op.pct === 0) continue; // déjà listé comme non affecté
                const eq = EQUIPE.find(e => e.nom === op.nom);
                for (let j = 0; j < 5; j++) {
                  if (j === 4 && eq?.vendrediOff) continue;
                  let hasSlot = false;
                  for (const d of ["am", "pm"]) {
                    for (const [key, cell] of Object.entries(aff)) {
                      if (!cell?.ops?.includes(op.nom)) continue;
                      const parts = key.split("|");
                      if (parseInt(parts[1]) === j && parts[2] === d) { hasSlot = true; break; }
                    }
                    if (hasSlot) break;
                  }
                  if (!hasSlot) alerts.push(`${op.nom} ${JOURS[j]}`);
                }
              }
              if (alerts.length === 0) return null;
              return (
                <div style={{ fontSize: 10, color: C.orange, marginBottom: 4 }}>
                  ⚠ Journées vides : {alerts.join(" · ")}
                </div>
              );
            })()}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {opStats.map(o => {
                const barCol = o.pct > 100 ? C.red : o.pct > 80 ? C.orange : o.pct > 0 ? C.green : C.muted;
                return (
                  <div key={o.nom} style={{ width: 75, background: C.bg, border: `1px solid ${o.pct > 100 ? C.red : C.border}`, borderRadius: 4, padding: "4px 6px", textAlign: "center" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: OP_COLORS[o.key] || C.sec, marginBottom: 2 }}>{o.nom}</div>
                    <div style={{ height: 4, background: C.s2, borderRadius: 2, overflow: "hidden", marginBottom: 2 }}>
                      <div style={{ width: `${Math.min(o.pct, 100)}%`, height: "100%", background: barCol, borderRadius: 2 }} />
                    </div>
                    <div style={{ fontSize: 9, color: barCol, fontWeight: 700 }}>{o.pct}%</div>
                    <div style={{ fontSize: 8, color: C.muted }}>{hm(o.affMin)}/{hm(o.dispoMin)}</div>
                    {o.absentDays > 0 && <div style={{ fontSize: 7, color: C.red }}>absent {o.absentDays}j</div>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── Grille ── */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ padding: "6px 8px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "left", fontSize: 10, color: C.sec, width: 130 }}>POSTE</th>
              <th style={{ padding: "6px 4px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 10, color: C.sec, width: 50 }}>CHARGE</th>
              {JOURS.map((j, jIdx) => ["AM", "PM"].map(d => (
                <th key={`${j}_${d}`} style={{
                  padding: "4px 2px", background: jIdx === todayIdx ? C.s2 : C.s1,
                  border: `1px solid ${jIdx === todayIdx ? C.orange : C.border}`,
                  textAlign: "center", fontSize: 9, color: jIdx === todayIdx ? C.orange : C.sec, minWidth: 75,
                }}>
                  {j} {d}
                </th>
              )))}
            </tr>
            {/* Ligne % couverture opérateurs par demi-journée */}
            <tr>
              <th colSpan={2} style={{ padding: "4px 6px", background: C.s2, border: `1px solid ${C.border}`, fontSize: 9, color: C.sec, textAlign: "left" }}>% couvert</th>
              {JOURS.map((j, jIdx) => ["am", "pm"].map(demi => {
                // Scanner TOUTES les cellules de ce créneau (tous postes)
                let workSlots = 0; // nombre de postes avec du travail
                let opsSlots = 0;  // nombre de postes avec des opérateurs
                for (const [key, cell] of Object.entries(aff)) {
                  const parts = key.split("|");
                  if (parseInt(parts[1]) !== jIdx || parts[2] !== demi) continue;
                  if (!cell) continue;
                  const hasWork = (cell.cmds?.length || 0) > 0 || (cell.extras?.length || 0) > 0;
                  const hasOps = (cell.ops?.length || 0) > 0;
                  if (hasWork) workSlots++;
                  if (hasWork && hasOps) opsSlots++;
                }
                const pct = workSlots > 0 ? Math.round(opsSlots / workSlots * 100) : 0;
                const hasWork = workSlots > 0;
                const col = !hasWork ? C.muted : pct >= 100 ? C.green : pct >= 50 ? C.orange : C.red;
                return (
                  <th key={`cov_${j}_${demi}`} style={{ padding: "3px 2px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center" }}>
                    {hasWork ? (
                      <span style={{ fontSize: 10, fontWeight: 800, color: col }}>{pct}%</span>
                    ) : (
                      <span style={{ fontSize: 9, color: C.muted }}>—</span>
                    )}
                  </th>
                );
              }))}
            </tr>
          </thead>
          <tbody>
            {activePosts.map(grp => [
              <tr key={`h-${grp.label}`}>
                <td colSpan={2 + 10} style={{ padding: "5px 8px", background: grp.color + "15", borderBottom: `2px solid ${grp.color}`, fontSize: 10, fontWeight: 700, color: grp.color, textTransform: "uppercase", letterSpacing: 1 }}>
                  {grp.label}
                  {/* Postes entièrement faits (tous chantiers cochés) */}
                  {grp.allPosts.filter(p => !grp.visiblePosts.includes(p)).length > 0 && (
                    <span style={{ fontWeight: 400, fontSize: 9, marginLeft: 8, color: C.green, textTransform: "none" }}>
                      ✓ {grp.allPosts.filter(p => !grp.visiblePosts.includes(p)).map(p => p).join(", ")}
                    </span>
                  )}
                </td>
              </tr>,
              ...grp.visiblePosts.map(pid => {
                const pw = postWork[pid] || { totalMin: 0, cmds: [] };
                const minPers = grp.phase === "coupe" ? 2 : 1;
                const persNeeded = pw.totalMin > 0 ? Math.max(minPers, Math.ceil(pw.totalMin / DEMI_MIN / 10)) : 0;
                const maxWeek = POST_MAX_WEEK[pid];
                const overCapacity = maxWeek ? pw.totalMin > maxWeek : false;
                let affMin = 0;
                for (let j = 0; j < 5; j++) for (const d of ["am", "pm"]) affMin += (aff[ck(pid, j, d)]?.ops?.length || 0) * DEMI_MIN;
                const pct = pw.totalMin > 0 ? Math.min(100, Math.round(affMin / pw.totalMin * 100)) : 0;
                const barCol = pct >= 100 ? C.green : pct >= 50 ? C.orange : C.red;

                return (
                  <tr key={pid} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "4px 6px", background: C.s1, border: `1px solid ${C.border}`, verticalAlign: "top" }}>
                      <div style={{ fontWeight: 700, color: grp.color, fontSize: 11 }}>{pid} <span style={{ fontWeight: 400, color: C.muted, fontSize: 8 }}>{POST_LABELS[pid]}</span></div>
                      {pw.cmds.map((c, ci) => {
                        const ch = c.chantier || c.client;
                        const isDone = hiddenTasks.has(`${pid}|${ch}`);
                        return (
                          <div key={ci} style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 2, opacity: isDone ? 0.4 : 1 }}>
                            <button onClick={() => toggleHideTask(pid, ch)} style={{
                              width: 14, height: 14, borderRadius: 3, border: `1px solid ${isDone ? C.green : C.muted}`,
                              background: isDone ? C.green : "none", color: isDone ? "#000" : C.muted,
                              fontSize: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0,
                            }}>{isDone ? "✓" : ""}</button>
                            <span style={{ fontSize: 9, color: isDone ? C.muted : C.sec, textDecoration: isDone ? "line-through" : "none" }}>{ch}</span>
                          </div>
                        );
                      })}
                      <div style={{ fontSize: 9, color: C.sec, marginTop: 2 }}>{pw.cmds.length} cmd</div>
                    </td>
                    <td style={{ padding: "4px", border: `1px solid ${overCapacity ? C.red : C.border}`, textAlign: "center", verticalAlign: "top" }}>
                      <div className="mono" style={{ fontWeight: 700, color: overCapacity ? C.red : grp.color }}>{hm(pw.totalMin)}</div>
                      {maxWeek && <div style={{ fontSize: 8, color: overCapacity ? C.red : C.muted }}>max {hm(maxWeek)}</div>}
                      {overCapacity && <div style={{ fontSize: 8, color: C.red, fontWeight: 700 }}>SURCHARGE</div>}
                      <div style={{ fontSize: 9, color: grp.color, fontWeight: 700 }}>{persNeeded}p.</div>
                      <div style={{ height: 4, background: C.s2, borderRadius: 2, overflow: "hidden", marginTop: 2 }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: barCol, borderRadius: 2 }} />
                      </div>
                    </td>
                    {JOURS.map((j, jIdx) => ["am", "pm"].map(demi => {
                      const key = ck(pid, jIdx, demi);
                      const cell = affWithAuto[key] || { ops: [], cmds: [] };
                      const hasContent = cell.ops.length > 0 || cell.cmds.length > 0;
                      const isTarget = dropTarget === key;
                      return (
                        <td key={`${j}_${demi}`}
                          onDragOver={(e) => { e.preventDefault(); setDropTarget(key); }}
                          onDragLeave={() => { if (dropTarget === key) setDropTarget(null); }}
                          onDrop={(ev) => onDrop(key, ev)}
                          style={{
                            padding: "3px 3px",
                            border: `1px solid ${isTarget ? C.orange : jIdx === todayIdx ? C.orange + "44" : C.border}`,
                            background: isTarget ? grp.color + "18" : hasContent ? grp.color + "08" : C.bg,
                            verticalAlign: "top",
                          }}
                        >
                          {/* Chantiers affectés à ce créneau */}
                          {cell.cmds.length > 0 && (
                            <div style={{ marginBottom: 2 }}>
                              {cell.cmds.map(cmdLabel => {
                                // Trouver la commande correspondante
                                const matchCmd = commandes.find(c => {
                                  const ch = (c as any).ref_chantier || (c as any).client;
                                  return ch === cmdLabel;
                                });
                                return (
                                  <div key={cmdLabel} style={{
                                    fontSize: 8, padding: "2px 4px", borderRadius: 2, marginBottom: 1,
                                    background: grp.color + "20", borderLeft: `2px solid ${grp.color}`,
                                    display: "flex", alignItems: "center", justifyContent: "space-between",
                                  }}>
                                    <span
                                      onClick={() => { if (matchCmd) setDetailCmd({ chantier: cmdLabel, cmdId: String(matchCmd.id), cmd: matchCmd }); }}
                                      style={{ fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: matchCmd ? "pointer" : "default", textDecoration: matchCmd ? "underline" : "none", textDecorationColor: grp.color + "66" }}
                                    >{cmdLabel}</span>
                                    <span onClick={() => toggleCmd(key, cmdLabel)} style={{ cursor: "pointer", fontSize: 7, color: C.muted, marginLeft: 2 }}>✕</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {/* Opérateurs affectés */}
                          {cell.ops.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                              {cell.ops.map(opNom => {
                                const op = ops.find(o => o.nom === opNom);
                                return (
                                  <div key={opNom} style={{
                                    display: "flex", alignItems: "center", justifyContent: "space-between",
                                    padding: "1px 4px", borderRadius: 3,
                                    background: OP_COLORS[op?.key || ""] || C.s2,
                                    color: "#000", fontSize: 8, fontWeight: 700,
                                  }}>
                                    {opNom}
                                    <span onClick={() => removeOp(key, opNom)} style={{ cursor: "pointer", marginLeft: 2, fontSize: 7, opacity: 0.6 }}>✕</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {/* Tâches extras affectées */}
                          {(cell.extras || []).length > 0 && (
                            <div style={{ marginTop: 2 }}>
                              {(cell.extras || []).map(ext => {
                                const isInterv = ext.toLowerCase().includes("interv");
                                const isSuperv = ext.toLowerCase().includes("superv");
                                const col = isInterv ? C.red : isSuperv ? C.yellow : C.purple;
                                return (
                                  <div key={ext} style={{ fontSize: 8, padding: "1px 4px", borderRadius: 2, marginBottom: 1, background: col + "22", color: col, fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
                                    <span>{isInterv ? "🔧" : isSuperv ? "👁" : "📋"} {ext}</span>
                                    <span onClick={() => toggleExtra(key, ext)} style={{ cursor: "pointer", opacity: 0.6 }}>✕</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {/* Les chantiers se glissent depuis la palette en haut */}
                          {!hasContent && (
                            <div style={{ color: C.muted, textAlign: "center", padding: "4px 0", fontSize: 9 }}>
                              {isTarget ? "▼" : "+"}
                            </div>
                          )}
                        </td>
                      );
                    }))}
                  </tr>
                );
              }),
            ])}
          </tbody>
        </table>
      </div>

      {/* ── Tâches prédéfinies + personnalisées ── */}
      <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 14px", marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>TÂCHES — glisse autant de fois que nécessaire</div>

        <div style={{ fontSize: 10, color: C.sec, marginBottom: 4 }}>
          <span style={{ fontWeight: 700 }}>TÂCHES FIXES HEBDOMADAIRES</span> — obligatoires chaque semaine
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
          {[
            { label: "C1 Déchargement fournisseur", min: 120, icon: "📦", color: "#42A5F5" },
            { label: "C2 Préparation profilés", min: 480, icon: "🔧", color: "#42A5F5" },
            { label: "V3 Emballage", min: 240, icon: "📦", color: "#26C6DA" },
            { label: "L6 Mise sur palette", min: 240, icon: "📦", color: "#CE93D8" },
            { label: "L7 Chargement client", min: 240, icon: "🚛", color: "#CE93D8" },
          ].map(t => (
            <div key={t.label} draggable
              onDragStart={e => { setDragOp(null); e.dataTransfer.setData("text/plain", `extra:${t.label} (${hm(t.min)})`); e.dataTransfer.effectAllowed = "copy"; }}
              style={{ padding: "4px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: "grab", userSelect: "none",
                background: t.color + "22", border: `2px solid ${t.color}44`, color: t.color,
                display: "flex", alignItems: "center", gap: 4,
              }}>
              {t.icon} {t.label} ({hm(t.min)})
            </div>
          ))}
        </div>

        <div style={{ fontSize: 10, color: C.sec, marginBottom: 4, marginTop: 8 }}>
          <span style={{ fontWeight: 700 }}>AUTRES TÂCHES</span> — glisse autant de fois que nécessaire
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
          {[
            { label: "Déchargement vitrage fournisseur", min: 480, icon: "🪟", color: "#4DB6AC" },
            { label: "Rangement stock", min: 60, icon: "🏗", color: C.purple },
            { label: "Nettoyage machines", min: 30, icon: "🧹", color: C.muted },
            { label: "Supervision", min: 240, icon: "👁", color: C.yellow },
            { label: "Intervention SAV", min: 120, icon: "🔧", color: C.red },
            { label: "Formation", min: 240, icon: "📚", color: C.blue },
            { label: "Maintenance", min: 60, icon: "⚙", color: C.muted },
          ].map(t => (
            <div key={t.label} draggable
              onDragStart={e => { setDragOp(null); e.dataTransfer.setData("text/plain", `extra:${t.label} (${hm(t.min)})`); e.dataTransfer.effectAllowed = "copy"; }}
              style={{ padding: "4px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: "grab", userSelect: "none",
                background: t.color + "22", border: `1px solid ${t.color}44`, color: t.color,
                display: "flex", alignItems: "center", gap: 4,
              }}>
              {t.icon} {t.label} ({hm(t.min)})
            </div>
          ))}
        </div>

        {/* Tâches personnalisées de la semaine */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 10, color: C.sec }}>Personnalisée :</span>
          <input value={newExtra.label} onChange={e => setNewExtra(p => ({ ...p, label: e.target.value }))} placeholder="Nom de la tâche"
            style={{ width: 180, padding: "4px 8px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontSize: 11 }} />
          <input type="number" value={newExtra.min} onChange={e => setNewExtra(p => ({ ...p, min: e.target.value }))} placeholder="min"
            style={{ width: 50, padding: "4px 6px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontSize: 11, textAlign: "center" }} />
          <button onClick={addExtra} style={{ padding: "4px 12px", background: C.orange, border: "none", borderRadius: 4, color: "#000", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>+</button>
          {extraTasks.map(t => (
            <div key={t.id} draggable
              onDragStart={e => { setDragOp(null); e.dataTransfer.setData("text/plain", `extra:${t.label} (${hm(t.min)})`); e.dataTransfer.effectAllowed = "copy"; }}
              style={{ padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: "grab", userSelect: "none",
                background: C.orange + "22", border: `1px solid ${C.orange}44`, color: C.orange,
                display: "flex", alignItems: "center", gap: 4,
              }}>
              📋 {t.label} ({hm(t.min)})
              <span onClick={() => removeExtra(t.id)} style={{ cursor: "pointer", opacity: 0.6, fontSize: 8 }}>✕</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Popup détail chantier ── */}
      {detailCmd && (() => {
        const cmd = detailCmd.cmd;
        const lignes = Array.isArray(cmd.lignes) && cmd.lignes.length > 0 ? cmd.lignes : [{ type: cmd.type, quantite: cmd.quantite }];
        // Agréger par poste (une seule ligne par poste)
        const postTotals: Record<string, { label: string; min: number; phase: string }> = {};
        for (const ligne of lignes) {
          const lType = ligne.type || cmd.type;
          if (lType === "intervention_chantier") continue;
          const lQte = parseInt(ligne.quantite) || cmd.quantite || 1;
          const lHs = lType === "hors_standard" ? { t_coupe: ligne.hs_t_coupe, t_montage: ligne.hs_t_montage, t_vitrage: ligne.hs_t_vitrage } : cmd.hsTemps;
          const routage = getRoutage(lType, lQte, lHs as Record<string, unknown> | null);
          for (const e of routage) {
            if (!postTotals[e.postId]) postTotals[e.postId] = { label: e.label, min: 0, phase: e.phase };
            postTotals[e.postId].min += e.estimatedMin;
          }
        }
        // Appliquer les overrides par commande
        const allEtapes = Object.entries(postTotals).map(([postId, data]) => {
          const ov = cmdOverrides[postId];
          return { postId, label: data.label, min: ov !== undefined ? ov : data.min, phase: data.phase, isOverridden: ov !== undefined };
        });
        const nbLignes = lignes.length;
        const PHASE_C: Record<string, string> = { coupe: "#42A5F5", montage: "#FFA726", vitrage: "#26C6DA", logistique: "#CE93D8" };
        const totalMin = allEtapes.reduce((s, e) => s + e.min, 0);

        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setDetailCmd(null)}>
            <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 8, padding: "20px 24px", minWidth: 400, maxWidth: 600, maxHeight: "80vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{detailCmd.chantier}</div>
                  <div style={{ fontSize: 12, color: C.sec }}>{cmd.client}{nbLignes > 1 ? ` · ${nbLignes} lignes` : ` · ${cmd.quantite}× ${(TYPES_MENUISERIE as Record<string, any>)[cmd.type]?.label || cmd.type}`}</div>
                </div>
                <button onClick={() => setDetailCmd(null)} style={{ background: "none", border: "none", color: C.sec, cursor: "pointer", fontSize: 18 }}>✕</button>
              </div>

              {/* Nombre de barres LMT (C3) — temps dépend du nb de personnes */}
              {(() => {
                const nbBarres = cmdOverrides["_nb_barres_lmt"] || 0;
                // Barres/8h selon le nombre de personnes
                const RATES = [
                  { pers: 1, barres8h: 50, minPerBar: 480 / 50 },   // 9.6 min/barre
                  { pers: 2, barres8h: 80, minPerBar: 480 / 80 },   // 6 min/barre
                  { pers: 3, barres8h: 120, minPerBar: 480 / 120 },  // 4 min/barre
                ];
                // Compter combien d'opérateurs sont sur C3 dans la grille (prendre le max d'une demi-journée)
                let maxOpsOnC3 = 0;
                for (const [key, cell] of Object.entries(affWithAuto)) {
                  if (key.startsWith("C3|") && cell?.ops?.length) {
                    maxOpsOnC3 = Math.max(maxOpsOnC3, cell.ops.length);
                  }
                }
                const currentPers = maxOpsOnC3 || 2; // par défaut 2 personnes
                const currentRate = RATES.find(r => r.pers === currentPers) || RATES[1];

                const saveBarres = (v: number) => {
                  const c3Min = v > 0 ? Math.round(v * currentRate.minPerBar) : 0;
                  fetch(`/api/planning/affectations?semaine=cmd_temps_${detailCmd.cmdId}`)
                    .then(r => r.ok ? r.json() : {})
                    .then(existing => {
                      const ov: Record<string, number> = (typeof existing === "object" && existing && !Array.isArray(existing)) ? { ...existing } : {};
                      ov["_nb_barres_lmt"] = v;
                      if (c3Min > 0) ov["C3"] = c3Min;
                      return fetch("/api/planning/affectations", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ semaine: `cmd_temps_${detailCmd.cmdId}`, affectations: ov }) });
                    }).catch(() => {});
                  setAllCmdOverrides(prev => ({ ...prev, [detailCmd.cmdId]: { ...(prev[detailCmd.cmdId] || {}), _nb_barres_lmt: v, C3: c3Min } }));
                };

                return (
                  <div style={{ marginBottom: 8, padding: "8px 10px", background: C.bg, borderRadius: 4, border: `1px solid #42A5F5` + "44" }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 6 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#42A5F5" }}>C3 — Barres LMT</div>
                      </div>
                      <input type="number" min={0} defaultValue={nbBarres || ""} placeholder="Nb barres"
                        onBlur={ev => { const v = parseInt(ev.target.value); if (!isNaN(v)) saveBarres(v); }}
                        onKeyDown={ev => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }}
                        style={{ width: 70, padding: "4px 6px", fontSize: 13, fontWeight: 700, background: C.s1, border: `1px solid ${C.border}`, borderRadius: 4, color: "#42A5F5", textAlign: "center", outline: "none" }} />
                    </div>
                    {nbBarres > 0 && (
                      <div style={{ display: "flex", gap: 8 }}>
                        {RATES.map(r => {
                          const mins = Math.round(nbBarres * r.minPerBar);
                          const isCurrent = r.pers === currentPers;
                          return (
                            <div key={r.pers} style={{ flex: 1, padding: "4px 8px", borderRadius: 4, textAlign: "center",
                              background: isCurrent ? "#42A5F5" + "22" : C.s1,
                              border: `1px solid ${isCurrent ? "#42A5F5" : C.border}`,
                            }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: isCurrent ? "#42A5F5" : C.sec }}>{r.pers} pers.</div>
                              <div style={{ fontSize: 9, color: C.muted }}>{r.barres8h} barres/8h</div>
                              <div className="mono" style={{ fontSize: 12, fontWeight: 800, color: isCurrent ? "#42A5F5" : C.sec }}>{hm(mins)}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Nombre de plaques ISULA */}
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                {[
                  { key: "_nb_plaques_lisec", label: "IL — Plaques Lisec", minPerPlaque: 15, color: "#4DB6AC" },
                  { key: "_nb_plaques_bottero", label: "IB — Plaques Bottero", minPerPlaque: 40, color: "#4DB6AC" },
                ].map(machine => {
                  const nbPlaques = cmdOverrides[machine.key] || 0;
                  const savePlaques = (v: number) => {
                    const postId = machine.key === "_nb_plaques_lisec" ? "IL" : "IB";
                    const mins = v > 0 ? Math.round(v * machine.minPerPlaque) : 0;
                    fetch(`/api/planning/affectations?semaine=cmd_temps_${detailCmd.cmdId}`)
                      .then(r => r.ok ? r.json() : {})
                      .then(existing => {
                        const ov: Record<string, number> = (typeof existing === "object" && existing && !Array.isArray(existing)) ? { ...existing } : {};
                        ov[machine.key] = v;
                        if (mins > 0) ov[postId] = mins;
                        return fetch("/api/planning/affectations", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ semaine: `cmd_temps_${detailCmd.cmdId}`, affectations: ov }) });
                      }).catch(() => {});
                    setAllCmdOverrides(prev => ({ ...prev, [detailCmd.cmdId]: { ...(prev[detailCmd.cmdId] || {}), [machine.key]: v, [machine.key === "_nb_plaques_lisec" ? "IL" : "IB"]: mins } }));
                  };
                  return (
                    <div key={machine.key} style={{ flex: 1, padding: "6px 8px", background: C.bg, borderRadius: 4, border: `1px solid ${machine.color}44` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: machine.color }}>{machine.label}</span>
                        <span style={{ fontSize: 8, color: C.muted }}>{machine.minPerPlaque} min/plaque · min 2 pers.</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input type="number" min={0} defaultValue={nbPlaques || ""} placeholder="Nb plaques"
                          onBlur={ev => { const v = parseInt(ev.target.value); if (!isNaN(v)) savePlaques(v); }}
                          onKeyDown={ev => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }}
                          style={{ width: 60, padding: "3px 6px", fontSize: 12, fontWeight: 700, background: C.s1, border: `1px solid ${C.border}`, borderRadius: 4, color: machine.color, textAlign: "center", outline: "none" }} />
                        {nbPlaques > 0 && <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: machine.color }}>{hm(Math.round(nbPlaques * machine.minPerPlaque))}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* I4 Assemblage vitrage isolant */}
              {(() => {
                const nbVI = cmdOverrides["_nb_vitrages_isolants"] || 0;
                let maxOpsI4Popup = 0;
                for (const [k, cell] of Object.entries(affWithAuto)) {
                  if (k.startsWith("I4|") && cell?.ops?.length) maxOpsI4Popup = Math.max(maxOpsI4Popup, cell.ops.length);
                }
                const curPers = maxOpsI4Popup || 3;
                const RATES_I4 = [
                  { pers: 2, perDay: Math.round(20 * 2 / 3), minPer: Math.round(480 / (20 * 2 / 3)) },
                  { pers: 3, perDay: 20, minPer: 24 },
                  { pers: 4, perDay: Math.round(20 * 4 / 3), minPer: Math.round(480 / (20 * 4 / 3)) },
                ];
                const saveVI = (v: number) => {
                  const minPer = Math.round(480 / (20 * curPers / 3));
                  const mins = v > 0 ? v * minPer : 0;
                  fetch(`/api/planning/affectations?semaine=cmd_temps_${detailCmd.cmdId}`)
                    .then(r => r.ok ? r.json() : {})
                    .then(existing => {
                      const ov: Record<string, number> = (typeof existing === "object" && existing && !Array.isArray(existing)) ? { ...existing } : {};
                      ov["_nb_vitrages_isolants"] = v;
                      if (mins > 0) ov["I4"] = mins;
                      return fetch("/api/planning/affectations", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ semaine: `cmd_temps_${detailCmd.cmdId}`, affectations: ov }) });
                    }).catch(() => {});
                  setAllCmdOverrides(prev => ({ ...prev, [detailCmd.cmdId]: { ...(prev[detailCmd.cmdId] || {}), _nb_vitrages_isolants: v, I4: v > 0 ? v * Math.round(480 / (20 * curPers / 3)) : 0 } }));
                };
                return (
                  <div style={{ marginBottom: 8, padding: "8px 10px", background: C.bg, borderRadius: 4, border: `1px solid #4DB6AC44` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#4DB6AC" }}>I4 — Assemblage vitrage isolant</div>
                      </div>
                      <input type="number" min={0} defaultValue={nbVI || ""} placeholder="Nb vitrages"
                        onBlur={ev => { const v = parseInt(ev.target.value); if (!isNaN(v)) saveVI(v); }}
                        onKeyDown={ev => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }}
                        style={{ width: 70, padding: "4px 6px", fontSize: 13, fontWeight: 700, background: C.s1, border: `1px solid ${C.border}`, borderRadius: 4, color: "#4DB6AC", textAlign: "center", outline: "none" }} />
                    </div>
                    {nbVI > 0 && (
                      <div style={{ display: "flex", gap: 6 }}>
                        {RATES_I4.map(r => {
                          const mins = nbVI * r.minPer;
                          const isCur = r.pers === curPers;
                          return (
                            <div key={r.pers} style={{ flex: 1, padding: "3px 6px", borderRadius: 4, textAlign: "center", background: isCur ? "#4DB6AC22" : C.s1, border: `1px solid ${isCur ? "#4DB6AC" : C.border}` }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: isCur ? "#4DB6AC" : C.sec }}>{r.pers} pers.</div>
                              <div style={{ fontSize: 8, color: C.muted }}>{r.perDay} VI/jour</div>
                              <div className="mono" style={{ fontSize: 11, fontWeight: 800, color: isCur ? "#4DB6AC" : C.sec }}>{hm(mins)}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div style={{ fontSize: 11, color: C.orange, fontWeight: 700, marginBottom: 4 }}>
                Total : {hm(totalMin)} · {allEtapes.length} étapes
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ padding: "4px 8px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "left", fontSize: 10, color: C.sec }}>POSTE</th>
                    <th style={{ padding: "4px 8px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "left", fontSize: 10, color: C.sec }}>ÉTAPE</th>
                    <th style={{ padding: "4px 8px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 10, color: C.sec, width: 80 }}>TEMPS (min)</th>
                    <th style={{ padding: "4px 8px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 10, color: C.sec, width: 120 }}>SEMAINE</th>
                  </tr>
                </thead>
                <tbody>
                  {allEtapes.map((e, i) => (
                    <tr key={i}>
                      <td style={{ padding: "4px 8px", border: `1px solid ${C.border}` }}>
                        <span style={{ fontWeight: 700, color: PHASE_C[e.phase] || C.sec }}>{e.postId}</span>
                      </td>
                      <td style={{ padding: "4px 8px", border: `1px solid ${C.border}`, color: C.sec }}>
                        {e.label}
                        {e.isOverridden && <span style={{ fontSize: 8, color: C.orange, marginLeft: 4 }}>modifié</span>}
                      </td>
                      <td style={{ padding: "2px 4px", border: `1px solid ${C.border}`, textAlign: "center" }}>
                        <input
                          type="number"
                          min={0}
                          defaultValue={e.min}
                          onBlur={(ev) => {
                            const v = parseInt(ev.target.value);
                            if (isNaN(v) || v === e.min) return;
                            // Sauvegarder par commande (pas par type)
                            fetch(`/api/planning/affectations?semaine=cmd_temps_${detailCmd.cmdId}`)
                              .then(r => r.ok ? r.json() : {})
                              .then(existing => {
                                const overrides: Record<string, number> = (typeof existing === "object" && existing && !Array.isArray(existing)) ? { ...existing } : {};
                                overrides[e.postId] = v;
                                return fetch("/api/planning/affectations", {
                                  method: "PUT",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ semaine: `cmd_temps_${detailCmd.cmdId}`, affectations: overrides }),
                                });
                              })
                              .catch(() => {});
                            ev.target.style.color = C.orange;
                            // Mettre à jour localement pour recalcul immédiat
                            setAllCmdOverrides(prev => {
                              const next = { ...prev };
                              if (!next[detailCmd.cmdId]) next[detailCmd.cmdId] = {};
                              next[detailCmd.cmdId] = { ...next[detailCmd.cmdId], [e.postId]: v };
                              return next;
                            });
                          }}
                          onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }}
                          style={{
                            width: 50, padding: "3px 4px", fontSize: 12, fontWeight: 700,
                            background: C.bg, border: `1px solid ${C.border}`, borderRadius: 3,
                            color: PHASE_C[e.phase] || C.sec, textAlign: "center", outline: "none",
                          }}
                        />
                      </td>
                      <td style={{ padding: "2px 4px", border: `1px solid ${C.border}`, textAlign: "center" }}>
                        {(() => {
                          // Trouver la phase du poste → le champ semaine correspondant
                          const grp = POST_GROUPS.find(g => g.ids.includes(e.postId));
                          const field = grp ? PHASE_FIELD[grp.phase] : null;
                          const currentWeek = field ? (cmd as any)[field] || "" : "";
                          const wkOpts = (() => {
                            const opts: Array<{ v: string; l: string }> = [];
                            const mon = new Date(); const day = mon.getDay(); mon.setDate(mon.getDate() - (day === 0 ? 6 : day - 1));
                            for (let i = -2; i < 14; i++) {
                              const d = new Date(mon); d.setDate(d.getDate() + i * 7);
                              const ms = localStr(d);
                              opts.push({ v: ms, l: weekId(ms) });
                            }
                            return opts;
                          })();
                          return field && onPatch ? (
                            <select value={currentWeek} onChange={ev => onPatch(detailCmd.cmdId, { [field]: ev.target.value || null })}
                              style={{ padding: "2px 4px", fontSize: 10, background: currentWeek === viewWeek ? (PHASE_C[e.phase] || C.s2) + "22" : C.bg, border: `1px solid ${C.border}`, borderRadius: 3, color: C.text, cursor: "pointer" }}>
                              <option value="">—</option>
                              {wkOpts.map(w => <option key={w.v} value={w.v}>{w.l}</option>)}
                            </select>
                          ) : <span style={{ color: C.muted }}>—</span>;
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Règle ISULA S-1 */}
              {(() => {
                const semMontage = (cmd as any).semaine_montage || (cmd as any).semaine_coupe || "";
                const semIsula = (cmd as any).semaine_isula || "";
                if (semMontage && semIsula) {
                  const monMontage = new Date(semMontage + "T00:00:00");
                  const monIsula = new Date(semIsula + "T00:00:00");
                  const isulaOk = monIsula.getTime() <= monMontage.getTime() - 7 * 86400000;
                  if (!isulaOk) {
                    return (
                      <div style={{ marginTop: 6, padding: "6px 10px", background: C.red + "15", border: `1px solid ${C.red}`, borderRadius: 4, fontSize: 10, color: C.red }}>
                        ⚠ Le vitrage ISULA ({weekId(semIsula)}) doit être terminé au moins 1 semaine avant le montage SIAL ({weekId(semMontage)}). Décaler ISULA en {weekId(localStr(new Date(monMontage.getTime() - 7 * 86400000)))} ou avant.
                      </div>
                    );
                  }
                }
                return null;
              })()}

              {/* Bouton Enregistrer */}
              <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={() => {
                  // Forcer la sauvegarde de tous les overrides
                  const ov = allCmdOverrides[detailCmd.cmdId] || {};
                  fetch("/api/planning/affectations", {
                    method: "PUT", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ semaine: `cmd_temps_${detailCmd.cmdId}`, affectations: ov }),
                  }).then(() => {
                    const btn = document.getElementById("save-btn-" + detailCmd.cmdId);
                    if (btn) { btn.textContent = "✓ Enregistré !"; btn.style.background = C.green; setTimeout(() => { btn.textContent = "Enregistrer"; btn.style.background = C.orange; }, 2000); }
                  }).catch(() => {});
                }} id={`save-btn-${detailCmd.cmdId}`}
                  style={{ padding: "8px 24px", background: C.orange, border: "none", borderRadius: 4, color: "#000", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  Enregistrer
                </button>
                <button onClick={() => setDetailCmd(null)}
                  style={{ padding: "8px 16px", background: C.s2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.sec, fontSize: 12, cursor: "pointer" }}>
                  Fermer
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
