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
const PHASE_COMPETENCE: Record<string, string> = {
  coupe: "coupe", montage: "frappes", vitrage: "vitrage", logistique: "logistique",
};
const PHASE_FIELD: Record<string, string> = {
  coupe: "semaine_coupe", montage: "semaine_montage", vitrage: "semaine_vitrage", logistique: "semaine_logistique",
};

const OPS = EQUIPE.map(op => ({ id: op.id, nom: op.nom, competences: op.competences, vendrediOff: op.vendrediOff }));

// Minutes par demi-journée standard
const DEMI_JOURNEE_MIN = 240; // 4h

// ── Types ────────────────────────────────────────────────────────────────────

// Clé : "postId|jourIdx|demi"  →  liste de noms d'opérateurs affectés
type AffectationsMap = Record<string, string[]>;

// ── Composant principal ──────────────────────────────────────────────────────

export default function PlanningAffectations({ commandes, viewWeek }: {
  commandes: CommandeCC[];
  viewWeek: string;
}) {
  const [affectations, setAffectations] = useState<AffectationsMap>({});

  // Calculer le travail par poste cette semaine
  const postWork = useMemo(() => {
    const work: Record<string, { totalMin: number; cmds: Array<{ client: string; ref: string; type: string; min: number }> }> = {};

    for (const cmd of commandes) {
      const s = (cmd as any).statut;
      if (s === "livre" || s === "terminee" || s === "annulee") continue;
      if (!cmd.type || cmd.type === "intervention_chantier") continue;

      const routage = getRoutage(cmd.type, cmd.quantite, (cmd as any).hsTemps as Record<string, unknown> | null);
      const tm = (TYPES_MENUISERIE as Record<string, any>)[cmd.type];

      for (const grp of POST_GROUPS) {
        const field = PHASE_FIELD[grp.phase];
        if ((cmd as any)[field] !== viewWeek) continue;

        for (const e of routage.filter(r => r.phase === grp.phase)) {
          if (!work[e.postId]) work[e.postId] = { totalMin: 0, cmds: [] };
          work[e.postId].totalMin += e.estimatedMin;
          if (!work[e.postId].cmds.some(c => c.client === (cmd as any).client && c.ref === ((cmd as any).ref_chantier || ""))) {
            work[e.postId].cmds.push({
              client: (cmd as any).client,
              ref: (cmd as any).ref_chantier || "",
              type: tm?.label || cmd.type,
              min: e.estimatedMin,
            });
          }
        }
      }
    }
    return work;
  }, [commandes, viewWeek]);

  // Postes actifs
  const activePosts = useMemo(() => {
    return POST_GROUPS.map(grp => ({
      ...grp,
      posts: grp.ids.filter(pid => postWork[pid]?.totalMin > 0),
    })).filter(grp => grp.posts.length > 0);
  }, [postWork]);

  const cellKey = (postId: string, jour: number, demi: string) => `${postId}|${jour}|${demi}`;

  const toggleOp = useCallback((key: string, opNom: string) => {
    setAffectations(prev => {
      const cur = prev[key] || [];
      const next = cur.includes(opNom) ? cur.filter(o => o !== opNom) : [...cur, opNom];
      return { ...prev, [key]: next };
    });
  }, []);

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
    return (
      <div style={{ textAlign: "center", padding: 40, color: C.sec }}>
        Aucun poste actif en {weekId(viewWeek)}.
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ padding: "6px 8px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "left", fontSize: 10, color: C.sec, width: 100 }}>POSTE</th>
            <th style={{ padding: "6px 4px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 10, color: C.sec, width: 50 }}>CHARGE</th>
            <th style={{ padding: "6px 4px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 10, color: C.sec, width: 40 }}>PERS.</th>
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
              <td colSpan={3 + 10} style={{ padding: "5px 8px", background: grp.color + "15", borderBottom: `2px solid ${grp.color}`, fontSize: 10, fontWeight: 700, color: grp.color, textTransform: "uppercase", letterSpacing: 1 }}>
                {grp.label}
              </td>
            </tr>,
            ...grp.posts.map(pid => {
              const pw = postWork[pid];
              // Combien de personnes nécessaires ? total min / (10 demi-journées × 240 min)
              const totalDemiJournees = pw.totalMin / DEMI_JOURNEE_MIN;
              const persNeeded = Math.max(1, Math.ceil(totalDemiJournees / 10));
              // Opérateurs compétents pour ce poste
              const competentOps = OPS.filter(op => op.competences.includes(PHASE_COMPETENCE[grp.phase]));
              // Heures déjà affectées cette semaine
              let affectedMin = 0;
              for (let j = 0; j < 5; j++) {
                for (const d of ["matin", "aprem"]) {
                  const ops = affectations[cellKey(pid, j, d)] || [];
                  affectedMin += ops.length * DEMI_JOURNEE_MIN;
                }
              }
              const pctDone = pw.totalMin > 0 ? Math.round(affectedMin / pw.totalMin * 100) : 0;
              const barColor = pctDone >= 100 ? C.green : pctDone >= 50 ? C.orange : C.red;

              return (
                <tr key={pid} style={{ borderBottom: `1px solid ${C.border}` }}>
                  {/* Poste */}
                  <td style={{ padding: "5px 8px", background: C.s1, border: `1px solid ${C.border}`, verticalAlign: "top" }}>
                    <div style={{ fontWeight: 700, color: grp.color }}>{pid}</div>
                    <div style={{ fontSize: 9, color: C.muted }}>{POST_LABELS[pid]}</div>
                    {pw.cmds.map((c, i) => (
                      <div key={i} style={{ fontSize: 8, color: C.sec, marginTop: 1 }}>{c.client} {hm(c.min)}</div>
                    ))}
                  </td>
                  {/* Charge totale */}
                  <td style={{ padding: "4px 4px", border: `1px solid ${C.border}`, textAlign: "center", verticalAlign: "top" }}>
                    <div className="mono" style={{ fontWeight: 700, color: grp.color, fontSize: 12 }}>{hm(pw.totalMin)}</div>
                    <div style={{ height: 4, background: C.s2, borderRadius: 2, overflow: "hidden", marginTop: 3 }}>
                      <div style={{ width: `${Math.min(pctDone, 100)}%`, height: "100%", background: barColor, borderRadius: 2 }} />
                    </div>
                    <div style={{ fontSize: 8, color: barColor, marginTop: 1 }}>{pctDone}% affecté</div>
                  </td>
                  {/* Personnes nécessaires */}
                  <td style={{ padding: "4px 4px", border: `1px solid ${C.border}`, textAlign: "center", verticalAlign: "top" }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: grp.color }}>{persNeeded}</div>
                    <div style={{ fontSize: 8, color: C.muted }}>pers.</div>
                  </td>
                  {/* 10 créneaux */}
                  {JOURS.map((j, jourIdx) => ["matin", "aprem"].map(demi => {
                    const key = cellKey(pid, jourIdx, demi);
                    const assigned = affectations[key] || [];

                    return (
                      <td key={`${j}_${demi}`} style={{
                        padding: "3px 3px", border: `1px solid ${jourIdx === todayIdx ? C.orange + "44" : C.border}`,
                        background: assigned.length > 0 ? grp.color + "08" : C.bg, verticalAlign: "top",
                      }}>
                        <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                          {competentOps.map(op => {
                            const isOff = (jourIdx === 4 && op.vendrediOff) || (jourIdx === 4 && demi === "aprem" && op.id === "jp");
                            if (isOff) return null;
                            const isOn = assigned.includes(op.nom);
                            return (
                              <button key={op.id} onClick={() => toggleOp(key, op.nom)}
                                style={{
                                  fontSize: 8, padding: "2px 4px", borderRadius: 3, cursor: "pointer", border: "none",
                                  background: isOn ? grp.color : C.s2,
                                  color: isOn ? "#000" : C.muted,
                                  fontWeight: isOn ? 800 : 400,
                                }}
                              >
                                {op.nom}
                              </button>
                            );
                          })}
                        </div>
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
  );
}
