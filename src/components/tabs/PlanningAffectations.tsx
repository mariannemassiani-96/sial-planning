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

const JOURS_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven"];

const POST_GROUPS = [
  { label: "Coupe & Prépa", color: "#42A5F5", phase: "coupe", ids: ["C2","C3","C4","C5","C6"] },
  { label: "Montage",       color: "#FFA726", phase: "montage", ids: ["M1","M2","M3","F1","F2","F3"] },
  { label: "Vitrage",       color: "#26C6DA", phase: "vitrage", ids: ["V1","V2","V3"] },
  { label: "Logistique",    color: "#CE93D8", phase: "logistique", ids: ["L4","L6","L7"] },
];
const POST_LABELS: Record<string, string> = {
  C2:"Prépa barres",C3:"Coupe LMT",C4:"Coupe 2 têtes",C5:"Renfort acier",C6:"Soudure PVC",
  M1:"Dorm. couliss.",M2:"Dorm. galand.",M3:"Portes ALU",F1:"Dorm. frappe ALU",F2:"Ouv.+ferrage",F3:"Mise bois+CQ",
  V1:"Vitr. Frappe",V2:"Vitr. Coul/Gal",V3:"Emballage",
  L4:"Prépa acc.",L6:"Palettes",L7:"Chargement",
};
const PHASE_FIELD: Record<string, string> = {
  coupe: "semaine_coupe", montage: "semaine_montage", vitrage: "semaine_vitrage", logistique: "semaine_logistique",
};

const OPS = EQUIPE.map(op => ({ id: op.id, nom: op.nom, competences: op.competences, vendrediOff: op.vendrediOff }));
const DEMI_JOURNEE_MIN = 240;

// Couleurs opérateurs
const OP_COLORS: Record<string, string> = {
  guillaume:"#CE93D8", momo:"#4DB6AC", bruno:"#FFA726", ali:"#26C6DA",
  jp:"#FF7043", jf:"#66BB6A", michel:"#42A5F5", alain:"#FFCA28",
  francescu:"#AB47BC", julien:"#80CBC4", laurent:"#A5D6A7",
  mateo:"#EF5350", kentin:"#7E57C2",
};

// ── Types ────────────────────────────────────────────────────────────────────

// Cellule poste : "postId|jourIdx|demi" → opérateurs affectés
type PostAffectations = Record<string, string[]>;
// Cellule commande : "cmdId|jourIdx" → positionné sur ce jour
type CmdDayMap = Record<string, number>; // cmdId → jourIdx

// ── Composant principal ──────────────────────────────────────────────────────

export default function PlanningAffectations({ commandes, viewWeek }: {
  commandes: CommandeCC[];
  viewWeek: string;
}) {
  const [affectations, setAffectations] = useState<PostAffectations>({});
  const [dragOp, setDragOp] = useState<string | null>(null);
  const [dragCmd, setDragCmd] = useState<{ id: string; label: string } | null>(null);
  const [cmdDays, setCmdDays] = useState<CmdDayMap>({});
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // Travail par poste cette semaine
  const postWork = useMemo(() => {
    const work: Record<string, { totalMin: number; cmds: Array<{ id: string; client: string; ref: string; type: string; min: number }> }> = {};
    for (const cmd of commandes) {
      const s = (cmd as any).statut;
      if (s === "livre" || s === "terminee" || s === "annulee") continue;
      if (!cmd.type || cmd.type === "intervention_chantier") continue;
      const routage = getRoutage(cmd.type, cmd.quantite, (cmd as any).hsTemps as Record<string, unknown> | null);
      const tm = (TYPES_MENUISERIE as Record<string, any>)[cmd.type];
      for (const grp of POST_GROUPS) {
        if ((cmd as any)[PHASE_FIELD[grp.phase]] !== viewWeek) continue;
        for (const e of routage.filter(r => r.phase === grp.phase)) {
          if (!work[e.postId]) work[e.postId] = { totalMin: 0, cmds: [] };
          if (!work[e.postId].cmds.some(c => c.id === String(cmd.id))) {
            work[e.postId].totalMin += e.estimatedMin;
            work[e.postId].cmds.push({ id: String(cmd.id), client: (cmd as any).client, ref: (cmd as any).ref_chantier || "", type: tm?.label || cmd.type, min: e.estimatedMin });
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

  const cellKey = (pid: string, j: number, d: string) => `${pid}|${j}|${d}`;

  // ── Drag & Drop opérateurs ─────────────────────────────────────────────────

  const onDragStartOp = useCallback((e: React.DragEvent, opNom: string) => {
    setDragOp(opNom);
    setDragCmd(null);
    e.dataTransfer.setData("text/plain", `op:${opNom}`);
    e.dataTransfer.effectAllowed = "copy";
  }, []);

  const onDropOnCell = useCallback((key: string) => {
    if (dragOp) {
      setAffectations(prev => {
        const cur = prev[key] || [];
        if (cur.includes(dragOp)) return prev;
        return { ...prev, [key]: [...cur, dragOp] };
      });
    }
    setDragOp(null);
    setDropTarget(null);
  }, [dragOp]);

  const removeOpFromCell = useCallback((key: string, opNom: string) => {
    setAffectations(prev => {
      const cur = prev[key] || [];
      return { ...prev, [key]: cur.filter(o => o !== opNom) };
    });
  }, []);

  // ── Drag & Drop commandes ──────────────────────────────────────────────────

  const onDragStartCmd = useCallback((e: React.DragEvent, cmdId: string, label: string) => {
    setDragCmd({ id: cmdId, label });
    setDragOp(null);
    e.dataTransfer.setData("text/plain", `cmd:${cmdId}`);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const onDropOnDay = useCallback((jourIdx: number) => {
    if (dragCmd) {
      setCmdDays(prev => ({ ...prev, [dragCmd.id]: jourIdx }));
    }
    setDragCmd(null);
    setDropTarget(null);
  }, [dragCmd]);

  const todayIdx = (() => {
    const today = localStr(new Date());
    for (let i = 0; i < 5; i++) {
      const d = new Date(viewWeek + "T00:00:00");
      d.setDate(d.getDate() + i);
      if (localStr(d) === today) return i;
    }
    return -1;
  })();

  if (activePosts.length === 0) {
    return <div style={{ textAlign: "center", padding: 40, color: C.sec }}>Aucun poste actif en {weekId(viewWeek)}.</div>;
  }

  return (
    <div>
      {/* ── Palette opérateurs (drag source) ── */}
      <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 12px", marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: C.sec, marginBottom: 6, fontWeight: 700 }}>OPÉRATEURS — glisse vers un poste</div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {OPS.map(op => (
            <div
              key={op.id}
              draggable
              onDragStart={(e) => onDragStartOp(e, op.nom)}
              style={{
                padding: "4px 10px", borderRadius: 4, cursor: "grab", userSelect: "none",
                background: OP_COLORS[op.id] || C.s2,
                color: "#000", fontSize: 11, fontWeight: 700,
              }}
            >
              {op.nom}
            </div>
          ))}
        </div>
      </div>

      {/* ── Grille postes × jours ── */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ padding: "6px 8px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "left", fontSize: 10, color: C.sec, width: 100 }}>POSTE</th>
              <th style={{ padding: "6px 4px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 10, color: C.sec, width: 50 }}>CHARGE</th>
              {JOURS_LABELS.map((j, jIdx) => (
                <th key={j} colSpan={2}
                  onDragOver={dragCmd ? (e) => { e.preventDefault(); setDropTarget(`day-${jIdx}`); } : undefined}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={dragCmd ? () => onDropOnDay(jIdx) : undefined}
                  style={{
                    padding: "6px 4px",
                    background: jIdx === todayIdx ? C.s2 : dropTarget === `day-${jIdx}` ? C.orange + "22" : C.s1,
                    border: `1px solid ${jIdx === todayIdx ? C.orange : dropTarget === `day-${jIdx}` ? C.orange : C.border}`,
                    textAlign: "center", fontSize: 11,
                    color: jIdx === todayIdx ? C.orange : C.sec,
                  }}
                >
                  {j}
                </th>
              ))}
            </tr>
            <tr>
              <th colSpan={2} style={{ background: C.s2, border: `1px solid ${C.border}` }} />
              {JOURS_LABELS.map((j) => ["AM", "PM"].map(d => (
                <th key={`${j}_${d}`} style={{ padding: "2px 2px", background: C.s1, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 8, color: C.muted, width: 70 }}>
                  {d}
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
                const persNeeded = Math.max(1, Math.ceil(pw.totalMin / DEMI_JOURNEE_MIN / 10));
                let affectedMin = 0;
                for (let j = 0; j < 5; j++) for (const d of ["am", "pm"]) {
                  affectedMin += (affectations[cellKey(pid, j, d)]?.length || 0) * DEMI_JOURNEE_MIN;
                }
                const pctDone = pw.totalMin > 0 ? Math.min(100, Math.round(affectedMin / pw.totalMin * 100)) : 0;
                const barColor = pctDone >= 100 ? C.green : pctDone >= 50 ? C.orange : C.red;

                return (
                  <tr key={pid} style={{ borderBottom: `1px solid ${C.border}` }}>
                    {/* Poste + commandes */}
                    <td style={{ padding: "5px 8px", background: C.s1, border: `1px solid ${C.border}`, verticalAlign: "top" }}>
                      <div style={{ fontWeight: 700, color: grp.color }}>{pid} <span style={{ fontWeight: 400, color: C.muted }}>{POST_LABELS[pid]}</span></div>
                      {pw.cmds.map((c, i) => (
                        <div key={i}
                          draggable
                          onDragStart={(e) => onDragStartCmd(e, c.id, c.client)}
                          style={{ fontSize: 9, color: C.sec, marginTop: 2, padding: "2px 4px", background: C.bg, borderRadius: 2, cursor: "grab", userSelect: "none", borderLeft: `2px solid ${grp.color}` }}
                        >
                          <span style={{ fontWeight: 600 }}>{c.client}</span> {hm(c.min)}
                          {cmdDays[c.id] !== undefined && (
                            <span style={{ marginLeft: 4, fontSize: 8, color: grp.color, fontWeight: 700 }}>{JOURS_LABELS[cmdDays[c.id]]}</span>
                          )}
                        </div>
                      ))}
                    </td>
                    {/* Charge */}
                    <td style={{ padding: "4px 4px", border: `1px solid ${C.border}`, textAlign: "center", verticalAlign: "top" }}>
                      <div className="mono" style={{ fontWeight: 700, color: grp.color, fontSize: 11 }}>{hm(pw.totalMin)}</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: grp.color }}>{persNeeded} pers.</div>
                      <div style={{ height: 4, background: C.s2, borderRadius: 2, overflow: "hidden", marginTop: 2 }}>
                        <div style={{ width: `${pctDone}%`, height: "100%", background: barColor, borderRadius: 2 }} />
                      </div>
                      <div style={{ fontSize: 8, color: barColor }}>{pctDone}%</div>
                    </td>
                    {/* 10 créneaux */}
                    {JOURS_LABELS.map((j, jourIdx) => ["am", "pm"].map(demi => {
                      const key = cellKey(pid, jourIdx, demi);
                      const assigned = affectations[key] || [];
                      const isDropZone = dropTarget === key;

                      return (
                        <td key={`${j}_${demi}`}
                          onDragOver={(e) => { e.preventDefault(); setDropTarget(key); }}
                          onDragLeave={() => { if (dropTarget === key) setDropTarget(null); }}
                          onDrop={() => onDropOnCell(key)}
                          style={{
                            padding: "3px 3px",
                            border: `1px solid ${isDropZone ? C.orange : jourIdx === todayIdx ? C.orange + "44" : C.border}`,
                            background: isDropZone ? grp.color + "18" : assigned.length > 0 ? grp.color + "08" : C.bg,
                            verticalAlign: "top", minHeight: 30,
                          }}
                        >
                          {assigned.length > 0 ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                              {assigned.map(opNom => {
                                const op = OPS.find(o => o.nom === opNom);
                                return (
                                  <div key={opNom} style={{
                                    display: "flex", alignItems: "center", justifyContent: "space-between",
                                    padding: "2px 4px", borderRadius: 3,
                                    background: OP_COLORS[op?.id || ""] || C.s2,
                                    color: "#000", fontSize: 9, fontWeight: 700,
                                  }}>
                                    {opNom}
                                    <span onClick={() => removeOpFromCell(key, opNom)}
                                      style={{ cursor: "pointer", marginLeft: 4, fontSize: 8, opacity: 0.6 }}>✕</span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div style={{ color: C.muted, textAlign: "center", padding: "6px 0", fontSize: 10 }}>
                              {isDropZone ? "▼" : ""}
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
