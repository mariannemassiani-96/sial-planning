"use client";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { C, EQUIPE, hm, CommandeCC } from "@/lib/sial-data";
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
  { label: "ISULA",         color: "#4DB6AC", phase: "isula", competence: "isula", ids: ["I1","I2","I3","I4","I5","I6","I7","I8"] },
];
const POST_LABELS: Record<string, string> = {
  C2:"Prépa barres",C3:"Coupe LMT",C4:"Coupe 2 têtes",C5:"Renfort acier",C6:"Soudure PVC",
  M1:"Dorm. couliss.",M2:"Dorm. galand.",M3:"Portes ALU",F1:"Dorm. frappe ALU",F2:"Ouv.+ferrage",F3:"Mise bois+CQ",
  MHS:"Montage HS",
  V1:"Vitr. Frappe",V2:"Vitr. Coul/Gal",V3:"Emballage",
  L4:"Prépa acc.",L6:"Palettes",L7:"Chargement",
  I1:"Réception verre",I2:"Coupe verre",I3:"Coupe interc.",I4:"Butyle",I5:"Assemblage",I6:"Gaz+scell.",I7:"CQ CEKAL",I8:"Sortie chaîne",
};
const PHASE_FIELD: Record<string, string> = {
  coupe: "semaine_coupe", montage: "semaine_montage", vitrage: "semaine_vitrage", logistique: "semaine_logistique", isula: "semaine_vitrage",
};
// Fallback statique (utilisé seulement si l'API ne répond pas)
const OPS_FALLBACK = EQUIPE.map(op => ({
  id: op.id, key: op.id, nom: op.nom, competentPosts: [] as string[], vendrediOff: op.vendrediOff,
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

// Chaque cellule poste|jour|demi contient : opérateurs + chantiers
interface CellData {
  ops: string[];     // noms opérateurs
  cmds: string[];    // "client · chantier"
}
type AffMap = Record<string, CellData>;

// ── Composant ────────────────────────────────────────────────────────────────

export default function PlanningAffectations({ commandes, viewWeek, onPatch, onWeekChange }: {
  commandes: CommandeCC[];
  viewWeek: string;
  onPatch?: (id: string, updates: Record<string, unknown>) => void;
  onWeekChange?: (w: string) => void;
}) {
  const [aff, setAff] = useState<AffMap>({});
  const [ops, setOps] = useState<OpResolved[]>(OPS_FALLBACK);
  // Habitudes : { "C3": { "Julien": 45, "Laurent": 38 }, ... }
  const [habits, setHabits] = useState<Record<string, Record<string, number>>>({});
  // Absences RH : { "operateur_id": { "2026-04-13": 0 } }
  const [rhPlan, setRhPlan] = useState<Record<string, Record<string, number>>>({});
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
          return {
            id: op.id,
            key: equipeEntry?.id || op.name.toLowerCase(),
            nom: op.name,
            competentPosts,
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

      for (const ligne of lignes) {
        const lType = ligne.type || cmd.type;
        if (lType === "intervention_chantier") continue;
        const lQte = parseInt(ligne.quantite) || cmd.quantite || 1;
        const lHs = lType === "hors_standard" ? {
          t_coupe: ligne.hs_t_coupe, t_montage: ligne.hs_t_montage, t_vitrage: ligne.hs_t_vitrage,
        } : (cmd as any).hsTemps;

        const routage = getRoutage(lType, lQte, lHs as Record<string, unknown> | null);
        for (const grp of POST_GROUPS) {
          if ((cmd as any)[PHASE_FIELD[grp.phase]] !== viewWeek) continue;
          for (const e of routage.filter(r => r.phase === grp.phase)) {
            if (!work[e.postId]) work[e.postId] = { totalMin: 0, cmds: [] };
            work[e.postId].totalMin += e.estimatedMin;
            if (!work[e.postId].cmds.some(c => c.client === client && c.chantier === chantier)) {
              work[e.postId].cmds.push({ client, chantier, min: 0 });
            }
            const existing = work[e.postId].cmds.find(c => c.client === client && c.chantier === chantier);
            if (existing) existing.min += e.estimatedMin;
          }
        }
      }

      // Postes ISULA : si la commande a des vitrages et est planifiée en vitrage cette semaine
      if ((cmd as any).semaine_vitrage === viewWeek && !(cmd as any).aucun_vitrage) {
        const vitrages = Array.isArray((cmd as any).vitrages) ? (cmd as any).vitrages : [];
        const isulaVitrages = vitrages.filter((v: any) => (v.fournisseur || "").toLowerCase() === "isula");
        if (isulaVitrages.length > 0) {
          const nbVitrages = isulaVitrages.reduce((s: number, v: any) => s + (parseInt(v.quantite) || 1), 0);
          // Temps estimés par poste ISULA (min par vitrage)
          const ISULA_TIMES: Record<string, number> = { I1: 5, I2: 15, I3: 8, I4: 5, I5: 12, I6: 10, I7: 5, I8: 5 };
          for (const [pid, tPerUnit] of Object.entries(ISULA_TIMES)) {
            const min = tPerUnit * nbVitrages;
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
  }, [commandes, viewWeek]);

  const activePosts = useMemo(() =>
    POST_GROUPS.map(grp => ({ ...grp, posts: grp.ids.filter(pid => postWork[pid]?.totalMin > 0) })).filter(g => g.posts.length > 0),
    [postWork]
  );

  const ck = (pid: string, j: number, d: string) => `${pid}|${j}|${d}`;

  // ── Drop opérateur sur cellule ──
  const onDrop = useCallback((key: string) => {
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
                const cmdLabels = pw.cmds.map(c => c.chantier ? `${c.client} · ${c.chantier}` : c.client);
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

  // ── Calcul de couverture globale ──
  const coverage = useMemo(() => {
    let totalNeeded = 0;
    let totalAffected = 0;
    const uncoveredPosts: Array<{ postId: string; label: string; needed: number; affected: number; deficit: number }> = [];

    for (const grp of activePosts) {
      for (const pid of grp.posts) {
        const pw = postWork[pid];
        if (!pw || pw.totalMin === 0) continue;
        let affMin = 0;
        for (let j = 0; j < 5; j++) for (const d of ["am", "pm"]) affMin += (aff[ck(pid, j, d)]?.ops?.length || 0) * DEMI_MIN;
        totalNeeded += pw.totalMin;
        totalAffected += Math.min(affMin, pw.totalMin);
        if (affMin < pw.totalMin) {
          uncoveredPosts.push({ postId: pid, label: POST_LABELS[pid] || pid, needed: pw.totalMin, affected: affMin, deficit: pw.totalMin - affMin });
        }
      }
    }
    const pct = totalNeeded > 0 ? Math.round(totalAffected / totalNeeded * 100) : 0;
    return { pct, totalNeeded, totalAffected, uncoveredPosts, complete: pct >= 100 };
  }, [activePosts, postWork, aff]);

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

      {/* ── Palette opérateurs + boutons ── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: 1, background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 12px" }}>
          <div style={{ fontSize: 10, color: C.sec, marginBottom: 6, fontWeight: 700 }}>OPÉRATEURS — glisse vers un poste</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {ops.map(op => (
              <div key={op.id} draggable onDragStart={(e) => { setDragOp(op.nom); e.dataTransfer.effectAllowed = "copy"; }}
                style={{ padding: "4px 10px", borderRadius: 4, cursor: "grab", userSelect: "none", background: OP_COLORS[op.key] || C.s2, color: "#000", fontSize: 11, fontWeight: 700 }}>
                {op.nom}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <button onClick={autoAssign} style={{ padding: "8px 16px", background: C.orange, border: "none", borderRadius: 4, color: "#000", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            Proposition auto
          </button>
          <button onClick={clearAll} style={{ padding: "6px 16px", background: C.s2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.sec, fontSize: 11, cursor: "pointer" }}>
            Tout effacer
          </button>
          <button onClick={printFiches} style={{ padding: "6px 16px", background: C.s2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.sec, fontSize: 11, cursor: "pointer" }}>
            Imprimer les fiches
          </button>
          <span style={{ fontSize: 9, color: saving ? C.orange : C.green, textAlign: "center" }}>
            {saving ? "Sauvegarde..." : "Sauvegardé"}
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
          for (const [, cell] of Object.entries(aff)) {
            if (cell?.ops?.includes(op.nom)) affMin += DEMI_MIN;
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
          </thead>
          <tbody>
            {activePosts.map(grp => [
              <tr key={`h-${grp.label}`}>
                <td colSpan={2 + 10} style={{ padding: "5px 8px", background: grp.color + "15", borderBottom: `2px solid ${grp.color}`, fontSize: 10, fontWeight: 700, color: grp.color, textTransform: "uppercase", letterSpacing: 1 }}>
                  {grp.label}
                </td>
              </tr>,
              ...grp.posts.map(pid => {
                const pw = postWork[pid];
                const minPers = grp.phase === "coupe" ? 2 : 1;
                const persNeeded = Math.max(minPers, Math.ceil(pw.totalMin / DEMI_MIN / 10));
                const maxWeek = POST_MAX_WEEK[pid];
                const overCapacity = maxWeek ? pw.totalMin > maxWeek : false;
                let affMin = 0;
                for (let j = 0; j < 5; j++) for (const d of ["am", "pm"]) affMin += (aff[ck(pid, j, d)]?.ops?.length || 0) * DEMI_MIN;
                const pct = pw.totalMin > 0 ? Math.min(100, Math.round(affMin / pw.totalMin * 100)) : 0;
                const barCol = pct >= 100 ? C.green : pct >= 50 ? C.orange : C.red;

                return (
                  <tr key={pid} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "5px 8px", background: C.s1, border: `1px solid ${C.border}`, verticalAlign: "top" }}>
                      <div style={{ fontWeight: 700, color: grp.color }}>{pid} <span style={{ fontWeight: 400, color: C.muted, fontSize: 9 }}>{POST_LABELS[pid]}</span></div>
                      {pw.cmds.map((c, i) => (
                        <div key={i} style={{ fontSize: 9, color: C.sec, marginTop: 1 }}>
                          <span style={{ fontWeight: 600 }}>{c.client}</span>
                          {c.chantier && <span style={{ color: C.muted }}> · {c.chantier}</span>}
                          <span className="mono" style={{ color: C.muted, marginLeft: 3 }}>{hm(c.min)}</span>
                        </div>
                      ))}
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
                      const cell = aff[key] || { ops: [], cmds: [] };
                      const hasContent = cell.ops.length > 0 || cell.cmds.length > 0;
                      const isTarget = dropTarget === key;
                      const allCmdLabels = pw.cmds.map(c => c.chantier ? `${c.client} · ${c.chantier}` : c.client);
                      return (
                        <td key={`${j}_${demi}`}
                          onDragOver={(e) => { e.preventDefault(); setDropTarget(key); }}
                          onDragLeave={() => { if (dropTarget === key) setDropTarget(null); }}
                          onDrop={() => onDrop(key)}
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
                              {cell.cmds.map(cmdLabel => (
                                <div key={cmdLabel} style={{
                                  fontSize: 8, padding: "2px 4px", borderRadius: 2, marginBottom: 1,
                                  background: grp.color + "20", borderLeft: `2px solid ${grp.color}`,
                                  display: "flex", alignItems: "center", justifyContent: "space-between",
                                }}>
                                  <span style={{ fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cmdLabel}</span>
                                  <span onClick={() => toggleCmd(key, cmdLabel)} style={{ cursor: "pointer", fontSize: 7, color: C.muted, marginLeft: 2 }}>✕</span>
                                </div>
                              ))}
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
                          {/* Boutons pour ajouter des chantiers (si pas tous affectés) */}
                          {allCmdLabels.filter(c => !cell.cmds.includes(c)).length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 1, marginTop: cell.ops.length > 0 ? 2 : 0 }}>
                              {allCmdLabels.filter(c => !cell.cmds.includes(c)).map(cmdLabel => (
                                <button key={cmdLabel} onClick={() => toggleCmd(key, cmdLabel)}
                                  style={{ fontSize: 7, padding: "1px 3px", borderRadius: 2, cursor: "pointer", border: `1px solid ${C.border}`, background: C.s2, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 65 }}
                                  title={cmdLabel}
                                >
                                  +{cmdLabel.split(" · ")[0]}
                                </button>
                              ))}
                            </div>
                          )}
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
    </div>
  );
}
