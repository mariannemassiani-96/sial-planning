"use client";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { C, EQUIPE, hm, CommandeCC } from "@/lib/sial-data";
import { getRoutage } from "@/lib/routage-production";
import { openPrintWindow } from "@/lib/print-utils";

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
  { label: "Montage",       color: "#FFA726", phase: "montage", competence: "frappes", ids: ["M1","M2","M3","F1","F2","F3"] },
  { label: "Vitrage",       color: "#26C6DA", phase: "vitrage", competence: "vitrage", ids: ["V1","V2","V3"] },
  { label: "Logistique",    color: "#CE93D8", phase: "logistique", competence: "logistique", ids: ["L4","L6","L7"] },
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
const OP_COLORS: Record<string, string> = {
  guillaume:"#CE93D8", momo:"#4DB6AC", bruno:"#FFA726", ali:"#26C6DA",
  jp:"#FF7043", jf:"#66BB6A", michel:"#42A5F5", alain:"#FFCA28",
  francescu:"#AB47BC", julien:"#80CBC4", laurent:"#A5D6A7", mateo:"#EF5350", kentin:"#7E57C2",
};
const DEMI_MIN = 240;

// ── Types ────────────────────────────────────────────────────────────────────

type AffMap = Record<string, string[]>; // "postId|jourIdx|demi" → opérateurs

// ── Composant ────────────────────────────────────────────────────────────────

export default function PlanningAffectations({ commandes, viewWeek }: {
  commandes: CommandeCC[];
  viewWeek: string;
}) {
  const [aff, setAff] = useState<AffMap>({});
  const [dragOp, setDragOp] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Charger les affectations depuis la base ──
  useEffect(() => {
    setLoaded(null);
    fetch(`/api/planning/affectations?semaine=${viewWeek}`)
      .then(r => r.ok ? r.json() : {})
      .then(data => {
        if (data && typeof data === "object" && Object.keys(data).length > 0) {
          setAff(data as AffMap);
        } else {
          setAff({});
        }
        setLoaded(viewWeek);
      })
      .catch(() => { setAff({}); setLoaded(viewWeek); });
  }, [viewWeek]);

  // ── Sauvegarde auto (debounce 1s) ──
  const saveAff = useCallback((newAff: AffMap) => {
    setAff(newAff);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      await fetch("/api/planning/affectations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semaine: viewWeek, affectations: newAff }),
      }).catch(() => {});
      setSaving(false);
    }, 1000);
  }, [viewWeek]);

  // ── Travail par poste ──
  const postWork = useMemo(() => {
    const work: Record<string, { totalMin: number; cmds: Array<{ client: string; min: number }> }> = {};
    for (const cmd of commandes) {
      const s = (cmd as any).statut;
      if (s === "livre" || s === "terminee" || s === "annulee") continue;
      if (!cmd.type || cmd.type === "intervention_chantier") continue;
      const routage = getRoutage(cmd.type, cmd.quantite, (cmd as any).hsTemps as Record<string, unknown> | null);
      for (const grp of POST_GROUPS) {
        if ((cmd as any)[PHASE_FIELD[grp.phase]] !== viewWeek) continue;
        for (const e of routage.filter(r => r.phase === grp.phase)) {
          if (!work[e.postId]) work[e.postId] = { totalMin: 0, cmds: [] };
          if (!work[e.postId].cmds.some(c => c.client === (cmd as any).client)) {
            work[e.postId].totalMin += e.estimatedMin;
            work[e.postId].cmds.push({ client: (cmd as any).client, min: e.estimatedMin });
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
    const cur = newAff[key] || [];
    if (!cur.includes(dragOp)) {
      newAff[key] = [...cur, dragOp];
      saveAff(newAff);
    }
    setDragOp(null);
    setDropTarget(null);
  }, [dragOp, aff, saveAff]);

  const removeOp = useCallback((key: string, opNom: string) => {
    const newAff = { ...aff };
    newAff[key] = (newAff[key] || []).filter(o => o !== opNom);
    if (newAff[key].length === 0) delete newAff[key];
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

        // Opérateurs compétents
        const competentOps = OPS.filter(op => op.competences.includes(grp.competence));
        if (competentOps.length === 0) continue;

        // Affecter par journée complète (AM+PM ensemble) pour ne pas faire sauter les gens d'un poste à l'autre
        let slotsPlaced = 0;
        for (let j = 0; j < 5 && slotsPlaced < slotsNeeded; j++) {
          const demis = j === 4
            ? ["am", "pm"].filter(d => !(d === "pm" && competentOps.every(op => op.vendrediOff || op.id === "jp")))
            : ["am", "pm"];

          // Trouver les opérateurs les moins chargés ce jour-là
          const opLoads = competentOps
            .filter(op => !(j === 4 && op.vendrediOff))
            .map(op => {
              let load = 0;
              for (const k of Object.keys(newAff)) {
                const parts = k.split("|");
                if (parseInt(parts[1]) === j && (newAff[k] || []).includes(op.nom)) load++;
              }
              return { op, load };
            })
            .sort((a, b) => a.load - b.load);

          // Prendre les N opérateurs les moins chargés (N = minPers)
          const toAssign = opLoads.filter(o => o.load === 0).slice(0, minPers);
          if (toAssign.length < minPers) {
            // Pas assez d'opérateurs libres ce jour, prendre ceux qui ont le moins de charge
            const needed = minPers - toAssign.length;
            const more = opLoads.filter(o => o.load > 0).slice(0, needed);
            toAssign.push(...more);
          }

          if (toAssign.length > 0) {
            for (const d of demis) {
              const key = ck(pid, j, d);
              const names = toAssign
                .filter(o => !(j === 4 && d === "pm" && o.op.id === "jp"))
                .map(o => o.op.nom);
              if (names.length > 0) {
                newAff[key] = names;
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

    for (const [key, ops] of Object.entries(aff)) {
      if (!ops || ops.length === 0) continue;
      const [pid, jourStr, demi] = key.split("|");
      const jourIdx = parseInt(jourStr);
      const grp = POST_GROUPS.find(g => g.ids.includes(pid));
      const pw = postWork[pid];
      const cmdLabels = pw?.cmds.map(c => c.client) || [];

      for (const opNom of ops) {
        if (!opPlannings[opNom]) opPlannings[opNom] = [];
        opPlannings[opNom].push({
          jour: JOURS[jourIdx],
          demi: demi === "am" ? "Matin" : "Après-midi",
          postId: pid,
          postLabel: `${POST_LABELS[pid] || pid} (${grp?.label || ""})`,
          cmds: cmdLabels,
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
    const allOps = OPS.filter(op => opPlannings[op.nom]);

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
            Compétences : ${op.competences.join(", ")}
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
      {/* ── Palette opérateurs + boutons ── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: 1, background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 12px" }}>
          <div style={{ fontSize: 10, color: C.sec, marginBottom: 6, fontWeight: 700 }}>OPÉRATEURS — glisse vers un poste</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {OPS.map(op => (
              <div key={op.id} draggable onDragStart={(e) => { setDragOp(op.nom); e.dataTransfer.effectAllowed = "copy"; }}
                style={{ padding: "4px 10px", borderRadius: 4, cursor: "grab", userSelect: "none", background: OP_COLORS[op.id] || C.s2, color: "#000", fontSize: 11, fontWeight: 700 }}>
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
                let affMin = 0;
                for (let j = 0; j < 5; j++) for (const d of ["am", "pm"]) affMin += (aff[ck(pid, j, d)]?.length || 0) * DEMI_MIN;
                const pct = pw.totalMin > 0 ? Math.min(100, Math.round(affMin / pw.totalMin * 100)) : 0;
                const barCol = pct >= 100 ? C.green : pct >= 50 ? C.orange : C.red;

                return (
                  <tr key={pid} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "5px 8px", background: C.s1, border: `1px solid ${C.border}`, verticalAlign: "top" }}>
                      <div style={{ fontWeight: 700, color: grp.color }}>{pid} <span style={{ fontWeight: 400, color: C.muted, fontSize: 9 }}>{POST_LABELS[pid]}</span></div>
                      {pw.cmds.map((c, i) => (
                        <div key={i} style={{ fontSize: 9, color: C.sec, marginTop: 1 }}>{c.client} <span className="mono" style={{ color: C.muted }}>{hm(c.min)}</span></div>
                      ))}
                    </td>
                    <td style={{ padding: "4px", border: `1px solid ${C.border}`, textAlign: "center", verticalAlign: "top" }}>
                      <div className="mono" style={{ fontWeight: 700, color: grp.color }}>{hm(pw.totalMin)}</div>
                      <div style={{ fontSize: 9, color: grp.color, fontWeight: 700 }}>{persNeeded}p.</div>
                      <div style={{ height: 4, background: C.s2, borderRadius: 2, overflow: "hidden", marginTop: 2 }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: barCol, borderRadius: 2 }} />
                      </div>
                    </td>
                    {JOURS.map((j, jIdx) => ["am", "pm"].map(demi => {
                      const key = ck(pid, jIdx, demi);
                      const assigned = aff[key] || [];
                      const isTarget = dropTarget === key;
                      return (
                        <td key={`${j}_${demi}`}
                          onDragOver={(e) => { e.preventDefault(); setDropTarget(key); }}
                          onDragLeave={() => { if (dropTarget === key) setDropTarget(null); }}
                          onDrop={() => onDrop(key)}
                          style={{
                            padding: "3px 3px",
                            border: `1px solid ${isTarget ? C.orange : jIdx === todayIdx ? C.orange + "44" : C.border}`,
                            background: isTarget ? grp.color + "18" : assigned.length > 0 ? grp.color + "08" : C.bg,
                            verticalAlign: "top",
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
                                    <span onClick={() => removeOp(key, opNom)} style={{ cursor: "pointer", marginLeft: 3, fontSize: 8, opacity: 0.6 }}>✕</span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div style={{ color: C.muted, textAlign: "center", padding: "6px 0", fontSize: 10 }}>
                              {isTarget ? "▼" : ""}
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
