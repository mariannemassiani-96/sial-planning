"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  EQUIPE, calcTempsType, calcCheminCritique, calcLogistique,
  hm, JOURS_FERIES, C, isWorkday, TYPES_MENUISERIE, T,
  getWeekNum as getWeekNumUtil, toSemaineId as toSemaineIdUtil,
} from "@/lib/sial-data";
import type { CommandeCC } from "@/lib/sial-data";

// ── Postes ────────────────────────────────────────────────────────────────────
const POSTES = [
  { id: "coupe",      label: "COUPE",      color: C.cyan,   who: "Julien · Laurent · Mateo", capJour: 3 * 480 },
  { id: "frappes",    label: "FRAPPES",    color: C.blue,   who: "Michel · Jean-François",   capJour: 2 * 480 },
  { id: "coulissant", label: "COULISSANT", color: C.orange, who: "Alain (30h/sem)",           capJour: 360     },
  { id: "vitrage_ov", label: "VITRAGE",    color: C.teal,   who: "Quentin",                  capJour: 480     },
] as const;

type PosteId = (typeof POSTES)[number]["id"];

// ── Helpers semaine ───────────────────────────────────────────────────────────
function localStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getMondayStr(): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return localStr(d);
}
function addWeeks(s: string, n: number): string {
  const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n * 7); return localStr(d);
}
function getWeekDays(s: string): string[] {
  return [0, 1, 2, 3, 4].map(i => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + i); return localStr(d); });
}
const toSemaineId = toSemaineIdUtil;
const getWeekNum = getWeekNumUtil;
function workdaysBetween(start: string, end: string): number {
  let n = 0; const d = new Date(start + "T00:00:00");
  while (localStr(d) <= end) { if (isWorkday(localStr(d))) n++; d.setDate(d.getDate() + 1); }
  return Math.max(1, n);
}
const JOURS_COURTS = ["Lun", "Mar", "Mer", "Jeu", "Ven"];
function fmtCourt(s: string): string {
  const d = new Date(s + "T00:00:00");
  return `${JOURS_COURTS[d.getDay() - 1] ?? ""} ${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`;
}

// ── Calcul charge auto ────────────────────────────────────────────────────────
function calcChargeAuto(cmds: CommandeCC[], pStart: string, pEnd: string): Record<PosteId, number> {
  const r: Record<PosteId, number> = { coupe: 0, frappes: 0, coulissant: 0, vitrage_ov: 0 };
  cmds.forEach(cmd => {
    const cc = calcCheminCritique(cmd);
    if (!cc) return;
    const fam = TYPES_MENUISERIE[cmd.type]?.famille ?? "";
    cc.etapes.forEach(et => {
      if (et.id === "options" || et.duree_min === 0) return;
      const oS = et.debut > pStart ? et.debut : pStart;
      const oE = et.fin   < pEnd   ? et.fin   : pEnd;
      if (oS > oE) return;
      const load = Math.round(et.duree_min * workdaysBetween(oS, oE) / workdaysBetween(et.debut, et.fin));
      let p: PosteId | null = null;
      if (et.id === "coupe")   p = "coupe";
      else if (et.id === "montage") p = (fam === "coulissant" || fam === "glandage") ? "coulissant" : "frappes";
      else if (et.id === "vitrage") p = "vitrage_ov";
      if (p) r[p] += load;
    });
  });
  return r;
}

// ── Types planning manuel ─────────────────────────────────────────────────────
type AssignedCmd = { commandeId: string; quantite: number };
type DemiJ       = { ops: string[]; cmds: AssignedCmd[] };
type CellData    = { am: DemiJ; pm: DemiJ };
type PlanPoste   = Record<string, Record<string, CellData>>;

const emptyDJ   = (): DemiJ    => ({ ops: [], cmds: [] });
const emptyCell = (): CellData => ({ am: emptyDJ(), pm: emptyDJ() });

function opsPoste(id: string) {
  return EQUIPE.filter(m => m.poste === id || m.remplace.includes(id));
}
function getConflictOps(plan: PlanPoste, date: string, slot: "am" | "pm"): Set<string> {
  const cnt: Record<string, number> = {};
  POSTES.forEach(p => (plan[p.id]?.[date]?.[slot]?.ops ?? []).forEach(o => { cnt[o] = (cnt[o] ?? 0) + 1; }));
  return new Set(Object.entries(cnt).filter(([, n]) => n > 1).map(([id]) => id));
}
const PRIO: Record<string, number> = { chantier_bloque: 0, urgente: 1, normale: 2 };
function activeCmds(cmds: CommandeCC[]) {
  return cmds
    .filter(c => { const s = (c as any).statut; return s !== "terminee" && s !== "livre"; })
    .sort((a, b) => {
      const pa = PRIO[(a as any).priorite] ?? 2;
      const pb = PRIO[(b as any).priorite] ?? 2;
      if (pa !== pb) return pa - pb;
      // Secondaire : deadline la plus proche en premier
      const da = (a as any).date_livraison_souhaitee || "9999";
      const db = (b as any).date_livraison_souhaitee || "9999";
      return da.localeCompare(db);
    });
}

// ── Routage simplifié : type → postes nécessaires dans l'ordre ────────────
function getRouteForType(typeId: string): PosteId[] {
  const tm = TYPES_MENUISERIE[typeId];
  if (!tm) return [];
  if (tm.famille === "intervention") return ["frappes"];
  if (tm.famille === "hors_standard") return ["coupe", "frappes", "vitrage_ov"];
  if (tm.famille === "coulissant" || tm.famille === "glandage") {
    const steps: PosteId[] = ["coupe", "coulissant"];
    if (tm.ouvrants > 0) steps.push("vitrage_ov");
    return steps;
  }
  // frappes / portes
  const steps: PosteId[] = ["coupe"];
  if (tm.ouvrants > 0 || tm.dormant > 0) steps.push("frappes");
  return steps;
}

// ── Vérification dépendances d'une commande dans le plan ──────────────────
function checkCmdDeps(cmdId: string, typeId: string, plan: PlanPoste, days: string[]): string[] {
  const route = getRouteForType(typeId);
  if (route.length < 2) return [];
  const errors: string[] = [];

  // Pour chaque poste dans la route, trouver le premier jour/slot où la commande est placée
  const findFirstSlot = (poste: string): { day: string; slotIdx: number } | null => {
    for (const day of days) {
      for (let si = 0; si < 2; si++) {
        const slot = si === 0 ? "am" as const : "pm" as const;
        const cell = plan[poste]?.[day];
        const dj = cell ? cell[slot] : undefined;
        if (dj?.cmds?.some((c: AssignedCmd) => c.commandeId === cmdId)) {
          return { day, slotIdx: si };
        }
      }
    }
    return null;
  };

  for (let i = 1; i < route.length; i++) {
    const prevPoste = route[i - 1];
    const currPoste = route[i];
    const prevSlot = findFirstSlot(prevPoste);
    const currSlot = findFirstSlot(currPoste);
    if (prevSlot && currSlot) {
      const prevIdx = days.indexOf(prevSlot.day) * 2 + prevSlot.slotIdx;
      const currIdx = days.indexOf(currSlot.day) * 2 + currSlot.slotIdx;
      if (currIdx <= prevIdx) {
        errors.push(`${POSTES.find(p => p.id === currPoste)?.label ?? currPoste} planifié avant ${POSTES.find(p => p.id === prevPoste)?.label ?? prevPoste}`);
      }
    }
  }
  return errors;
}

// ── Proposition automatique ──────────────────────────────────────────────
function generateAutoProposal(
  cmds: CommandeCC[],
  days: string[],
  existingPlan: PlanPoste,
): PlanPoste {
  const plan: PlanPoste = JSON.parse(JSON.stringify(existingPlan));

  // Initialiser les cellules manquantes
  POSTES.forEach(p => {
    if (!plan[p.id]) plan[p.id] = {};
    days.forEach(d => {
      if (!plan[p.id][d]) plan[p.id][d] = emptyCell();
      if (!plan[p.id][d].am) plan[p.id][d].am = emptyDJ();
      if (!plan[p.id][d].pm) plan[p.id][d].pm = emptyDJ();
    });
  });

  // Commandes actives triées par priorité puis deadline
  const sorted = activeCmds(cmds);

  // Tracker la charge par poste/jour/slot
  const getLoad = (poste: PosteId, day: string, slot: "am" | "pm"): number => {
    const dj = plan[poste]?.[day]?.[slot];
    if (!dj) return 0;
    return dj.cmds.reduce((sum, ac) => {
      const cmd = cmds.find(c => String(c.id) === ac.commandeId);
      if (!cmd) return sum;
      const t = calcTempsType(cmd.type, ac.quantite || cmd.quantite, (cmd as any).hsTemps ?? null);
      return sum + (t?.par_poste[poste] ?? 0);
    }, 0);
  };

  // Commandes déjà placées
  const placedCmds = new Set<string>();
  POSTES.forEach(p => {
    days.forEach(d => {
      (["am", "pm"] as const).forEach(s => {
        (plan[p.id]?.[d]?.[s]?.cmds ?? []).forEach(c => placedCmds.add(`${c.commandeId}|${p.id}`));
      });
    });
  });

  const DEMI_CAP = 240; // 4h par demi-journée

  for (const cmd of sorted) {
    const cmdId = String(cmd.id);
    const route = getRouteForType(cmd.type);
    if (!route.length) continue;

    // Pour chaque étape de la route, trouver le meilleur créneau
    let minSlotIdx = 0; // index global (jour*2+slot) — assure l'ordre des étapes

    for (const poste of route) {
      if (placedCmds.has(`${cmdId}|${poste}`)) {
        // Déjà placée — trouver son index pour les dépendances
        for (let di = 0; di < days.length; di++) {
          for (let si = 0; si < 2; si++) {
            const slot = si === 0 ? "am" as const : "pm" as const;
            const cell = plan[poste]?.[days[di]];
            if (cell?.[slot]?.cmds?.some((c: AssignedCmd) => c.commandeId === cmdId)) {
              minSlotIdx = Math.max(minSlotIdx, di * 2 + si + 1);
            }
          }
        }
        continue;
      }

      const t = calcTempsType(cmd.type, cmd.quantite, (cmd as any).hsTemps ?? null);
      const tPoste = t?.par_poste[poste as PosteId] ?? 0;
      if (tPoste === 0) continue;

      // Trouver le premier créneau avec de la capacité
      let placed = false;
      for (let globalIdx = minSlotIdx; globalIdx < days.length * 2; globalIdx++) {
        const di = Math.floor(globalIdx / 2);
        const si = globalIdx % 2;
        const day = days[di];
        const slot = si === 0 ? "am" : "pm";

        if (!isWorkday(day)) continue;

        const currentLoad = getLoad(poste as PosteId, day, slot);
        if (currentLoad + tPoste <= DEMI_CAP * 1.1) { // tolérance 10%
          plan[poste][day][slot].cmds.push({ commandeId: cmdId, quantite: cmd.quantite });
          placedCmds.add(`${cmdId}|${poste}`);
          minSlotIdx = globalIdx + 1; // étape suivante au moins après celle-ci
          placed = true;
          break;
        }
      }
      if (!placed) {
        // Pas de place cette semaine — skip cette commande pour ce poste
        break;
      }
    }
  }

  // Auto-affecter les opérateurs principaux si cellule vide
  POSTES.forEach(poste => {
    const defaultOps = opsPoste(poste.id).filter(m => m.poste === poste.id);
    days.forEach(day => {
      if (!isWorkday(day)) return;
      const isFriday = new Date(day + "T12:00:00").getDay() === 5;
      (["am", "pm"] as const).forEach(slot => {
        const dj = plan[poste.id]?.[day]?.[slot];
        if (dj && dj.cmds.length > 0 && dj.ops.length === 0) {
          dj.ops = defaultOps
            .filter(m => !(isFriday && m.vendrediOff))
            .map(m => m.id);
        }
      });
    });
  });

  return plan;
}
function calcTempsDJ(posteId: string, dj: DemiJ, cmds: CommandeCC[]) {
  const total = dj.cmds.reduce((sum, ac) => {
    const cmd = cmds.find(c => String(c.id) === ac.commandeId);
    if (!cmd) return sum;
    const t = calcTempsType(cmd.type, ac.quantite || cmd.quantite, (cmd as any).hsTemps ?? null);
    return sum + (t?.par_poste[posteId as PosteId] ?? 0);
  }, 0);
  const nb = dj.ops.length;
  return { total, effectif: nb > 1 ? Math.round(total / nb) : total };
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function PlanningAtelier({ commandes }: { commandes: CommandeCC[] }) {
  const [monday, setMonday]   = useState(getMondayStr);
  const [plan, setPlan]       = useState<PlanPoste>({});
  const [saving, setSaving]   = useState(false);
  const [addOpKey,  setAddOpKey]  = useState<string | null>(null);
  const [addCmdKey, setAddCmdKey] = useState<string | null>(null);
  const [depErrors, setDepErrors] = useState<Record<string, string[]>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const semaine = toSemaineId(monday);
  const days    = useMemo(() => getWeekDays(monday), [monday]);
  const friday  = days[4];
  const wdCount = useMemo(() => workdaysBetween(monday, friday), [monday, friday]);

  // ── Charge automatique semaine ──
  const weekCharge = useMemo(() => {
    const c = calcChargeAuto(commandes, monday, friday);
    c.coupe += Math.round((T.prep_deballage_joints_sem + T.coupe_double_tete_sem) * (wdCount / 5));
    return c;
  }, [commandes, monday, friday, wdCount]);

  const weekCap = useMemo(() => {
    const r: Record<PosteId, number> = {} as any;
    POSTES.forEach(p => { r[p.id] = p.capJour * wdCount; });
    return r;
  }, [wdCount]);

  // ── Charge théorique par jour (fond de cellule) ──
  const dayLoad = useMemo(() => {
    const res: Record<string, Record<string, number>> = {};
    POSTES.forEach(p => {
      res[p.id] = {};
      days.forEach(date => {
        if (!isWorkday(date)) { res[p.id][date] = 0; return; }
        const dc = calcChargeAuto(commandes, date, date);
        res[p.id][date] = (dc[p.id] ?? 0) / p.capJour;
      });
    });
    return res;
  }, [commandes, days]);

  // ── Logistique semaine ──
  const activeSemaine = useMemo(() =>
    commandes.filter(cmd => {
      const cc = calcCheminCritique(cmd);
      if (!cc || !cc.etapes.length) return false;
      return cc.etapes[0].debut <= friday && cc.etapes[cc.etapes.length - 1].fin >= monday;
    }), [commandes, monday, friday]);
  const logi = useMemo(() => calcLogistique(activeSemaine), [activeSemaine]);

  // ── Chargement / sauvegarde plan ──
  useEffect(() => {
    fetch(`/api/planning-poste?semaine=${semaine}`)
      .then(r => r.ok ? r.json() : {}).then(d => setPlan(d ?? {}));
  }, [semaine]);

  const save = useCallback((p: PlanPoste) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await fetch(`/api/planning-poste?semaine=${semaine}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p),
        });
      } finally { setSaving(false); }
    }, 600);
  }, [semaine]);

  // ── Getters / setters ──
  const getCell = (p: string, d: string): CellData => plan[p]?.[d] ?? emptyCell();
  const getDJ   = (p: string, d: string, s: "am" | "pm"): DemiJ => getCell(p, d)[s] ?? emptyDJ();
  const setDJ   = (p: string, d: string, s: "am" | "pm", dj: DemiJ) => {
    const np = { ...plan, [p]: { ...(plan[p] ?? {}), [d]: { ...getCell(p, d), [s]: dj } } };
    setPlan(np); save(np);
  };
  const doAddOp    = (p: string, d: string, s: "am" | "pm", id: string) => {
    const dj = getDJ(p, d, s);
    if (!dj.ops.includes(id)) setDJ(p, d, s, { ...dj, ops: [...dj.ops, id] });
    setAddOpKey(null);
  };
  const doRemoveOp = (p: string, d: string, s: "am" | "pm", id: string) => {
    const dj = getDJ(p, d, s); setDJ(p, d, s, { ...dj, ops: dj.ops.filter(o => o !== id) });
  };
  const doAddCmd   = (p: string, d: string, s: "am" | "pm", cid: string) => {
    const dj = getDJ(p, d, s);
    if (dj.cmds.find(c => c.commandeId === cid)) { setAddCmdKey(null); return; }
    const cmd = commandes.find(c => String(c.id) === cid);
    setDJ(p, d, s, { ...dj, cmds: [...dj.cmds, { commandeId: cid, quantite: cmd?.quantite ?? 1 }] });
    setAddCmdKey(null);
  };
  const doRemoveCmd = (p: string, d: string, s: "am" | "pm", cid: string) => {
    const dj = getDJ(p, d, s); setDJ(p, d, s, { ...dj, cmds: dj.cmds.filter(c => c.commandeId !== cid) });
  };

  // ── Vérification des dépendances à chaque changement de plan ──
  useEffect(() => {
    const errs: Record<string, string[]> = {};
    // Collecter toutes les commandes placées dans le plan
    const allCmdIds = new Set<string>();
    POSTES.forEach(p => {
      days.forEach(d => {
        (["am", "pm"] as const).forEach(s => {
          (plan[p.id]?.[d]?.[s]?.cmds ?? []).forEach(c => allCmdIds.add(c.commandeId));
        });
      });
    });
    allCmdIds.forEach(cid => {
      const cmd = commandes.find(c => String(c.id) === cid);
      if (!cmd) return;
      const problems = checkCmdDeps(cid, cmd.type, plan, days);
      if (problems.length > 0) errs[cid] = problems;
    });
    setDepErrors(errs);
  }, [plan, days, commandes]);

  // ── Proposition automatique ──
  const doAutoProposal = () => {
    const proposed = generateAutoProposal(commandes, days, plan);
    setPlan(proposed);
    save(proposed);
  };

  const navLabel = `Sem. ${getWeekNum(monday)} — ${new Date(monday + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} → ${new Date(friday + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}`;

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <div>

      {/* Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Planning Atelier</span>
          <span style={{ marginLeft: 10, fontSize: 11, color: C.sec }}>{navLabel}</span>
          {saving && <span style={{ marginLeft: 10, fontSize: 10, color: C.muted }}>Enregistrement…</span>}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setMonday(m => addWeeks(m, -1))} style={btn}>‹ Sem. préc.</button>
          <button onClick={() => setMonday(getMondayStr())}       style={btn}>Auj.</button>
          <button onClick={() => setMonday(m => addWeeks(m, 1))}  style={btn}>Sem. suiv. ›</button>
          <button onClick={doAutoProposal} style={{ ...btn, background: C.green + "22", borderColor: C.green, color: C.green, fontWeight: 700 }}>
            Proposition auto
          </button>
        </div>
      </div>

      {/* ── Barres de charge automatique ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        {POSTES.map(p => {
          const v   = weekCharge[p.id] ?? 0;
          const max = weekCap[p.id]    ?? 1;
          const pct = Math.min(100, Math.round(v / max * 100));
          const col = pct > 95 ? C.red : pct > 80 ? C.orange : C.green;
          return (
            <div key={p.id} style={{ padding: "8px 12px", background: C.s1, borderRadius: 6, border: `1px solid ${C.border}`, borderLeft: `3px solid ${p.color}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: p.color }}>{p.label}</span>
                  <span style={{ fontSize: 9, color: C.muted, marginLeft: 8 }}>{p.who}</span>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: col, fontFamily: "monospace" }}>{hm(v)}</span>
                  <span style={{ fontSize: 10, color: C.muted }}>/ {hm(max)}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: col, background: col + "22", border: `1px solid ${col}55`, borderRadius: 3, padding: "1px 6px" }}>{pct}%</span>
                </div>
              </div>
              <div style={{ height: 5, background: C.s2, borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: col, borderRadius: 3, transition: "width 0.3s" }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Alertes dépendances ── */}
      {Object.keys(depErrors).length > 0 && (
        <div style={{ marginBottom: 10, padding: "8px 12px", background: C.red + "15", border: `1px solid ${C.red}44`, borderRadius: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.red, marginBottom: 4 }}>
            ⚠ Dépendances non respectées ({Object.keys(depErrors).length} commande{Object.keys(depErrors).length > 1 ? "s" : ""})
          </div>
          {Object.entries(depErrors).map(([cid, errs]) => {
            const cmd = commandes.find(c => String(c.id) === cid);
            const label = cmd ? `${(cmd as any).num_commande || ""} ${(cmd as any).client || ""}`.trim() : cid;
            return (
              <div key={cid} style={{ fontSize: 10, color: C.red, marginLeft: 8 }}>
                <b>{label}</b> : {errs.join(" · ")}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Grille manuelle ── */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", minWidth: 870, width: "100%" }}>
          <colgroup>
            <col style={{ width: 86 }} />
            {days.map(d => <col key={d} style={{ width: 156 }} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={thSt}>POSTE</th>
              {days.map(d => {
                const ferie = JOURS_FERIES[d];
                return (
                  <th key={d} style={{ ...thSt, color: ferie ? C.red : C.sec }}>
                    {fmtCourt(d)}
                    {ferie && <div style={{ fontSize: 8, color: C.red, fontWeight: 400, marginTop: 1 }}>{ferie}</div>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {POSTES.map(poste => (
              <tr key={poste.id}>
                <td style={{ ...tdLabel, borderLeft: `3px solid ${poste.color}` }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: poste.color }}>{poste.label}</span>
                </td>
                {days.map(date => {
                  if (!isWorkday(date)) return (
                    <td key={date} style={{ ...tdBase, background: "#111111" }}>
                      <div style={{ textAlign: "center", color: C.muted, fontSize: 9, padding: "30px 0" }}>—</div>
                    </td>
                  );

                  const lp = dayLoad[poste.id]?.[date] ?? 0;
                  const tint = lp > 1 ? C.red + "18" : lp > 0.8 ? C.orange + "14" : lp > 0.3 ? C.green + "0c" : "transparent";

                  return (
                    <td key={date} style={{ ...tdBase, background: tint }}>
                      {(["am", "pm"] as const).map((slot, si) => {
                        const dj = getDJ(poste.id, date, slot);
                        const { total, effectif } = calcTempsDJ(poste.id, dj, commandes);
                        const CAPA   = 240;
                        const pct    = total > 0 ? Math.min(100, effectif / CAPA * 100) : 0;
                        const over   = effectif > CAPA;
                        const barCol = over ? C.red : pct > 80 ? C.orange : pct > 0 ? C.green : C.muted;
                        const nbOps  = dj.ops.length;

                        const isFriday = new Date(date + "T12:00:00").getDay() === 5;
                        const avOps   = opsPoste(poste.id).filter(m => !dj.ops.includes(m.id) && !(isFriday && m.vendrediOff));
                        const cellKey = `${poste.id}|${date}|${slot}`;
                        const conflicts = getConflictOps(plan, date, slot);

                        const dispos = activeCmds(commandes).filter(c => {
                          if (dj.cmds.find(ac => ac.commandeId === String(c.id))) return false;
                          const t = calcTempsType(c.type, c.quantite, (c as any).hsTemps ?? null);
                          return t && (t.par_poste[poste.id as PosteId] ?? 0) > 0;
                        });

                        return (
                          <div key={slot} style={{ padding: "4px 6px", borderBottom: si === 0 ? `1px solid ${C.border}` : "none", minHeight: 70 }}>

                            {/* Entête demi-journée */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                              <span style={{ fontSize: 8, fontWeight: 700, color: C.muted, letterSpacing: 1 }}>{slot.toUpperCase()}</span>
                              {total > 0 && (
                                <span style={{ fontSize: 8, color: barCol, fontWeight: 700, fontFamily: "monospace" }}>
                                  {nbOps > 1
                                    ? <>{hm(total)}<span style={{ color: C.sec }}> ÷{nbOps}=</span>{hm(effectif)}</>
                                    : hm(effectif)
                                  }
                                </span>
                              )}
                            </div>

                            {/* Opérateurs */}
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 2, marginBottom: 3 }}>
                              {dj.ops.map(opId => {
                                const op = EQUIPE.find(m => m.id === opId);
                                if (!op) return null;
                                const conflict = conflicts.has(opId);
                                const isFridayOff = isFriday && op.vendrediOff;
                                return (
                                  <span key={opId}
                                    title={isFridayOff ? `⚠ ${op.nom} ne travaille pas le vendredi` : conflict ? `⚠ ${op.nom} est déjà sur un autre poste ce créneau` : `${op.nom} — cliquer pour retirer`}
                                    onClick={() => doRemoveOp(poste.id, date, slot, opId)}
                                    style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: (conflict || isFridayOff) ? C.red + "22" : poste.color + "28", border: `1px solid ${(conflict || isFridayOff) ? C.red : poste.color}66`, color: (conflict || isFridayOff) ? C.red : poste.color, cursor: "pointer", fontWeight: 600, userSelect: "none" }}>
                                    {(conflict || isFridayOff) ? "⚠ " : ""}{op.nom.split(/[\s-]/)[0]}
                                  </span>
                                );
                              })}
                              {avOps.length > 0 && (
                                addOpKey === cellKey ? (
                                  <select autoFocus
                                    style={{ fontSize: 9, padding: "1px 4px", background: C.bg, border: `1px solid ${poste.color}`, borderRadius: 3, color: C.text, maxWidth: 108 }}
                                    onBlur={() => setAddOpKey(null)}
                                    onChange={e => e.target.value && doAddOp(poste.id, date, slot, e.target.value)}>
                                    <option value="">— opérateur</option>
                                    {avOps.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
                                  </select>
                                ) : (
                                  <span onClick={() => { setAddCmdKey(null); setAddOpKey(cellKey); }}
                                    style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, border: `1px dashed ${C.border}`, color: C.sec, cursor: "pointer", userSelect: "none" }}>+</span>
                                )
                              )}
                            </div>

                            {/* Commandes */}
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 2, marginBottom: 3 }}>
                              {dj.cmds.map(ac => {
                                const cmd = commandes.find(c => String(c.id) === ac.commandeId);
                                if (!cmd) return null;
                                const t  = calcTempsType(cmd.type, ac.quantite || cmd.quantite, (cmd as any).hsTemps ?? null);
                                const tP = t?.par_poste[poste.id as PosteId] ?? 0;
                                const tE = nbOps > 1 ? Math.round(tP / nbOps) : tP;
                                const num = (cmd as any).num_commande ?? String(cmd.id);
                                const cli = (cmd as any).client ?? "";
                                const hasDep = depErrors[ac.commandeId]?.length > 0;
                                return (
                                  <span key={ac.commandeId}
                                    title={hasDep ? `⚠ ${depErrors[ac.commandeId].join(" · ")}` : `${cli} — ${num} | ${hm(tP)}${nbOps > 1 ? ` ÷${nbOps}=${hm(tE)}` : ""} · Cliquer pour retirer`}
                                    onClick={() => doRemoveCmd(poste.id, date, slot, ac.commandeId)}
                                    style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: hasDep ? C.red + "22" : C.s2, border: `1px solid ${hasDep ? C.red : C.bLight}`, color: hasDep ? C.red : C.text, cursor: "pointer", maxWidth: 118, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", userSelect: "none", display: "inline-flex", alignItems: "center", gap: 2 }}>
                                    <span>{num}</span>
                                    {tE > 0 && <span style={{ color: C.teal, fontFamily: "monospace" }}>·{hm(tE)}</span>}
                                  </span>
                                );
                              })}
                              {dispos.length > 0 && (
                                addCmdKey === cellKey ? (
                                  <select autoFocus
                                    style={{ fontSize: 9, padding: "1px 4px", background: C.bg, border: `1px solid ${C.orange}`, borderRadius: 3, color: C.text, maxWidth: 138 }}
                                    onBlur={() => setAddCmdKey(null)}
                                    onChange={e => e.target.value && doAddCmd(poste.id, date, slot, e.target.value)}>
                                    <option value="">— commande</option>
                                    {dispos.map(c => {
                                      const t   = calcTempsType(c.type, c.quantite, (c as any).hsTemps ?? null);
                                      const tP  = t?.par_poste[poste.id as PosteId] ?? 0;
                                      const num = (c as any).num_commande ?? String(c.id);
                                      const cli = (c as any).client ?? "";
                                      const tag = (c as any).priorite === "chantier_bloque" ? "🔴 " : (c as any).priorite === "urgente" ? "🟠 " : "";
                                      return <option key={String(c.id)} value={String(c.id)}>{tag}{num} — {cli} ({hm(tP)})</option>;
                                    })}
                                  </select>
                                ) : (
                                  <span onClick={() => { setAddOpKey(null); setAddCmdKey(cellKey); }}
                                    style={{ fontSize: 8, padding: "1px 6px", borderRadius: 3, border: `1px dashed ${C.border}`, color: C.sec, cursor: "pointer", userSelect: "none" }}>+ cmd</span>
                                )
                              )}
                            </div>

                            {/* Barre de capacité manuelle */}
                            {total > 0 && (
                              <div style={{ height: 3, background: C.s2, borderRadius: 2, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${pct}%`, background: barCol, borderRadius: 2, transition: "width 0.2s" }} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Logistique ── */}
      {activeSemaine.length > 0 && (
        <div style={{ marginTop: 14, padding: "10px 16px", background: C.s1, borderRadius: 6, border: `1px solid ${C.border}`, display: "flex", gap: 28, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 10, color: C.sec, fontWeight: 700, letterSpacing: 1 }}>LOGISTIQUE</span>
          {[
            { v: logi.chariots_profils,  l: "Chariots profilés",   c: C.blue   },
            { v: logi.chariots_vitrages, l: "Chariots vitrages",   c: C.teal   },
            { v: logi.palettes,          l: "Palettes livraison",  c: C.orange },
            { v: activeSemaine.length,   l: "Commandes en cours",  c: C.sec    },
          ].map(({ v, l, c }) => (
            <div key={l} style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: c, fontFamily: "monospace" }}>{v}</span>
              <span style={{ fontSize: 10, color: C.muted }}>{l}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const btn     = { padding: "4px 10px", background: "none", border: `1px solid ${C.border}`, borderRadius: 4, color: C.sec, cursor: "pointer", fontSize: 11 };
const thSt    = { padding: "6px 8px", background: C.s1, borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, color: C.sec, fontSize: 10, fontWeight: 700, textAlign: "left" as const, whiteSpace: "nowrap" as const };
const tdLabel = { padding: "8px", background: C.s1, borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, verticalAlign: "middle" as const };
const tdBase  = { padding: 0, borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, verticalAlign: "top" as const };
