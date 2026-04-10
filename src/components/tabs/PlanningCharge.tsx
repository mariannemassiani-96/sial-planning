"use client";
import { useState, useMemo } from "react";
import { C, TYPES_MENUISERIE, hm, CommandeCC, isWorkday, calcCheminCritique, dateDemarrage } from "@/lib/sial-data";
import { getRoutage, EtapeRoutage } from "@/lib/routage-production";
import { Card, H } from "@/components/ui";

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

function fmtDayShort(s: string): string {
  return new Date(s + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

function fmtWeekRange(mon: Date): string {
  const ven = new Date(mon);
  ven.setDate(mon.getDate() + 4);
  return `Semaine du ${mon.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} au ${ven.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`;
}

const PHASE_COLORS: Record<string, string> = {
  coupe: "#42A5F5", montage: "#FFA726", vitrage: "#26C6DA", logistique: "#CE93D8",
};
const PHASE_LABELS: Record<string, string> = {
  coupe: "Coupe & Prépa", montage: "Montage", vitrage: "Vitrage", logistique: "Logistique",
};
const PHASES = ["coupe", "montage", "vitrage", "logistique"] as const;

// ── Types ────────────────────────────────────────────────────────────────────

interface CmdRoutage {
  cmd: CommandeCC;
  routage: EtapeRoutage[];
  totalMin: number;
  deliveryDate: string;
  startDate: string;
  retard: boolean;
  critique: boolean;
}

interface JourPhase {
  phase: string;
  totalMin: number;
  commandes: Array<{ cmd: CommandeCC; min: number; postIds: string[] }>;
}

// ── Calcul du planning semaine ───────────────────────────────────────────────

function buildWeekPlan(commandes: CommandeCC[], mondayStr: string) {
  // 1. Calculer le routage pour chaque commande active
  const cmdRoutages: CmdRoutage[] = [];

  for (const cmd of commandes) {
    const statut = (cmd as any).statut;
    if (statut === "livre" || statut === "terminee" || statut === "annulee") continue;
    if (!cmd.type || cmd.type === "intervention_chantier") continue;

    const routage = getRoutage(cmd.type, cmd.quantite, (cmd as any).hsTemps as Record<string, unknown> | null);
    if (routage.length === 0) continue;

    const totalMin = routage.reduce((s, e) => s + e.estimatedMin, 0);
    const cc = calcCheminCritique(cmd);
    const dd = dateDemarrage(cmd) || mondayStr;

    cmdRoutages.push({
      cmd,
      routage,
      totalMin,
      deliveryDate: (cmd as any).date_livraison_souhaitee || "",
      startDate: dd,
      retard: cc?.enRetard || false,
      critique: cc?.critique || false,
    });
  }

  // Trier par urgence : critique d'abord, puis par date de livraison
  cmdRoutages.sort((a, b) => {
    if (a.critique !== b.critique) return a.critique ? -1 : 1;
    if (a.retard !== b.retard) return a.retard ? -1 : 1;
    return (a.deliveryDate || "9999").localeCompare(b.deliveryDate || "9999");
  });

  // 2. Construire les 5 jours de la semaine
  const weekDays: string[] = [];
  for (let i = 0; i < 5; i++) {
    weekDays.push(localStr(addDays(mondayStr, i)));
  }

  // 3. Répartir les commandes sur les jours par phase
  // Capacité par jour et par phase (minutes dispo)
  const CAPACITY_PER_PHASE: Record<string, number> = {
    coupe: 480 * 3,     // 3 opérateurs coupe × 8h
    montage: 480 * 3,   // 3 opérateurs montage × 8h
    vitrage: 480 * 2,   // 2 opérateurs vitrage × 8h
    logistique: 480 * 2, // 2 opérateurs logistique × 8h
  };

  // Structure : jour → phase → { totalMin, commandes }
  const plan: Record<string, Record<string, JourPhase>> = {};
  for (const day of weekDays) {
    plan[day] = {};
    for (const ph of PHASES) {
      plan[day][ph] = { phase: ph, totalMin: 0, commandes: [] };
    }
  }

  // 4. Placer chaque commande
  for (const cr of cmdRoutages) {
    // Calculer les minutes par phase pour cette commande
    const minParPhase: Record<string, { min: number; postIds: string[] }> = {};
    for (const e of cr.routage) {
      if (!minParPhase[e.phase]) minParPhase[e.phase] = { min: 0, postIds: [] };
      minParPhase[e.phase].min += e.estimatedMin;
      if (!minParPhase[e.phase].postIds.includes(e.postId)) {
        minParPhase[e.phase].postIds.push(e.postId);
      }
    }

    // Placer chaque phase sur le premier jour disponible (qui a de la capacité)
    // avec respect de la séquence (coupe avant montage avant vitrage)
    let earliestDay = 0; // index dans weekDays

    for (const ph of PHASES) {
      const phData = minParPhase[ph];
      if (!phData || phData.min === 0) continue;

      // Trouver le premier jour à partir de earliestDay qui a de la capacité
      let placed = false;
      for (let d = earliestDay; d < weekDays.length; d++) {
        const day = weekDays[d];
        if (!isWorkday(day)) continue;
        const slot = plan[day][ph];
        if (slot.totalMin + phData.min <= CAPACITY_PER_PHASE[ph] * 1.2) { // 20% de dépassement autorisé
          slot.totalMin += phData.min;
          slot.commandes.push({ cmd: cr.cmd, min: phData.min, postIds: phData.postIds });
          earliestDay = d; // la phase suivante ne peut pas être avant
          placed = true;
          break;
        }
      }
      // Si pas de place cette semaine, on met sur le dernier jour
      if (!placed && weekDays.length > 0) {
        const lastDay = weekDays[weekDays.length - 1];
        const slot = plan[lastDay][ph];
        slot.totalMin += phData.min;
        slot.commandes.push({ cmd: cr.cmd, min: phData.min, postIds: phData.postIds });
      }

      // Buffer : la phase suivante commence au minimum le jour d'après
      earliestDay = Math.min(earliestDay + 1, weekDays.length - 1);
    }
  }

  return { weekDays, plan, cmdRoutages, CAPACITY_PER_PHASE };
}

// ── Composant principal ──────────────────────────────────────────────────────

export default function PlanningCharge({ commandes }: { commandes: CommandeCC[] }) {
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
  const mondayStr = localStr(weekStart);

  const { weekDays, plan, cmdRoutages, CAPACITY_PER_PHASE } = useMemo(
    () => buildWeekPlan(commandes, mondayStr),
    [commandes, mondayStr]
  );

  // Totaux par phase (toute la semaine)
  const weekTotals: Record<string, number> = {};
  const weekCapacities: Record<string, number> = {};
  for (const ph of PHASES) {
    weekTotals[ph] = weekDays.reduce((s, d) => s + (plan[d]?.[ph]?.totalMin || 0), 0);
    weekCapacities[ph] = CAPACITY_PER_PHASE[ph] * weekDays.filter(d => isWorkday(d)).length;
  }
  const grandTotal = Object.values(weekTotals).reduce((s, v) => s + v, 0);

  const prev = () => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); };
  const next = () => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); };
  const today = () => setWeekStart(getMonday(new Date()));

  return (
    <div>
      {/* Header navigation semaine */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={prev} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, padding: "6px 12px", cursor: "pointer", fontSize: 14 }}>←</button>
        <button onClick={today} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.sec, padding: "6px 12px", cursor: "pointer", fontSize: 11 }}>Aujourd&apos;hui</button>
        <button onClick={next} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, padding: "6px 12px", cursor: "pointer", fontSize: 14 }}>→</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{fmtWeekRange(weekStart)}</div>
          <div style={{ fontSize: 11, color: C.sec }}>{cmdRoutages.length} commande{cmdRoutages.length > 1 ? "s" : ""} à planifier · {hm(grandTotal)} de charge totale</div>
        </div>
      </div>

      {/* Résumé charge par phase */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${PHASES.length}, 1fr)`, gap: 8, marginBottom: 16 }}>
        {PHASES.map(ph => {
          const total = weekTotals[ph];
          const capa = weekCapacities[ph];
          const pct = capa > 0 ? Math.round(total / capa * 100) : 0;
          const barColor = pct > 90 ? C.red : pct > 70 ? C.orange : C.green;
          return (
            <div key={ph} style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: PHASE_COLORS[ph] }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: PHASE_COLORS[ph] }}>{PHASE_LABELS[ph]}</span>
                <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: barColor }}>{pct}%</span>
              </div>
              <div style={{ height: 6, background: C.s2, borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
                <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: barColor, borderRadius: 3, transition: "width 0.3s" }} />
              </div>
              <div style={{ fontSize: 10, color: C.sec }}>{hm(total)} / {hm(capa)} dispo</div>
            </div>
          );
        })}
      </div>

      {/* Grille semaine : colonnes = jours, lignes = phases */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ width: 90, padding: "8px 6px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "left", fontSize: 10, color: C.sec }}>PHASE</th>
              {weekDays.map(d => {
                const isToday = d === localStr(new Date());
                return (
                  <th key={d} style={{ padding: "8px 6px", background: isToday ? C.s2 : C.s1, border: `1px solid ${isToday ? C.orange : C.border}`, textAlign: "center", fontSize: 11, color: isToday ? C.orange : C.sec, fontWeight: isToday ? 700 : 400 }}>
                    {fmtDayShort(d)}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {PHASES.map(ph => (
              <tr key={ph}>
                <td style={{ padding: "8px 6px", background: C.s1, border: `1px solid ${C.border}`, verticalAlign: "top" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: PHASE_COLORS[ph], flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: PHASE_COLORS[ph] }}>{PHASE_LABELS[ph]}</span>
                  </div>
                </td>
                {weekDays.map(d => {
                  const slot = plan[d]?.[ph];
                  if (!slot) return <td key={d} style={{ border: `1px solid ${C.border}`, background: C.bg }} />;
                  const pct = CAPACITY_PER_PHASE[ph] > 0 ? Math.round(slot.totalMin / CAPACITY_PER_PHASE[ph] * 100) : 0;
                  const barColor = pct > 90 ? C.red : pct > 70 ? C.orange : pct > 0 ? C.green : "transparent";
                  const isToday = d === localStr(new Date());

                  return (
                    <td key={d} style={{ padding: "4px 5px", border: `1px solid ${isToday ? C.orange + "66" : C.border}`, background: C.bg, verticalAlign: "top", position: "relative" }}>
                      {/* Mini barre de charge */}
                      {slot.totalMin > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                          <div style={{ flex: 1, height: 4, background: C.s2, borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: barColor, borderRadius: 2 }} />
                          </div>
                          <span style={{ fontSize: 9, color: barColor, fontWeight: 700, whiteSpace: "nowrap" }}>{pct}%</span>
                        </div>
                      )}
                      {/* Commandes dans ce slot */}
                      {slot.commandes.map((c, i) => {
                        const cc = calcCheminCritique(c.cmd);
                        const borderLeft = cc?.critique ? C.red : cc?.enRetard ? C.orange : PHASE_COLORS[ph];
                        return (
                          <div key={i} style={{ borderLeft: `3px solid ${borderLeft}`, background: C.s1, borderRadius: 3, padding: "3px 6px", marginBottom: 3, fontSize: 10 }}>
                            <div style={{ fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {(c.cmd as any).client}
                            </div>
                            <div style={{ color: C.sec, display: "flex", gap: 4, flexWrap: "wrap" }}>
                              <span>{c.cmd.quantite}×{((TYPES_MENUISERIE as Record<string, any>)[c.cmd.type]?.label || c.cmd.type)}</span>
                              <span className="mono" style={{ color: C.muted }}>{hm(c.min)}</span>
                            </div>
                            <div style={{ display: "flex", gap: 2, marginTop: 2, flexWrap: "wrap" }}>
                              {c.postIds.map(p => (
                                <span key={p} style={{ fontSize: 8, padding: "0 3px", borderRadius: 2, background: PHASE_COLORS[ph] + "22", color: PHASE_COLORS[ph], fontWeight: 700 }}>{p}</span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                      {slot.commandes.length === 0 && (
                        <div style={{ fontSize: 10, color: C.muted, textAlign: "center", padding: 8 }}>—</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Liste des commandes planifiées */}
      {cmdRoutages.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <H c={C.sec}>Commandes à fabriquer ({cmdRoutages.length})</H>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {cmdRoutages.map(cr => {
              const borderColor = cr.critique ? C.red : cr.retard ? C.orange : C.green;
              return (
                <div key={String(cr.cmd.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: C.s2, borderLeft: `3px solid ${borderColor}`, borderRadius: 4 }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 700, fontSize: 12 }}>{(cr.cmd as any).client}</span>
                    <span style={{ color: C.sec, fontSize: 11, marginLeft: 6 }}>{(cr.cmd as any).ref_chantier}</span>
                  </div>
                  <span style={{ fontSize: 11, color: C.sec }}>{cr.cmd.quantite}×{((TYPES_MENUISERIE as Record<string, any>)[cr.cmd.type]?.label || cr.cmd.type)}</span>
                  <span className="mono" style={{ fontSize: 11, color: C.orange, fontWeight: 700 }}>{hm(cr.totalMin)}</span>
                  {cr.deliveryDate && (
                    <span style={{ fontSize: 10, color: borderColor }}>
                      Livr. {new Date(cr.deliveryDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {cmdRoutages.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: C.sec }}>
          Aucune commande à planifier cette semaine.<br />
          <span style={{ fontSize: 12, color: C.muted }}>Les commandes en attente avec une date de livraison apparaîtront ici automatiquement.</span>
        </div>
      )}
    </div>
  );
}
