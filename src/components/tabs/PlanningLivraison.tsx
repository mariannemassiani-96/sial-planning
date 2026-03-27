"use client";
import { useState, useMemo, useRef } from "react";
import { calcCheminCritique, C, CFAM, fmtDate, CommandeCC, TYPES_MENUISERIE, ZONES, JOURS_FERIES, isWorkday } from "@/lib/sial-data";
import { H, Bdg } from "@/components/ui";
import { openPrintWindow, fmtDatePrint } from "@/lib/print-utils";

const ZONE_COLOR: Record<string, string> = {
  "Porto-Vecchio":    "#FFA726",
  "Ajaccio":          "#42A5F5",
  "Balagne":          "#FFCA28",
  "SIAL":             "#EF5350",
  "Continent":        "#66BB6A",
  "Plaine Orientale": "#CE93D8",
  "Sur chantier":     "#4DB6AC",
  "Autre":            "#6B8BAD",
};

const TRANSPORTEURS = [
  { id: "SIAL",        label: "SIAL",        c: "#42A5F5" },
  { id: "SETEC",       label: "SETEC",       c: "#FFA726" },
  { id: "Paccagnini",  label: "Paccagnini",  c: "#66BB6A" },
];

type ViewMode = "semaine" | "jour" | "mois";

const JOURS_FR  = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
const MOIS_FR   = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

function localStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
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

export default function PlanningLivraison({ commandes, onPatch }: {
  commandes: CommandeCC[];
  onPatch: (id: string, updates: Record<string, any>) => void;
}) {
  const today = localStr(new Date());
  const [view,        setView]        = useState<ViewMode>("semaine");
  const [anchor,      setAnchor]      = useState(today);
  const [zone,        setZone]        = useState("toutes");
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; fromDay: string } | null>(null);

  // Enriched commandes
  const enriched = useMemo(() =>
    commandes.map(c => {
      const cc  = calcCheminCritique(c);
      const cmd = c as any;
      const livSouhaitee = cmd.date_livraison_souhaitee || "";
      return { cmd, c, cc, livSouhaitee };
    }).filter(x => x.livSouhaitee),
    [commandes]
  );

  const filtered = zone === "toutes" ? enriched : enriched.filter(x => (x.cmd as any).zone === zone);

  // ── Navigation ──────────────────────────────────────────────────────
  const navigate = (delta: number) => {
    const d = new Date(anchor + "T00:00:00");
    if (view === "semaine") d.setDate(d.getDate() + delta * 7);
    else if (view === "jour") d.setDate(d.getDate() + delta);
    else { d.setMonth(d.getMonth() + delta); d.setDate(1); }
    setAnchor(localStr(d));
  };

  // ── Week days ───────────────────────────────────────────────────────
  const monday   = getMondayOf(new Date(anchor + "T00:00:00"));
  const weekDays = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return localStr(d);
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
      days.push(localStr(new Date(year, month, d)));
    const weeks: (string | null)[][] = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
    return weeks;
  }, [year, month]);

  // ── Nav label ───────────────────────────────────────────────────────
  const navLabel = view === "semaine"
    ? `Sem. du ${fmtDate(weekDays[0])} au ${fmtDate(weekDays[4])}`
    : view === "jour"
    ? fmtDate(anchor)
    : `${MOIS_FR[month]} ${year}`;

  // ── Stats ───────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const inView = filtered.filter(x => {
      const d = x.livSouhaitee;
      if (view === "semaine") return sameWeek(d, weekDays);
      if (view === "jour")    return sameDay(d, anchor);
      return sameMonth(d, year, month);
    });
    return {
      total:     inView.length,
      critiques: inView.filter(x => x.cc?.critique).length,
      retards:   inView.filter(x => x.cc?.enRetard && !x.cc?.critique).length,
      ok:        inView.filter(x => !x.cc?.enRetard).length,
    };
  }, [filtered, view, weekDays, anchor, year, month]);

  // ── Drag & Drop ─────────────────────────────────────────────────────
  const handleDragStart = (id: string, fromDay: string) => (e: React.DragEvent) => {
    dragRef.current = { id, fromDay };
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (day: string) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDay(day);
  };

  const handleDrop = (day: string) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverDay(null);
    const drag = dragRef.current;
    if (!drag || drag.fromDay === day) { dragRef.current = null; return; }
    onPatch(drag.id, { date_livraison_souhaitee: day });
    dragRef.current = null;
  };

  const handleDragEnd = () => { dragRef.current = null; setDragOverDay(null); };

  // ── Transporteur selector ────────────────────────────────────────────
  function TransporteurPicker({ x }: { x: typeof enriched[0] }) {
    const current = x.cmd.transporteur as string | null;
    return (
      <div style={{ display:"flex", gap:3, marginTop:5, flexWrap:"wrap" }}>
        <span style={{ fontSize:9, color:C.sec, alignSelf:"center", marginRight:2, fontWeight:700 }}>TRANS. :</span>
        {TRANSPORTEURS.map(t => {
          const active = current === t.id;
          return (
            <button key={t.id}
              onClick={() => onPatch(String(x.c.id), { transporteur: active ? null : t.id })}
              style={{
                padding:"1px 7px", fontSize:9, fontWeight:700,
                background: active ? t.c+"33" : C.s2,
                border: `1px solid ${active ? t.c : C.border}`,
                borderRadius:3, color: active ? t.c : C.muted,
                cursor:"pointer",
              }}>
              {t.label}
            </button>
          );
        })}
        {current && (
          <span style={{ fontSize:9, color:C.sec, alignSelf:"center" }}>
            → <span style={{ color: TRANSPORTEURS.find(t=>t.id===current)?.c, fontWeight:700 }}>{current}</span>
          </span>
        )}
      </div>
    );
  }

  // ── DelivCard (vue jour + liste mois) ────────────────────────────────
  function DelivCard({ x, showDate = false, draggable: isDraggable = false }: {
    x: typeof enriched[0]; showDate?: boolean; draggable?: boolean;
  }) {
    const { cmd, c, cc, livSouhaitee } = x;
    const tm = TYPES_MENUISERIE[c.type];
    const retardColor = cc?.critique ? C.red : cc?.enRetard ? C.orange : C.green;
    const jr = livSouhaitee
      ? Math.round((new Date(livSouhaitee).getTime() - Date.now()) / 86400000)
      : null;
    const jc = jr === null ? C.sec : jr < 0 ? C.red : jr < 7 ? C.orange : C.green;
    const zoneColor = ZONE_COLOR[cmd.zone] || C.sec;
    const transp = TRANSPORTEURS.find(t => t.id === cmd.transporteur);

    return (
      <div
        draggable={isDraggable}
        onDragStart={isDraggable ? handleDragStart(String(c.id), livSouhaitee) : undefined}
        onDragEnd={isDraggable ? handleDragEnd : undefined}
        style={{
          marginBottom:6, padding:"8px 10px", background:C.bg, borderRadius:5,
          border:`1px solid ${zoneColor}44`, borderLeft:`4px solid ${zoneColor}`,
          cursor: isDraggable ? "grab" : "default",
        }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap", marginBottom:3 }}>
              <span className="mono" style={{ fontSize:10, color:C.orange, fontWeight:700 }}>{cmd.num_commande||"—"}</span>
              <span style={{ fontSize:13, fontWeight:700, color:C.text }}>{c.client}</span>
              {cmd.ref_chantier && <Bdg t={cmd.ref_chantier} c={C.teal} sz={9}/>}
              {tm && <Bdg t={tm.label} c={tm.famille==="hors_standard"?C.purple:CFAM[tm.famille]||C.blue} sz={9}/>}
              <Bdg t={`×${c.quantite}`} c={C.sec} sz={9}/>
              {transp && <span style={{ fontSize:9, padding:"1px 6px", background:transp.c+"22", border:`1px solid ${transp.c}44`, borderRadius:3, color:transp.c, fontWeight:700 }}>{transp.label}</span>}
            </div>
            <div style={{ display:"flex", gap:10, fontSize:10, color:C.sec, flexWrap:"wrap" }}>
              {cmd.zone && <span style={{ color: zoneColor, fontWeight: 600 }}>{cmd.zone}</span>}
              {showDate && livSouhaitee && (
                <span>Livraison : <span className="mono" style={{ color:C.text }}>{fmtDate(livSouhaitee)}</span></span>
              )}
              {cc?.dateLivraisonAuPlusTot && livSouhaitee !== cc.dateLivraisonAuPlusTot && (
                <span>Au + tôt : <span className="mono" style={{ color:retardColor }}>{fmtDate(cc.dateLivraisonAuPlusTot)}</span></span>
              )}
            </div>
            <TransporteurPicker x={x} />
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

  // ── Print ───────────────────────────────────────────────────────────
  const handlePrint = () => {
    const periodDelivs = filtered.filter(x => {
      const d = x.livSouhaitee;
      if (view === "semaine") return sameWeek(d, weekDays);
      if (view === "jour")    return sameDay(d, anchor);
      return d && sameMonth(d, year, month);
    }).sort((a,b) => new Date(a.livSouhaitee).getTime() - new Date(b.livSouhaitee).getTime());

    const header = `
      <div class="header">
        <div class="header-left">
          <h1>SIAL <span>+</span> ISULA &nbsp;|&nbsp; Planning de livraison</h1>
          <div class="subtitle">${navLabel}${zone!=="toutes"?" — Zone : "+zone:""}</div>
        </div>
        <div class="header-right">
          <div>${periodDelivs.length} livraison(s)</div>
          <div>${stats.critiques} critique(s) · ${stats.retards} en retard</div>
        </div>
      </div>`;

    const rows = periodDelivs.map(x => {
      const { cmd, c, cc, livSouhaitee } = x;
      const tm = TYPES_MENUISERIE[c.type];
      const zc = ZONE_COLOR[cmd.zone] || "#888";
      const jr = livSouhaitee ? Math.round((new Date(livSouhaitee).getTime()-Date.now())/86400000) : null;
      const retardCol = cc?.critique ? "crit" : cc?.enRetard ? "warn" : "ok";
      const transp = cmd.transporteur || "—";
      const transCss = TRANSPORTEURS.find(t=>t.id===transp);
      return `<tr>
        <td class="mono" style="white-space:nowrap">${cmd.num_commande||"—"}</td>
        <td><b>${c.client}</b>${cmd.ref_chantier?`<br/><span style="font-size:9px;color:#666">${cmd.ref_chantier}</span>`:""}</td>
        <td><span class="badge" style="border-color:${zc};color:${zc}">${cmd.zone||"—"}</span></td>
        <td>${tm?.label||c.type} ×${c.quantite}</td>
        <td class="mono center">${fmtDatePrint(livSouhaitee)}</td>
        <td class="center">${jr!==null?`J${jr>=0?`-${jr}`:`+${Math.abs(jr)}`}`:"—"}</td>
        <td class="center"><span class="${retardCol}">${cc?.enRetard?`+${cc.retardJours}j`:"OK"}</span></td>
        <td class="center"><span style="font-weight:700;color:${transCss?.c||"#888"}">${transp}</span></td>
      </tr>`;
    }).join("");

    const table = rows ? `<table>
      <thead><tr><th>N° Cmd</th><th>Client</th><th>Zone</th><th>Type</th><th>Livraison</th><th>J-</th><th>État</th><th>Transporteur</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>` : `<p style="color:#666;margin-top:12px">Aucune livraison sur cette période.</p>`;

    openPrintWindow(`Planning Livraison — ${navLabel}`, header+table);
  };

  return (
    <div>
      <H c={C.green}>Planning de livraison</H>

      {/* Légende zones */}
      <div style={{ display:"flex", gap:8, marginBottom:10, flexWrap:"wrap", alignItems:"center" }}>
        {Object.entries(ZONE_COLOR).map(([z, col]) => (
          <span key={z} style={{ fontSize:10, padding:"2px 8px", borderRadius:3, background:col+"22", border:`1px solid ${col}55`, color:col, fontWeight:600 }}>{z}</span>
        ))}
        <span style={{ fontSize:10, color:C.sec, marginLeft:8 }}>· Transporteurs :</span>
        {TRANSPORTEURS.map(t => (
          <span key={t.id} style={{ fontSize:10, padding:"2px 8px", borderRadius:3, background:t.c+"22", border:`1px solid ${t.c}55`, color:t.c, fontWeight:600 }}>{t.label}</span>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display:"flex", gap:8, marginBottom:10, flexWrap:"wrap", alignItems:"center" }}>
        <div style={{ display:"flex", gap:4 }}>
          {(["semaine","jour","mois"] as ViewMode[]).map(v => (
            <button key={v} onClick={() => setView(v)} style={{ padding:"5px 12px", background:view===v?C.green+"33":C.s1, border:`1px solid ${view===v?C.green:C.border}`, borderRadius:4, color:view===v?C.green:C.sec, fontSize:11, fontWeight:600, cursor:"pointer" }}>
              {v.charAt(0).toUpperCase()+v.slice(1)}
            </button>
          ))}
        </div>
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
        {view === "semaine" && <span style={{ fontSize:10, color:C.sec, marginLeft:4 }}>Glisser une livraison pour la déplacer</span>}
        <button onClick={handlePrint} style={{ marginLeft:"auto", padding:"4px 14px", background:"#000", color:"#fff", border:"none", borderRadius:4, cursor:"pointer", fontSize:11, fontWeight:700 }}>🖨️ Imprimer</button>
      </div>

      {/* Stats */}
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
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:6 }}>
          {weekDays.map(day => {
            const isToday   = day === today;
            const dow       = new Date(day).getDay();
            const isDragTarget = dragOverDay === day;
            const delivs = filtered.filter(x => sameDay(x.livSouhaitee, day))
              .sort((a,b) => (a.cc?.critique?0:1) - (b.cc?.critique?0:1));

            return (
              <div key={day}
                onDragOver={handleDragOver(day)}
                onDragLeave={() => setDragOverDay(null)}
                onDrop={handleDrop(day)}
                style={{
                  background: isDragTarget ? C.green+"22" : C.s1,
                  border:`1px solid ${isDragTarget ? C.green : isToday ? C.green : C.border}`,
                  outline: isDragTarget ? `2px solid ${C.green}44` : "none",
                  borderRadius:6, padding:8,
                  transition:"background 0.1s, border-color 0.1s",
                  minHeight:60,
                }}>
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

                {isDragTarget && delivs.length === 0 && (
                  <div style={{ fontSize:9, color:C.green, textAlign:"center", padding:"8px 0", border:`1px dashed ${C.green}`, borderRadius:3 }}>
                    ↓ Déposer ici
                  </div>
                )}

                {delivs.length === 0 && !isDragTarget && (
                  <div style={{ fontSize:10, color:C.muted, textAlign:"center" }}>—</div>
                )}

                {delivs.map((x, i) => {
                  const retardColor = x.cc?.critique ? C.red : x.cc?.enRetard ? C.orange : C.green;
                  const tm = TYPES_MENUISERIE[x.c.type];
                  const transp = TRANSPORTEURS.find(t => t.id === x.cmd.transporteur);
                  return (
                    <div key={i}
                      draggable
                      onDragStart={handleDragStart(String(x.c.id), x.livSouhaitee)}
                      onDragEnd={handleDragEnd}
                      style={{ marginBottom:4, padding:"5px 6px", background:C.bg, borderRadius:4, borderLeft:`2px solid ${retardColor}`, cursor:"grab", userSelect:"none" }}>
                      <div style={{ fontSize:11, fontWeight:700, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                        {x.c.client}{x.cmd.ref_chantier ? ` — ${x.cmd.ref_chantier}` : ""}
                      </div>
                      <div style={{ fontSize:9, color:C.sec }}>{tm?.label} ×{x.c.quantite}</div>
                      <div style={{ display:"flex", gap:4, marginTop:2, flexWrap:"wrap" }}>
                        {x.cc?.enRetard && <Bdg t={`+${x.cc.retardJours}j`} c={retardColor} sz={8}/>}
                        {transp && <span style={{ fontSize:8, padding:"0px 4px", background:transp.c+"22", border:`1px solid ${transp.c}44`, borderRadius:2, color:transp.c, fontWeight:700 }}>{transp.label}</span>}
                      </div>
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
            const delivs = filtered.filter(x => sameDay(x.livSouhaitee, anchor));
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
                  .map((x,i) => <DelivCard key={i} x={x} draggable />)
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
                const isToday      = day === today;
                const isNonWorking = !isWorkday(day);
                const isFerie      = !!JOURS_FERIES[day];
                const isDragTarget = dragOverDay === day;
                const delivs = filtered.filter(x => sameDay(x.livSouhaitee, day));
                const hasCritique = delivs.some(x => x.cc?.critique);
                const hasRetard   = delivs.some(x => x.cc?.enRetard && !x.cc?.critique);
                const borderCol   = isDragTarget ? C.green : hasCritique ? C.red : hasRetard ? C.orange : delivs.length > 0 ? C.green : isFerie ? C.purple : isToday ? C.green : C.border;

                return (
                  <div key={di}
                    onClick={() => { setView("jour"); setAnchor(day); }}
                    onDragOver={e => { e.preventDefault(); setDragOverDay(day); }}
                    onDragLeave={() => setDragOverDay(null)}
                    onDrop={handleDrop(day)}
                    style={{ minHeight:80, background: isDragTarget?C.green+"22":isToday?C.green+"22":isFerie?C.purple+"22":isNonWorking?C.s2:C.s1, borderRadius:4, border:`1px solid ${borderCol}`, padding:5, cursor:"pointer" }}>
                    <div style={{ fontSize:11, fontWeight: isToday||isFerie?700:400, color: isToday?C.green:isFerie?C.purple:isNonWorking?C.muted:C.sec, marginBottom:2 }}>
                      {new Date(day).getDate()}
                      {isFerie && <div style={{ fontSize:7, color:C.purple }}>{JOURS_FERIES[day]}</div>}
                    </div>
                    {isDragTarget && delivs.length === 0 && (
                      <div style={{ fontSize:8, color:C.green, textAlign:"center", border:`1px dashed ${C.green}`, borderRadius:2, padding:"2px 0" }}>↓</div>
                    )}
                    {delivs.length > 0 && (
                      <div>
                        <div className="mono" style={{ fontSize:11, fontWeight:700, color: hasCritique?C.red:hasRetard?C.orange:C.green, marginBottom:3 }}>
                          {delivs.length} liv.
                        </div>
                        {delivs.slice(0,3).map((x,i) => {
                          const retardColor = x.cc?.critique?C.red:x.cc?.enRetard?C.orange:C.green;
                          const transp = TRANSPORTEURS.find(t => t.id === x.cmd.transporteur);
                          return (
                            <div key={i}
                              draggable
                              onDragStart={e => { e.stopPropagation(); handleDragStart(String(x.c.id), x.livSouhaitee)(e); }}
                              onDragEnd={handleDragEnd}
                              style={{ fontSize:8, color:C.sec, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", marginBottom:1, padding:"1px 3px", background:retardColor+"22", borderRadius:2, cursor:"grab" }}>
                              {x.c.client}{x.cmd.ref_chantier ? ` — ${x.cmd.ref_chantier}` : ""}
                              {transp && <span style={{ color:transp.c, marginLeft:2 }}>({transp.label})</span>}
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

          {/* Liste du mois */}
          <div style={{ marginTop:16 }}>
            <div style={{ fontSize:11, color:C.sec, fontWeight:700, marginBottom:8, letterSpacing:"0.06em" }}>
              LISTE DES LIVRAISONS — {MOIS_FR[month].toUpperCase()} {year}
            </div>
            {(() => {
              const monthDelivs = filtered
                .filter(x => sameMonth(x.livSouhaitee, year, month))
                .sort((a,b) => new Date(a.livSouhaitee).getTime() - new Date(b.livSouhaitee).getTime());
              if (monthDelivs.length === 0) return <div style={{ fontSize:12, color:C.muted }}>Aucune livraison ce mois</div>;
              return monthDelivs.map((x,i) => <DelivCard key={i} x={x} showDate draggable />);
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
