"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { EQUIPE, calcTempsType, hm, JOURS_FERIES, C, isWorkday } from "@/lib/sial-data";
import type { CommandeCC } from "@/lib/sial-data";

// ── Postes ────────────────────────────────────────────────────────────────────
const POSTES_PLANNING = [
  { id: "coupe",      label: "COUPE",      color: C.cyan   },
  { id: "frappes",    label: "FRAPPES",    color: C.blue   },
  { id: "coulissant", label: "COULISSANT", color: C.orange },
  { id: "vitrage_ov", label: "VITRAGE",    color: C.teal   },
] as const;

type PosteId = "coupe" | "frappes" | "coulissant" | "vitrage_ov";

function opsPoste(posteId: string) {
  return EQUIPE.filter(m => m.poste === posteId || m.remplace.includes(posteId));
}

// ── Types ─────────────────────────────────────────────────────────────────────
type AssignedCmd = { commandeId: string; quantite: number };
type DemiJ       = { ops: string[]; cmds: AssignedCmd[] };
type CellData    = { am: DemiJ; pm: DemiJ };
type PlanPoste   = Record<string, Record<string, CellData>>;

const emptyDJ   = (): DemiJ     => ({ ops: [], cmds: [] });
const emptyCell = (): CellData  => ({ am: emptyDJ(), pm: emptyDJ() });

// ── Helpers semaine ───────────────────────────────────────────────────────────
function getMondayStr(): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split("T")[0];
}

function addWeeks(mondayStr: string, n: number): string {
  const d = new Date(mondayStr);
  d.setDate(d.getDate() + n * 7);
  return d.toISOString().split("T")[0];
}

function getWeekDays(mondayStr: string): string[] {
  return [0, 1, 2, 3, 4].map(i => {
    const d = new Date(mondayStr);
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}

function toSemaineId(mondayStr: string): string {
  const d = new Date(mondayStr);
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const mon = new Date(jan4);
  mon.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1);
  const w = Math.floor((d.getTime() - mon.getTime()) / (7 * 86400000)) + 1;
  return `${d.getFullYear()}-W${String(w).padStart(2, "0")}`;
}

const JOURS_COURTS = ["Lun", "Mar", "Mer", "Jeu", "Ven"];
function fmtDateCourt(dateStr: string): string {
  const d = new Date(dateStr);
  const idx = d.getDay() - 1;
  return `${JOURS_COURTS[idx] ?? ""} ${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`;
}

// ── Calcul temps avec diviseur opérateurs ─────────────────────────────────────
function calcTempsDJ(
  posteId: string,
  dj: DemiJ,
  allCmds: CommandeCC[]
): { total: number; effectif: number } {
  const total = dj.cmds.reduce((sum, ac) => {
    const cmd = allCmds.find(c => String(c.id) === ac.commandeId);
    if (!cmd) return sum;
    const t = calcTempsType(cmd.type, ac.quantite || cmd.quantite, (cmd as any).hsTemps ?? null);
    return sum + (t?.par_poste[posteId as PosteId] ?? 0);
  }, 0);
  const nbOps = dj.ops.length;
  const effectif = nbOps > 1 ? Math.round(total / nbOps) : total;
  return { total, effectif };
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function PlanningPoste({ commandes }: { commandes: CommandeCC[] }) {
  const [monday, setMonday] = useState(getMondayStr);
  const [plan, setPlan]     = useState<PlanPoste>({});
  const [saving, setSaving] = useState(false);
  const [addOpKey,  setAddOpKey]  = useState<string | null>(null);
  const [addCmdKey, setAddCmdKey] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const semaine = toSemaineId(monday);
  const days    = getWeekDays(monday);

  // ── Chargement ──
  useEffect(() => {
    fetch(`/api/planning-poste?semaine=${semaine}`)
      .then(r => r.ok ? r.json() : {})
      .then(d => setPlan(d ?? {}));
  }, [semaine]);

  // ── Sauvegarde auto ──
  const save = useCallback((p: PlanPoste) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await fetch(`/api/planning-poste?semaine=${semaine}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(p),
        });
      } finally {
        setSaving(false);
      }
    }, 600);
  }, [semaine]);

  // ── Getters / setters ──
  const getCell = (poste: string, date: string): CellData =>
    plan[poste]?.[date] ?? emptyCell();

  const getDJ = (poste: string, date: string, slot: "am" | "pm"): DemiJ =>
    getCell(poste, date)[slot] ?? emptyDJ();

  const setDJ = (poste: string, date: string, slot: "am" | "pm", dj: DemiJ) => {
    const np: PlanPoste = {
      ...plan,
      [poste]: { ...(plan[poste] ?? {}), [date]: { ...getCell(poste, date), [slot]: dj } },
    };
    setPlan(np);
    save(np);
  };

  const doAddOp = (poste: string, date: string, slot: "am" | "pm", opId: string) => {
    const dj = getDJ(poste, date, slot);
    if (!dj.ops.includes(opId)) setDJ(poste, date, slot, { ...dj, ops: [...dj.ops, opId] });
    setAddOpKey(null);
  };

  const doRemoveOp = (poste: string, date: string, slot: "am" | "pm", opId: string) => {
    const dj = getDJ(poste, date, slot);
    setDJ(poste, date, slot, { ...dj, ops: dj.ops.filter(id => id !== opId) });
  };

  const doAddCmd = (poste: string, date: string, slot: "am" | "pm", cmdId: string) => {
    const dj = getDJ(poste, date, slot);
    if (dj.cmds.find(c => c.commandeId === cmdId)) { setAddCmdKey(null); return; }
    const cmd = commandes.find(c => String(c.id) === cmdId);
    setDJ(poste, date, slot, {
      ...dj,
      cmds: [...dj.cmds, { commandeId: cmdId, quantite: cmd?.quantite ?? 1 }],
    });
    setAddCmdKey(null);
  };

  const doRemoveCmd = (poste: string, date: string, slot: "am" | "pm", cmdId: string) => {
    const dj = getDJ(poste, date, slot);
    setDJ(poste, date, slot, { ...dj, cmds: dj.cmds.filter(c => c.commandeId !== cmdId) });
  };

  // ── Rendu ──
  return (
    <div>
      {/* En-tête navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Planning par poste</span>
          <span style={{ marginLeft: 10, fontSize: 11, color: C.sec, fontFamily: "monospace" }}>{semaine}</span>
          {saving && <span style={{ marginLeft: 10, fontSize: 10, color: C.muted }}>Enregistrement…</span>}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setMonday(m => addWeeks(m, -1))} style={btnNav}>‹ Sem. préc.</button>
          <button onClick={() => setMonday(getMondayStr())} style={btnNav}>Auj.</button>
          <button onClick={() => setMonday(m => addWeeks(m, 1))} style={btnNav}>Sem. suiv. ›</button>
        </div>
      </div>

      {/* Légende */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {POSTES_PLANNING.map(p => (
          <span key={p.id} style={{ fontSize: 9, padding: "2px 8px", borderRadius: 3, background: p.color + "22", border: `1px solid ${p.color}66`, color: p.color, fontWeight: 700 }}>
            {p.label}
          </span>
        ))}
        <span style={{ fontSize: 9, color: C.muted }}>
          · Cliquer un opérateur ou une commande pour retirer · Le temps se divise automatiquement selon le nombre d'opérateurs
        </span>
      </div>

      {/* Grille */}
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
                    {fmtDateCourt(d)}
                    {ferie && <div style={{ fontSize: 8, color: C.red, fontWeight: 400, marginTop: 1 }}>{ferie}</div>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {POSTES_PLANNING.map(poste => (
              <tr key={poste.id}>
                {/* Label poste */}
                <td style={{ ...tdLabel, borderLeft: `3px solid ${poste.color}` }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: poste.color }}>{poste.label}</span>
                </td>

                {/* Cellules jours */}
                {days.map(date => {
                  if (!isWorkday(date)) return (
                    <td key={date} style={{ ...tdBase, background: "#0a1520" }}>
                      <div style={{ textAlign: "center", color: C.muted, fontSize: 9, padding: "30px 0" }}>—</div>
                    </td>
                  );

                  return (
                    <td key={date} style={tdBase}>
                      {(["am", "pm"] as const).map((slot, si) => {
                        const dj = getDJ(poste.id, date, slot);
                        const { total, effectif } = calcTempsDJ(poste.id, dj, commandes);
                        const CAPA = 240; // min par demi-journée
                        const pct  = total > 0 ? Math.min(100, effectif / CAPA * 100) : 0;
                        const over = effectif > CAPA;
                        const barCol = over ? C.red : pct > 80 ? C.orange : pct > 0 ? C.green : C.muted;
                        const nbOps = dj.ops.length;

                        const availOps   = opsPoste(poste.id).filter(m => !dj.ops.includes(m.id));
                        const cellKey    = `${poste.id}|${date}|${slot}`;
                        const showAddOp  = addOpKey  === cellKey;
                        const showAddCmd = addCmdKey === cellKey;

                        const cmdsDispos = commandes.filter(c => {
                          if (dj.cmds.find(ac => ac.commandeId === String(c.id))) return false;
                          const t = calcTempsType(c.type, c.quantite, (c as any).hsTemps ?? null);
                          return t && (t.par_poste[poste.id as PosteId] ?? 0) > 0;
                        });

                        return (
                          <div key={slot} style={{
                            padding: "4px 6px",
                            borderBottom: si === 0 ? `1px solid ${C.border}` : "none",
                            minHeight: 72,
                          }}>
                            {/* Entête demi-journée + temps */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                              <span style={{ fontSize: 8, fontWeight: 700, color: C.muted, letterSpacing: 1 }}>{slot.toUpperCase()}</span>
                              {total > 0 && (
                                <span style={{ fontSize: 8, color: barCol, fontWeight: 700, fontFamily: "monospace" }}>
                                  {nbOps > 1
                                    ? <>{hm(total)}<span style={{ color: C.sec }}> ÷{nbOps} = </span>{hm(effectif)}</>
                                    : hm(effectif)
                                  }
                                </span>
                              )}
                            </div>

                            {/* Opérateurs */}
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 2, marginBottom: 4 }}>
                              {dj.ops.map(opId => {
                                const op = EQUIPE.find(m => m.id === opId);
                                if (!op) return null;
                                return (
                                  <span key={opId}
                                    title={`${op.nom} — cliquer pour retirer`}
                                    onClick={() => doRemoveOp(poste.id, date, slot, opId)}
                                    style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: poste.color + "28", border: `1px solid ${poste.color}66`, color: poste.color, cursor: "pointer", fontWeight: 600, userSelect: "none" }}>
                                    {op.nom.split(/[\s-]/)[0]}
                                  </span>
                                );
                              })}
                              {availOps.length > 0 && (
                                showAddOp ? (
                                  <select autoFocus
                                    style={{ fontSize: 9, padding: "1px 4px", background: C.bg, border: `1px solid ${poste.color}`, borderRadius: 3, color: C.text, maxWidth: 108 }}
                                    onBlur={() => setAddOpKey(null)}
                                    onChange={e => e.target.value && doAddOp(poste.id, date, slot, e.target.value)}>
                                    <option value="">— opérateur</option>
                                    {availOps.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
                                  </select>
                                ) : (
                                  <span
                                    onClick={() => { setAddCmdKey(null); setAddOpKey(cellKey); }}
                                    style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, border: `1px dashed ${C.border}`, color: C.sec, cursor: "pointer", userSelect: "none" }}>
                                    +
                                  </span>
                                )
                              )}
                            </div>

                            {/* Commandes */}
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 2, marginBottom: 4 }}>
                              {dj.cmds.map(ac => {
                                const cmd = commandes.find(c => String(c.id) === ac.commandeId);
                                if (!cmd) return null;
                                const t  = calcTempsType(cmd.type, ac.quantite || cmd.quantite, (cmd as any).hsTemps ?? null);
                                const tP = t?.par_poste[poste.id as PosteId] ?? 0;
                                const tE = nbOps > 1 ? Math.round(tP / nbOps) : tP;
                                const num = (cmd as any).num_commande ?? String(cmd.id);
                                const cli = (cmd as any).client ?? "";
                                return (
                                  <span key={ac.commandeId}
                                    title={`${cli} — ${num} | ${hm(tP)}${nbOps > 1 ? ` ÷${nbOps} = ${hm(tE)}` : ""} · Cliquer pour retirer`}
                                    onClick={() => doRemoveCmd(poste.id, date, slot, ac.commandeId)}
                                    style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: C.s2, border: `1px solid ${C.bLight}`, color: C.text, cursor: "pointer", maxWidth: 118, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", userSelect: "none", display: "inline-flex", alignItems: "center", gap: 2 }}>
                                    <span>{num}</span>
                                    {tE > 0 && <span style={{ color: C.teal, fontFamily: "monospace" }}>·{hm(tE)}</span>}
                                  </span>
                                );
                              })}
                              {cmdsDispos.length > 0 && (
                                showAddCmd ? (
                                  <select autoFocus
                                    style={{ fontSize: 9, padding: "1px 4px", background: C.bg, border: `1px solid ${C.orange}`, borderRadius: 3, color: C.text, maxWidth: 138 }}
                                    onBlur={() => setAddCmdKey(null)}
                                    onChange={e => e.target.value && doAddCmd(poste.id, date, slot, e.target.value)}>
                                    <option value="">— commande</option>
                                    {cmdsDispos.map(c => {
                                      const t  = calcTempsType(c.type, c.quantite, (c as any).hsTemps ?? null);
                                      const tP = t?.par_poste[poste.id as PosteId] ?? 0;
                                      const num = (c as any).num_commande ?? String(c.id);
                                      const cli = (c as any).client ?? "";
                                      return (
                                        <option key={String(c.id)} value={String(c.id)}>
                                          {num} — {cli} ({hm(tP)})
                                        </option>
                                      );
                                    })}
                                  </select>
                                ) : (
                                  <span
                                    onClick={() => { setAddOpKey(null); setAddCmdKey(cellKey); }}
                                    style={{ fontSize: 8, padding: "1px 6px", borderRadius: 3, border: `1px dashed ${C.border}`, color: C.sec, cursor: "pointer", userSelect: "none" }}>
                                    + cmd
                                  </span>
                                )
                              )}
                            </div>

                            {/* Barre de capacité */}
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
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const btnNav = {
  padding: "4px 10px", background: "none", border: `1px solid ${C.border}`,
  borderRadius: 4, color: C.sec, cursor: "pointer", fontSize: 11,
};
const thSt = {
  padding: "6px 8px", background: C.s1, borderBottom: `1px solid ${C.border}`,
  borderRight: `1px solid ${C.border}`, color: C.sec, fontSize: 10, fontWeight: 700,
  textAlign: "left" as const, whiteSpace: "nowrap" as const,
};
const tdLabel = {
  padding: "8px", background: C.s1, borderBottom: `1px solid ${C.border}`,
  borderRight: `1px solid ${C.border}`, verticalAlign: "middle" as const,
};
const tdBase = {
  padding: 0, borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`,
  background: C.bg, verticalAlign: "top" as const,
};
