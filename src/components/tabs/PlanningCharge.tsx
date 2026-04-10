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

  const prevWeek = () => { const d = new Date(viewWeek + "T00:00:00"); d.setDate(d.getDate() - 7); setViewWeek(localStr(d)); };
  const nextWeek = () => { const d = new Date(viewWeek + "T00:00:00"); d.setDate(d.getDate() + 7); setViewWeek(localStr(d)); };

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

      {/* ── Tableau commandes avec sélecteurs semaine ── */}
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
          <tbody>
            {cmdList.map(({ cmd, parPhase, cc, tm, famille }) => {
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
                        <div style={{ fontSize: 9, color: C.sec, marginTop: 1 }}>
                          {operators.join(", ")}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {cmdList.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: C.sec }}>Aucune commande active.</div>
      )}
    </div>
  );
}
