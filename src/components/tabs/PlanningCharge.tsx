"use client";
import { useState, useMemo } from "react";
import { C, TYPES_MENUISERIE, hm, CommandeCC, isWorkday, calcCheminCritique, fmtDate } from "@/lib/sial-data";
import { getRoutage, EtapeRoutage } from "@/lib/routage-production";

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
function addDays(s: string, n: number): Date {
  const d = new Date(s + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d;
}
function fmtDay(s: string): string {
  return new Date(s + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
}
function fmtWeek(mon: Date): string {
  const ven = new Date(mon); ven.setDate(mon.getDate() + 4);
  return `Semaine du ${mon.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} au ${ven.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`;
}

// ── Groupes de postes (identiques aux compétences) ──────────────────────────
const POST_GROUPS = [
  { label: "Coupe & Prépa", color: "#42A5F5", ids: ["C2","C3","C4","C5","C6"] },
  { label: "Montage",       color: "#FFA726", ids: ["M1","M2","M3","F1","F2","F3"] },
  { label: "Vitrage",       color: "#26C6DA", ids: ["V1","V2","V3"] },
  { label: "Logistique",    color: "#CE93D8", ids: ["L4","L6","L7"] },
];
const POST_LABELS: Record<string, string> = {
  C2:"Prépa barres",C3:"Coupe LMT",C4:"Coupe 2 têtes",C5:"Renfort acier",C6:"Soudure PVC",
  M1:"Dorm. couliss.",M2:"Dorm. galand.",M3:"Portes ALU",F1:"Dorm. frappe ALU",F2:"Ouv.+ferrage",F3:"Mise bois+CQ",
  V1:"Vitr. Frappe",V2:"Vitr. Coul/Gal",V3:"Emballage",
  L4:"Prépa acc.",L6:"Palettes",L7:"Chargement",
};
const ALL_POST_IDS = POST_GROUPS.flatMap(g => g.ids);

// Capacité par poste en minutes/jour
const POST_CAPACITY: Record<string, number> = {
  C2:1620,C3:1620,C4:540,C5:540,C6:540,
  M1:1080,M2:1080,M3:1080,F1:1080,F2:1080,F3:1080,
  V1:480,V2:480,V3:480,
  L4:480,L6:480,L7:480,
};

// ── Types ────────────────────────────────────────────────────────────────────

interface CmdRoutage {
  cmd: CommandeCC;
  routage: EtapeRoutage[];
  totalMin: number;
  deliveryDate: string;
  retard: boolean;
  critique: boolean;
}

// ── Composant principal ──────────────────────────────────────────────────────

export default function PlanningCharge({ commandes }: { commandes: CommandeCC[] }) {
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const mondayStr = localStr(weekStart);

  // Toutes les commandes actives avec leur routage
  const allCmdRoutages: CmdRoutage[] = useMemo(() => {
    const result: CmdRoutage[] = [];
    for (const cmd of commandes) {
      const statut = (cmd as any).statut;
      if (statut === "livre" || statut === "terminee" || statut === "annulee") continue;
      if (!cmd.type || cmd.type === "intervention_chantier") continue;
      const routage = getRoutage(cmd.type, cmd.quantite, (cmd as any).hsTemps as Record<string, unknown> | null);
      if (routage.length === 0) continue;
      const totalMin = routage.reduce((s, e) => s + e.estimatedMin, 0);
      const cc = calcCheminCritique(cmd);
      result.push({
        cmd, routage, totalMin,
        deliveryDate: (cmd as any).date_livraison_souhaitee || "",
        retard: cc?.enRetard || false,
        critique: cc?.critique || false,
      });
    }
    result.sort((a, b) => {
      if (a.critique !== b.critique) return a.critique ? -1 : 1;
      if (a.retard !== b.retard) return a.retard ? -1 : 1;
      return (a.deliveryDate || "9999").localeCompare(b.deliveryDate || "9999");
    });
    return result;
  }, [commandes]);

  // Commandes sélectionnées pour cette semaine
  const selectedRoutages = useMemo(
    () => allCmdRoutages.filter(cr => selected.has(String(cr.cmd.id))),
    [allCmdRoutages, selected]
  );

  // Construire les 5 jours
  const weekDays = useMemo(() => {
    const days: string[] = [];
    for (let i = 0; i < 5; i++) days.push(localStr(addDays(mondayStr, i)));
    return days;
  }, [mondayStr]);

  // Construire la grille : poste × jour → { totalMin, commandes }
  const grid = useMemo(() => {
    const g: Record<string, Record<string, { totalMin: number; items: Array<{ cmd: CommandeCC; min: number }> }>> = {};
    for (const pid of ALL_POST_IDS) {
      g[pid] = {};
      for (const d of weekDays) g[pid][d] = { totalMin: 0, items: [] };
    }

    // Pour chaque commande sélectionnée, placer ses étapes sur les jours
    for (const cr of selectedRoutages) {
      // Grouper les étapes par poste
      const parPoste: Record<string, number> = {};
      for (const e of cr.routage) {
        parPoste[e.postId] = (parPoste[e.postId] || 0) + e.estimatedMin;
      }

      // Placer chaque poste sur le premier jour avec de la capacité
      // en respectant l'ordre des phases
      let earliestDayIdx = 0;
      let lastPhase = "";

      // Trier les postes dans l'ordre du routage
      const sortedPosts = cr.routage
        .filter((e, i, arr) => arr.findIndex(x => x.postId === e.postId) === i)
        .map(e => ({ postId: e.postId, phase: e.phase, min: parPoste[e.postId] || 0 }));

      for (const sp of sortedPosts) {
        if (sp.min === 0) continue;
        if (!g[sp.postId]) continue;

        // Si on change de phase, décaler d'un jour
        if (lastPhase && sp.phase !== lastPhase) {
          earliestDayIdx = Math.min(earliestDayIdx + 1, weekDays.length - 1);
        }
        lastPhase = sp.phase;

        // Trouver un jour avec de la capacité
        let placed = false;
        for (let d = earliestDayIdx; d < weekDays.length; d++) {
          const day = weekDays[d];
          if (!isWorkday(day)) continue;
          const slot = g[sp.postId][day];
          const capa = POST_CAPACITY[sp.postId] || 480;
          if (slot.totalMin + sp.min <= capa * 1.2) {
            slot.totalMin += sp.min;
            slot.items.push({ cmd: cr.cmd, min: sp.min });
            earliestDayIdx = d;
            placed = true;
            break;
          }
        }
        if (!placed) {
          const last = weekDays[weekDays.length - 1];
          g[sp.postId][last].totalMin += sp.min;
          g[sp.postId][last].items.push({ cmd: cr.cmd, min: sp.min });
        }
      }
    }
    return g;
  }, [selectedRoutages, weekDays]);

  // Toggle sélection
  const toggle = (id: string) => setSelected(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const selectAll = () => setSelected(new Set(allCmdRoutages.map(cr => String(cr.cmd.id))));
  const selectNone = () => setSelected(new Set());

  // Navigation semaine
  const prev = () => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); };
  const next = () => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); };
  const goToday = () => setWeekStart(getMonday(new Date()));

  const grandTotal = selectedRoutages.reduce((s, cr) => s + cr.totalMin, 0);
  const todayStr = localStr(new Date());

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <button onClick={prev} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, padding: "6px 12px", cursor: "pointer", fontSize: 14 }}>←</button>
        <button onClick={goToday} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.sec, padding: "6px 10px", cursor: "pointer", fontSize: 11 }}>Auj.</button>
        <button onClick={next} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, padding: "6px 12px", cursor: "pointer", fontSize: 14 }}>→</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{fmtWeek(weekStart)}</div>
          <div style={{ fontSize: 11, color: C.sec }}>{selected.size} commande{selected.size > 1 ? "s" : ""} sélectionnée{selected.size > 1 ? "s" : ""} · {hm(grandTotal)} de charge</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>

        {/* ── Panneau gauche : sélection commandes ── */}
        <div style={{ width: 320, flexShrink: 0, background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }}>
          <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Commandes à fabriquer</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={selectAll} style={{ fontSize: 10, padding: "2px 8px", background: C.s2, border: `1px solid ${C.border}`, borderRadius: 3, color: C.sec, cursor: "pointer" }}>Tout</button>
              <button onClick={selectNone} style={{ fontSize: 10, padding: "2px 8px", background: C.s2, border: `1px solid ${C.border}`, borderRadius: 3, color: C.sec, cursor: "pointer" }}>Aucun</button>
            </div>
          </div>
          <div style={{ maxHeight: 500, overflowY: "auto" }}>
            {allCmdRoutages.map(cr => {
              const id = String(cr.cmd.id);
              const isSelected = selected.has(id);
              const borderColor = cr.critique ? C.red : cr.retard ? C.orange : C.green;
              const tm = (TYPES_MENUISERIE as Record<string, any>)[cr.cmd.type];
              return (
                <div key={id} onClick={() => toggle(id)} style={{
                  padding: "7px 12px", borderBottom: `1px solid ${C.border}`, cursor: "pointer",
                  background: isSelected ? C.s2 : "transparent",
                  borderLeft: `3px solid ${isSelected ? borderColor : "transparent"}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 16, height: 16, borderRadius: 3, border: `2px solid ${isSelected ? C.orange : C.muted}`, background: isSelected ? C.orange : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 10, color: "#000", fontWeight: 800 }}>
                      {isSelected ? "✓" : ""}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {(cr.cmd as any).client}
                        <span style={{ fontWeight: 400, color: C.sec, marginLeft: 4 }}>{(cr.cmd as any).ref_chantier}</span>
                      </div>
                      <div style={{ fontSize: 10, color: C.sec, display: "flex", gap: 6 }}>
                        <span>{cr.cmd.quantite}× {tm?.label || cr.cmd.type}</span>
                        <span className="mono" style={{ color: C.muted }}>{hm(cr.totalMin)}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      {cr.deliveryDate && (
                        <div style={{ fontSize: 9, color: borderColor }}>{fmtDate(cr.deliveryDate)}</div>
                      )}
                      {cr.critique && <div style={{ fontSize: 9, color: C.red, fontWeight: 700 }}>CRITIQUE</div>}
                      {cr.retard && !cr.critique && <div style={{ fontSize: 9, color: C.orange, fontWeight: 700 }}>RETARD</div>}
                    </div>
                  </div>
                </div>
              );
            })}
            {allCmdRoutages.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", color: C.muted, fontSize: 12 }}>Aucune commande active</div>
            )}
          </div>
        </div>

        {/* ── Grille planning : postes × jours ── */}
        <div style={{ flex: 1, overflowX: "auto" }}>
          {selected.size === 0 ? (
            <div style={{ textAlign: "center", padding: 60, color: C.sec }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>←</div>
              <div style={{ fontSize: 14 }}>Sélectionne les commandes à fabriquer cette semaine</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Coche les commandes dans la liste à gauche</div>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ width: 120, padding: "6px 8px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "left", fontSize: 10, color: C.sec }}>POSTE</th>
                  {weekDays.map(d => (
                    <th key={d} style={{ padding: "6px 4px", background: d === todayStr ? C.s2 : C.s1, border: `1px solid ${d === todayStr ? C.orange : C.border}`, textAlign: "center", fontSize: 10, color: d === todayStr ? C.orange : C.sec, fontWeight: d === todayStr ? 700 : 400 }}>
                      {fmtDay(d)}
                    </th>
                  ))}
                  <th style={{ width: 60, padding: "6px 4px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 10, color: C.sec }}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {POST_GROUPS.map(grp => {
                  // Filtrer les postes du groupe qui ont au moins une charge
                  const activePosts = grp.ids.filter(pid =>
                    weekDays.some(d => grid[pid]?.[d]?.totalMin > 0)
                  );
                  if (activePosts.length === 0) return null;

                  return [
                    // Header de groupe
                    <tr key={`hdr-${grp.label}`}>
                      <td colSpan={weekDays.length + 2} style={{ padding: "6px 8px", background: grp.color + "15", borderBottom: `1px solid ${grp.color}44`, fontSize: 10, fontWeight: 700, color: grp.color, textTransform: "uppercase", letterSpacing: 1 }}>
                        {grp.label}
                      </td>
                    </tr>,
                    // Lignes de postes
                    ...activePosts.map(pid => {
                      const weekTotal = weekDays.reduce((s, d) => s + (grid[pid]?.[d]?.totalMin || 0), 0);
                      return (
                        <tr key={pid}>
                          <td style={{ padding: "5px 8px", background: C.s1, border: `1px solid ${C.border}`, verticalAlign: "top" }}>
                            <div style={{ fontWeight: 700, color: grp.color, fontSize: 11 }}>{pid}</div>
                            <div style={{ fontSize: 9, color: C.muted }}>{POST_LABELS[pid]}</div>
                          </td>
                          {weekDays.map(d => {
                            const slot = grid[pid]?.[d];
                            if (!slot || slot.totalMin === 0) {
                              return <td key={d} style={{ border: `1px solid ${C.border}`, background: C.bg, textAlign: "center", color: C.muted, fontSize: 10 }}>—</td>;
                            }
                            const capa = POST_CAPACITY[pid] || 480;
                            const pct = Math.round(slot.totalMin / capa * 100);
                            const barCol = pct > 90 ? C.red : pct > 70 ? C.orange : C.green;
                            return (
                              <td key={d} style={{ padding: "3px 4px", border: `1px solid ${d === todayStr ? C.orange + "66" : C.border}`, background: C.bg, verticalAlign: "top" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 3 }}>
                                  <div style={{ flex: 1, height: 3, background: C.s2, borderRadius: 2, overflow: "hidden" }}>
                                    <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: barCol, borderRadius: 2 }} />
                                  </div>
                                  <span style={{ fontSize: 8, color: barCol, fontWeight: 700 }}>{pct}%</span>
                                </div>
                                {slot.items.map((it, i) => (
                                  <div key={i} style={{ fontSize: 9, padding: "1px 4px", background: C.s1, borderRadius: 2, marginBottom: 1, display: "flex", justifyContent: "space-between" }}>
                                    <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(it.cmd as any).client}</span>
                                    <span className="mono" style={{ color: C.muted, flexShrink: 0, marginLeft: 4 }}>{hm(it.min)}</span>
                                  </div>
                                ))}
                              </td>
                            );
                          })}
                          <td style={{ padding: "5px 4px", background: C.s1, border: `1px solid ${C.border}`, textAlign: "center" }}>
                            <span className="mono" style={{ fontWeight: 700, color: grp.color, fontSize: 11 }}>{hm(weekTotal)}</span>
                          </td>
                        </tr>
                      );
                    }),
                  ];
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
