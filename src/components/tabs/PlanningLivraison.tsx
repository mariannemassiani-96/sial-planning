"use client";
import { useState, useMemo } from "react";
import { calcCheminCritique, C, CFAM, fmtDate, CommandeCC, TYPES_MENUISERIE, ZONES } from "@/lib/sial-data";
import { H, Bdg } from "@/components/ui";

type ViewMode = "semaine" | "jour" | "mois";

const JOURS_FR  = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
const MOIS_FR   = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

function getMondayOf(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - day + (day === 0 ? -6 : 1));
  date.setHours(0, 0, 0, 0);
  return date;
}

function sameDay(a: string, b: string) { return a === b; }
function sameWeek(dateStr: string, weekDays: string[]) { return weekDays.includes(dateStr); }
function sameMonth(dateStr: string, year: number, month: number) {
  const d = new Date(dateStr);
  return d.getFullYear() === year && d.getMonth() === month;
}

export default function PlanningLivraison({ commandes }: { commandes: CommandeCC[] }) {
  const today = new Date().toISOString().split("T")[0];
  const [view,   setView]   = useState<ViewMode>("semaine");
  const [anchor, setAnchor] = useState(today);
  const [zone,   setZone]   = useState("toutes");

  // Computed chemin critique for all orders
  const enriched = useMemo(() =>
    commandes.map(c => {
      const cc  = calcCheminCritique(c);
      const cmd = c as any;
      // Effective delivery date = au plus tôt if no souhaitée, else souhaitée
      const livSouhaitee = cmd.date_livraison_souhaitee || "";
      return { cmd, c, cc, livSouhaitee };
    }).filter(x => x.livSouhaitee),
    [commandes]
  );

  // Zone filter
  const filtered = zone === "toutes" ? enriched : enriched.filter(x => (x.cmd as any).zone === zone);

  // ── Navigation ──────────────────────────────────────────────────────
  const navigate = (delta: number) => {
    const d = new Date(anchor);
    if (view === "semaine") d.setDate(d.getDate() + delta * 7);
    else if (view === "jour") d.setDate(d.getDate() + delta);
    else { d.setMonth(d.getMonth() + delta); d.setDate(1); }
    setAnchor(d.toISOString().split("T")[0]);
  };

  // ── Week days ───────────────────────────────────────────────────────
  const monday   = getMondayOf(new Date(anchor));
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().split("T")[0];
  });

  // ── Month grid ──────────────────────────────────────────────────────
  const anchorDate = new Date(anchor);
  const year  = anchorDate.getFullYear();
  const month = anchorDate.getMonth();

  const monthGrid = useMemo(() => {
    const days: (string | null)[] = [];
    const first    = new Date(year, month, 1);
    const last     = new Date(year, month + 1, 0);
    const startDow = first.getDay() === 0 ? 6 : first.getDay() - 1;
    for (let i = 0; i < startDow; i++) days.push(null);
    for (let d = 1; d <= last.getDate(); d++)
      days.push(new Date(year, month, d).toISOString().split("T")[0]);
    const weeks: (string | null)[][] = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
    return weeks;
  }, [year, month]);

  // ── Nav label ───────────────────────────────────────────────────────
  const navLabel = view === "semaine"
    ? `Sem. du ${fmtDate(weekDays[0])} au ${fmtDate(weekDays[6])}`
    : view === "jour"
    ? fmtDate(anchor)
    : `${MOIS_FR[month]} ${year}`;

  // ── Stat counts ─────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const inView = filtered.filter(x => {
      const d = x.livSouhaitee || x.livSouhaitee;
      if (view === "semaine") return sameWeek(d, weekDays);
      if (view === "jour")    return sameDay(d, anchor);
      return sameMonth(d, year, month);
    });
    return {
      total:    inView.length,
      critiques: inView.filter(x => x.cc?.critique).length,
      retards:   inView.filter(x => x.cc?.enRetard && !x.cc?.critique).length,
      ok:        inView.filter(x => !x.cc?.enRetard).length,
    };
  }, [filtered, view, weekDays, anchor, year, month]);

  // ── Card for a delivery ─────────────────────────────────────────────
  function DelivCard({ x, showDate = false }: { x: typeof enriched[0]; showDate?: boolean }) {
    const { cmd, c, cc, livSouhaitee } = x;
    const tm = TYPES_MENUISERIE[c.type];
    const retardColor = cc?.critique ? C.red : cc?.enRetard ? C.orange : C.green;
    const jr = livSouhaitee
      ? Math.round((new Date(livSouhaitee).getTime() - Date.now()) / 86400000)
      : null;
    const jc = jr === null ? C.sec : jr < 0 ? C.red : jr < 7 ? C.orange : C.green;

    return (
      <div style={{ marginBottom:6, padding:"8px 10px", background:C.bg, borderRadius:5, border:`1px solid ${C.border}`, borderLeft:`3px solid ${retardColor}` }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap", marginBottom:3 }}>
              <span className="mono" style={{ fontSize:10, color:C.orange, fontWeight:700 }}>{cmd.num_commande||"—"}</span>
              <span style={{ fontSize:13, fontWeight:700, color:C.text }}>{c.client}</span>
              {cmd.ref_chantier && <Bdg t={cmd.ref_chantier} c={C.teal} sz={9}/>}
              {tm && <Bdg t={tm.label} c={tm.famille==="hors_standard"?C.purple:CFAM[tm.famille]||C.blue} sz={9}/>}
              <Bdg t={`×${c.quantite}`} c={C.sec} sz={9}/>
            </div>
            <div style={{ display:"flex", gap:10, fontSize:10, color:C.sec, flexWrap:"wrap" }}>
              {cmd.zone && <span>{cmd.zone}</span>}
              {showDate && livSouhaitee && (
                <span>Livraison : <span className="mono" style={{ color:C.text }}>{fmtDate(livSouhaitee)}</span></span>
              )}
              {cc?.dateLivraisonAuPlusTot && livSouhaitee !== cc.dateLivraisonAuPlusTot && (
                <span>Au + tôt : <span className="mono" style={{ color:retardColor }}>{fmtDate(cc.dateLivraisonAuPlusTot)}</span></span>
              )}
            </div>
          </div>
          <div style={{ textAlign:"right", flexShrink:0 }}>
            {jr !== null && (
              <div className="mono" style={{ fontSize:14, fontWeight:700, color:jc }}>
                J{jr >= 0 ? `-${jr}` : `+${Math.abs(jr)}`}
              </div>
            )}
            {cc?.enRetard
              ? <Bdg t={`+${cc.retardJours}j`} c={retardColor} sz={9}/>
              : cc ? <Bdg t="OK" c={C.green} sz={9}/> : null
            }
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <H c={C.green}>Planning de livraison</H>

      {/* Controls */}
      <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap", alignItems:"center" }}>
        {/* Vue */}
        <div style={{ display:"flex", gap:4 }}>
          {(["semaine","jour","mois"] as ViewMode[]).map(v => (
            <button key={v} onClick={() => setView(v)} style={{ padding:"5px 12px", background:view===v?C.green+"33":C.s1, border:`1px solid ${view===v?C.green:C.border}`, borderRadius:4, color:view===v?C.green:C.sec, fontSize:11, fontWeight:600, cursor:"pointer" }}>
              {v.charAt(0).toUpperCase()+v.slice(1)}
            </button>
          ))}
        </div>
        {/* Zone */}
        <select value={zone} onChange={e => setZone(e.target.value)} style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:4, padding:"5px 10px", color:C.text, fontSize:11, cursor:"pointer" }}>
          <option value="toutes">Toutes les zones</option>
          {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
      </div>

      {/* Nav */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
        <button onClick={() => navigate(-1)} style={{ padding:"4px 12px", background:C.s1, border:`1px solid ${C.border}`, borderRadius:4, color:C.text, cursor:"pointer", fontSize:14 }}>←</button>
        <span style={{ fontSize:13, fontWeight:600, color:C.text, minWidth:280, textAlign:"center" }}>{navLabel}</span>
        <button onClick={() => navigate(1)}  style={{ padding:"4px 12px", background:C.s1, border:`1px solid ${C.border}`, borderRadius:4, color:C.text, cursor:"pointer", fontSize:14 }}>→</button>
        <button onClick={() => setAnchor(today)} style={{ padding:"4px 10px", background:C.green+"22", border:`1px solid ${C.green}44`, borderRadius:4, color:C.green, cursor:"pointer", fontSize:11, fontWeight:600 }}>{"Aujourd'hui"}</button>
      </div>

      {/* Stats de la période */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:16 }}>
        {[
          { l:"Livraisons période", v:stats.total,    c:C.blue },
          { l:"Critiques",          v:stats.critiques, c:C.red },
          { l:"En retard",          v:stats.retards,   c:C.orange },
          { l:"Dans les temps",     v:stats.ok,        c:C.green },
        ].map((s,i) => (
          <div key={i} style={{ textAlign:"center", padding:"10px 8px", background:C.s1, borderRadius:6, border:`1px solid ${s.v>0&&i>0?s.c:C.border}` }}>
            <div className="mono" style={{ fontSize:22, fontWeight:800, color:s.c }}>{s.v}</div>
            <div style={{ fontSize:10, color:C.sec, marginTop:2 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {commandes.length === 0 && (
        <div style={{ textAlign:"center", padding:40, color:C.sec }}>{"Aucune commande — ajouter des commandes d'abord."}</div>
      )}

      {/* ════════════ VUE SEMAINE ════════════ */}
      {view === "semaine" && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:6 }}>
          {weekDays.map(day => {
            const isToday   = day === today;
            const isWeekend = new Date(day).getDay() === 0 || new Date(day).getDay() === 6;
            const dow       = new Date(day).getDay();
            const delivs    = filtered.filter(x => {
              const d = (x.cmd as any).date_livraison_souhaitee || x.livSouhaitee;
              return sameDay(d, day);
            }).sort((a,b) => (a.cc?.critique?0:1) - (b.cc?.critique?0:1));

            return (
              <div key={day} style={{ background: isWeekend ? C.s2 : C.s1, border:`1px solid ${isToday?C.green:C.border}`, borderRadius:6, padding:8, opacity: isWeekend ? 0.6 : 1 }}>
                <div style={{ marginBottom:8, textAlign:"center" }}>
                  <div style={{ fontSize:10, color: isToday?C.green:C.sec, fontWeight: isToday?700:400 }}>
                    {JOURS_FR[dow===0?6:dow-1]}
                  </div>
                  <div className="mono" style={{ fontSize:16, fontWeight:700, color: isToday?C.green:C.text }}>
                    {new Date(day).getDate()}
                  </div>
                  {delivs.length > 0 && (
                    <div className="mono" style={{ fontSize:11, fontWeight:700, color:C.green, marginTop:2 }}>
                      {delivs.length} liv.
                    </div>
                  )}
                </div>
                {isWeekend && <div style={{ fontSize:9, color:C.muted, textAlign:"center" }}>Week-end</div>}
                {!isWeekend && delivs.length === 0 && <div style={{ fontSize:10, color:C.muted, textAlign:"center" }}>—</div>}
                {delivs.map((x, i) => {
                  const retardColor = x.cc?.critique ? C.red : x.cc?.enRetard ? C.orange : C.green;
                  const tm = TYPES_MENUISERIE[x.c.type];
                  return (
                    <div key={i} style={{ marginBottom:4, padding:"5px 6px", background:C.bg, borderRadius:4, borderLeft:`2px solid ${retardColor}` }}>
                      <div style={{ fontSize:11, fontWeight:700, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{x.c.client}</div>
                      <div style={{ fontSize:9, color:C.sec }}>{tm?.label} ×{x.c.quantite}</div>
                      {x.cc?.enRetard && <Bdg t={`+${x.cc.retardJours}j`} c={retardColor} sz={8}/>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* ════════════ VUE JOUR ════════════ */}
      {view === "jour" && (
        <div>
          {(() => {
            const delivs = filtered.filter(x => {
              const d = (x.cmd as any).date_livraison_souhaitee || x.livSouhaitee;
              return sameDay(d, anchor);
            });
            if (delivs.length === 0) {
              return (
                <div style={{ textAlign:"center", padding:32, color:C.sec, background:C.s1, borderRadius:6, border:`1px solid ${C.border}` }}>
                  Aucune livraison prévue ce jour
                </div>
              );
            }
            return (
              <div>
                <div style={{ marginBottom:10, fontSize:12, color:C.sec }}>
                  <span className="mono" style={{ color:C.green, fontWeight:700 }}>{delivs.length}</span> livraison(s) prévue(s) le {fmtDate(anchor)}
                </div>
                {delivs
                  .sort((a,b) => (a.cc?.critique?0:1) - (b.cc?.critique?0:1))
                  .map((x,i) => <DelivCard key={i} x={x} />)
                }
              </div>
            );
          })()}
        </div>
      )}

      {/* ════════════ VUE MOIS ════════════ */}
      {view === "mois" && (
        <div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, marginBottom:4 }}>
            {JOURS_FR.map(d => (
              <div key={d} style={{ textAlign:"center", fontSize:10, color:C.sec, padding:"4px 0", fontWeight:700 }}>{d}</div>
            ))}
          </div>

          {monthGrid.map((week, wi) => (
            <div key={wi} style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, marginBottom:2 }}>
              {week.map((day, di) => {
                if (!day) return <div key={di} style={{ minHeight:80, background:C.s2, borderRadius:4 }} />;
                const isToday   = day === today;
                const isWeekend = di >= 5;
                const delivs    = filtered.filter(x => {
                  const d = (x.cmd as any).date_livraison_souhaitee || x.livSouhaitee;
                  return sameDay(d, day);
                });
                const hasCritique = delivs.some(x => x.cc?.critique);
                const hasRetard   = delivs.some(x => x.cc?.enRetard && !x.cc?.critique);
                const borderCol   = hasCritique ? C.red : hasRetard ? C.orange : delivs.length > 0 ? C.green : isToday ? C.green : C.border;

                return (
                  <div key={di}
                    onClick={() => { setView("jour"); setAnchor(day); }}
                    style={{ minHeight:80, background: isToday?C.green+"22":isWeekend?C.s2:C.s1, borderRadius:4, border:`1px solid ${borderCol}`, padding:5, cursor:"pointer" }}>
                    <div style={{ fontSize:11, fontWeight: isToday?700:400, color: isToday?C.green:isWeekend?C.muted:C.sec, marginBottom:4 }}>
                      {new Date(day).getDate()}
                    </div>
                    {delivs.length > 0 && (
                      <div>
                        <div className="mono" style={{ fontSize:11, fontWeight:700, color: hasCritique?C.red:hasRetard?C.orange:C.green, marginBottom:3 }}>
                          {delivs.length} liv.
                        </div>
                        {delivs.slice(0,3).map((x,i) => {
                          const retardColor = x.cc?.critique?C.red:x.cc?.enRetard?C.orange:C.green;
                          return (
                            <div key={i} style={{ fontSize:8, color:C.sec, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", marginBottom:1, padding:"1px 3px", background:retardColor+"22", borderRadius:2 }}>
                              {x.c.client}
                            </div>
                          );
                        })}
                        {delivs.length > 3 && <div style={{ fontSize:8, color:C.muted }}>+{delivs.length-3}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {/* Vue liste du mois triée par date */}
          <div style={{ marginTop:16 }}>
            <div style={{ fontSize:11, color:C.sec, fontWeight:700, marginBottom:8, letterSpacing:"0.06em" }}>
              LISTE DES LIVRAISONS — {MOIS_FR[month].toUpperCase()} {year}
            </div>
            {(() => {
              const monthDelivs = filtered
                .filter(x => {
                  const d = (x.cmd as any).date_livraison_souhaitee || x.livSouhaitee;
                  return d && sameMonth(d, year, month);
                })
                .sort((a,b) => {
                  const da = (a.cmd as any).date_livraison_souhaitee || a.livSouhaitee;
                  const db = (b.cmd as any).date_livraison_souhaitee || b.livSouhaitee;
                  return new Date(da).getTime() - new Date(db).getTime();
                });
              if (monthDelivs.length === 0) return <div style={{ fontSize:12, color:C.muted }}>Aucune livraison ce mois</div>;
              return monthDelivs.map((x,i) => <DelivCard key={i} x={x} showDate />);
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
