"use client";
import { useState, useMemo, useCallback } from "react";
import { C, TYPES_MENUISERIE, EQUIPE, hm, CommandeCC } from "@/lib/sial-data";
import { getRoutage } from "@/lib/routage-production";

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
const DEMI = ["matin", "aprèm"] as const;

const PHASE_CONFIG = [
  { id: "coupe",      label: "Coupe",      color: "#42A5F5", field: "semaine_coupe",      competence: "coupe" },
  { id: "montage",    label: "Montage",    color: "#FFA726", field: "semaine_montage",    competence: "frappes" },
  { id: "vitrage",    label: "Vitrage",    color: "#26C6DA", field: "semaine_vitrage",    competence: "vitrage" },
  { id: "logistique", label: "Logistique", color: "#CE93D8", field: "semaine_logistique", competence: "logistique" },
];

// ── Opérateurs avec leur capacité par demi-journée ──────────────────────────

const OPERATORS = EQUIPE.map(op => {
  // Minutes par demi-journée (L-J vs V)
  const minLJ = op.h === 39 ? 240 : op.h === 36 ? 240 : op.h === 35 ? 210 : op.h === 30 ? 225 : 240;
  const minV  = op.vendrediOff ? 0 : op.h === 39 ? 210 : op.h === 36 ? 120 : op.h === 35 ? 210 : 210;
  // JP vendredi : 240 matin, 0 aprèm
  return { id: op.id, nom: op.nom, competences: op.competences, minLJ, minV, vendrediOff: op.vendrediOff };
});

// ── Types ────────────────────────────────────────────────────────────────────

// Clé d'affectation : "operateur_id|jour_index|demi"
// Valeur : { postId, cmdId, cmdLabel, min }
interface Affectation {
  postId: string;
  cmdId: string;
  cmdLabel: string;
  phase: string;
  min: number;
  color: string;
}

type AffectationsMap = Record<string, Affectation | null>;

// ── Composant principal ──────────────────────────────────────────────────────

export default function PlanningAffectations({ commandes, viewWeek }: {
  commandes: CommandeCC[];
  viewWeek: string;
}) {
  const [affectations, setAffectations] = useState<AffectationsMap>({});
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const mondayStr = viewWeek;

  // Commandes planifiées cette semaine (au moins une phase)
  const weekCmds = useMemo(() => {
    return commandes
      .filter(cmd => {
        const s = (cmd as any).statut;
        if (s === "livre" || s === "terminee" || s === "annulee") return false;
        return PHASE_CONFIG.some(ph => (cmd as any)[ph.field] === mondayStr);
      })
      .map(cmd => {
        const routage = getRoutage(cmd.type, cmd.quantite, (cmd as any).hsTemps as Record<string, unknown> | null);
        const tm = (TYPES_MENUISERIE as Record<string, any>)[cmd.type];
        // Phases actives cette semaine
        const phases: Array<{ phase: string; phaseLabel: string; color: string; min: number; postIds: string[] }> = [];
        for (const ph of PHASE_CONFIG) {
          if ((cmd as any)[ph.field] !== mondayStr) continue;
          const etapes = routage.filter(e => e.phase === ph.id);
          const min = etapes.reduce((s, e) => s + e.estimatedMin, 0);
          if (min > 0) {
            phases.push({ phase: ph.id, phaseLabel: ph.label, color: ph.color, min, postIds: etapes.map(e => e.postId).filter((v, i, a) => a.indexOf(v) === i) });
          }
        }
        return { cmd, tm, phases, label: `${(cmd as any).client} — ${(cmd as any).ref_chantier || ""}`.trim() };
      })
      .filter(c => c.phases.length > 0);
  }, [commandes, mondayStr]);

  // Construire la liste des tâches disponibles pour affecter
  const availableTasks = useMemo(() => {
    const tasks: Array<{ id: string; label: string; phase: string; color: string; postIds: string[]; min: number; cmdId: string }> = [];
    for (const c of weekCmds) {
      for (const ph of c.phases) {
        tasks.push({
          id: `${c.cmd.id}_${ph.phase}`,
          label: `${(c.cmd as any).client} · ${ph.phaseLabel}`,
          phase: ph.phase,
          color: ph.color,
          postIds: ph.postIds,
          min: ph.min,
          cmdId: String(c.cmd.id),
        });
      }
    }
    return tasks;
  }, [weekCmds]);

  const cellKey = (opId: string, jour: number, demi: string) => `${opId}|${jour}|${demi}`;

  const setAffectation = useCallback((key: string, task: Affectation | null) => {
    setAffectations(prev => ({ ...prev, [key]: task }));
    setEditingCell(null);
  }, []);

  const todayStr = localStr(new Date());
  const todayIdx = (() => {
    for (let i = 0; i < 5; i++) {
      const d = new Date(mondayStr + "T00:00:00");
      d.setDate(d.getDate() + i);
      if (localStr(d) === todayStr) return i;
    }
    return -1;
  })();

  return (
    <div>
      {/* ── Commandes de la semaine (résumé) ── */}
      {weekCmds.length === 0 ? (
        <div style={{ textAlign: "center", padding: 30, color: C.sec, background: C.s1, borderRadius: 6, border: `1px solid ${C.border}`, marginBottom: 16 }}>
          Aucune commande planifiée en {weekId(viewWeek)}. Va dans l&apos;onglet Charge pour affecter des semaines.
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {weekCmds.map(c => (
            <div key={String(c.cmd.id)} style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 4, padding: "4px 8px", fontSize: 10 }}>
              <span style={{ fontWeight: 700 }}>{(c.cmd as any).client}</span>
              <span style={{ color: C.sec, marginLeft: 4 }}>{c.cmd.quantite}× {c.tm?.label || c.cmd.type}</span>
              <div style={{ display: "flex", gap: 3, marginTop: 2 }}>
                {c.phases.map(ph => (
                  <span key={ph.phase} style={{ padding: "0 4px", borderRadius: 2, background: ph.color + "22", color: ph.color, fontSize: 9, fontWeight: 700 }}>
                    {ph.phaseLabel} {hm(ph.min)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Grille opérateurs × jours × demi-journées ── */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ padding: "6px 8px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "left", fontSize: 10, color: C.sec, width: 110 }}>OPÉRATEUR</th>
              {JOURS.map((j, jIdx) => (
                <th key={j} colSpan={2} style={{
                  padding: "6px 4px", background: jIdx === todayIdx ? C.s2 : C.s1,
                  border: `1px solid ${jIdx === todayIdx ? C.orange : C.border}`,
                  textAlign: "center", fontSize: 11, color: jIdx === todayIdx ? C.orange : C.sec, fontWeight: jIdx === todayIdx ? 700 : 400,
                }}>
                  {j}
                </th>
              ))}
            </tr>
            <tr>
              <th style={{ background: C.s2, border: `1px solid ${C.border}` }} />
              {JOURS.map((j) => DEMI.map(d => (
                <th key={`${j}_${d}`} style={{
                  padding: "3px 4px", background: C.s1, border: `1px solid ${C.border}`,
                  textAlign: "center", fontSize: 9, color: C.muted, fontWeight: 400, width: 80,
                }}>
                  {d === "matin" ? "AM" : "PM"}
                </th>
              )))}
            </tr>
          </thead>
          <tbody>
            {OPERATORS.map(op => (
              <tr key={op.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "6px 8px", background: C.s1, border: `1px solid ${C.border}`, verticalAlign: "top" }}>
                  <div style={{ fontWeight: 700, fontSize: 11 }}>{op.nom}</div>
                  <div style={{ fontSize: 8, color: C.muted }}>{op.competences.join(", ")}</div>
                </td>
                {JOURS.map((j, jourIdx) => DEMI.map(demi => {
                  const key = cellKey(op.id, jourIdx, demi);
                  const aff = affectations[key];
                  const isEditing = editingCell === key;
                  const isVendredi = jourIdx === 4;
                  const isOff = (isVendredi && op.vendrediOff) || (isVendredi && demi === "aprèm" && op.id === "jp");
                  const minDispo = isVendredi ? (demi === "matin" ? Math.min(op.minV, 240) : (op.id === "jp" ? 0 : Math.max(op.minV - 240, 0))) : op.minLJ;

                  if (isOff || minDispo === 0) {
                    return (
                      <td key={`${j}_${demi}`} style={{ background: C.s2 + "66", border: `1px solid ${C.border}`, textAlign: "center", color: C.muted, fontSize: 9 }}>
                        OFF
                      </td>
                    );
                  }

                  // Tâches compatibles avec les compétences de cet opérateur
                  const compatibleTasks = availableTasks.filter(t => {
                    const phCfg = PHASE_CONFIG.find(p => p.id === t.phase);
                    return phCfg && op.competences.includes(phCfg.competence);
                  });

                  return (
                    <td key={`${j}_${demi}`} style={{
                      padding: "3px 4px", border: `1px solid ${jourIdx === todayIdx ? C.orange + "44" : C.border}`,
                      background: aff ? aff.color + "10" : C.bg, verticalAlign: "top", cursor: "pointer", minWidth: 80,
                    }}
                      onClick={() => setEditingCell(isEditing ? null : key)}
                    >
                      {aff ? (
                        <div style={{ borderLeft: `3px solid ${aff.color}`, paddingLeft: 4, borderRadius: 2 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{aff.cmdLabel}</div>
                          <div style={{ fontSize: 9, color: aff.color }}>{aff.postId} · {hm(aff.min)}</div>
                          <button onClick={(e) => { e.stopPropagation(); setAffectation(key, null); }} style={{ fontSize: 8, color: C.red, background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 2 }}>✕ retirer</button>
                        </div>
                      ) : isEditing ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          {compatibleTasks.length === 0 ? (
                            <div style={{ fontSize: 9, color: C.muted, fontStyle: "italic" }}>Pas de tâche compatible</div>
                          ) : compatibleTasks.map(t => (
                            <button key={t.id} onClick={(e) => {
                              e.stopPropagation();
                              setAffectation(key, { postId: t.postIds[0], cmdId: t.cmdId, cmdLabel: t.label, phase: t.phase, min: Math.min(t.min, minDispo), color: t.color });
                            }} style={{
                              fontSize: 9, padding: "3px 5px", background: t.color + "15", border: `1px solid ${t.color}44`,
                              borderRadius: 3, color: t.color, cursor: "pointer", textAlign: "left", fontWeight: 600,
                            }}>
                              {t.label} ({hm(t.min)})
                            </button>
                          ))}
                          <button onClick={(e) => { e.stopPropagation(); setEditingCell(null); }} style={{ fontSize: 8, color: C.muted, background: "none", border: "none", cursor: "pointer" }}>annuler</button>
                        </div>
                      ) : (
                        <div style={{ fontSize: 9, color: C.muted, textAlign: "center", padding: "6px 0" }}>+</div>
                      )}
                    </td>
                  );
                }))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
