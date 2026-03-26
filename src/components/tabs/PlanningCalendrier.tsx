"use client";
import { useState, useMemo } from "react";
import { calcCheminCritique, C, fmtDate, CommandeCC, TYPES_MENUISERIE } from "@/lib/sial-data";
import { H, Bdg } from "@/components/ui";

type ViewMode = "semaine" | "jour" | "mois";
type PosteFilter = "tous" | "coupe" | "montage" | "vitrage" | "palette";

const ETAPE_C: Record<string, string> = {
  coupe:   "#42A5F5",
  montage: "#FFA726",
  vitrage: "#26C6DA",
  palette: "#66BB6A",
  options: "#FFCA28",
};

const POSTES = [
  { id: "tous",    label: "Tous",              c: C.blue },
  { id: "coupe",   label: "Coupe / Soudure",   c: "#42A5F5" },
  { id: "montage", label: "Montage",            c: "#FFA726" },
  { id: "vitrage", label: "Vitrage",            c: "#26C6DA" },
  { id: "palette", label: "Contrôle",           c: "#66BB6A" },
] as const;

const JOURS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MOIS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

function getMondayOf(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isBetween(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

export default function PlanningCalendrier({ commandes }: { commandes: CommandeCC[] }) {
  const today = new Date().toISOString().split("T")[0];
  const [view, setView]   = useState<ViewMode>("semaine");
  const [poste, setPoste] = useState<PosteFilter>("tous");
  const [anchor, setAnchor] = useState(today);

  const chemins = useMemo(() =>
    commandes.map(c => ({ cmd: c, cc: calcCheminCritique(c) })).filter(x => x.cc),
    [commandes]
  );

  // ── Navigation helpers ──────────────────────────────────────────────
  const navigate = (delta: number) => {
    const d = new Date(anchor);
    if (view === "semaine") d.setDate(d.getDate() + delta * 7);
    else if (view === "jour") d.setDate(d.getDate() + delta);
    else { d.setMonth(d.getMonth() + delta); d.setDate(1); }
    setAnchor(d.toISOString().split("T")[0]);
  };
  const goToday = () => setAnchor(today);

  // ── Week days (Mon–Fri) ─────────────────────────────────────────────
  const monday = getMondayOf(new Date(anchor));
  const weekDays = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().split("T")[0];
  });

  // ── Month grid ─────────────────────────────────────────────────────
  const anchorDate = new Date(anchor);
  const year  = anchorDate.getFullYear();
  const month = anchorDate.getMonth();

  const monthGrid = useMemo(() => {
    const days: (string | null)[] = [];
    const first = new Date(year, month, 1);
    const last  = new Date(year, month + 1, 0);
    const startDow = first.getDay() === 0 ? 6 : first.getDay() - 1;
    for (let i = 0; i < startDow; i++) days.push(null);
    for (let d = 1; d <= last.getDate(); d++) {
      days.push(new Date(year, month, d).toISOString().split("T")[0]);
    }
    const weeks: (string | null)[][] = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
    return weeks;
  }, [year, month]);

  // ── Etapes for a given day ──────────────────────────────────────────
  function getEtapesForDay(day: string, cc: ReturnType<typeof calcCheminCritique>) {
    if (!cc) return [];
    return cc.etapes.filter(e => {
      if (poste !== "tous" && e.id !== poste) return false;
      return isBetween(day, e.debut, e.fin);
    });
  }

  // ── Shared nav bar ─────────────────────────────────────────────────
  const navLabel = view === "semaine"
    ? `Semaine du ${fmtDate(weekDays[0])} au ${fmtDate(weekDays[4])}`
    : view === "jour"
    ? fmtDate(anchor)
    : `${MOIS_FR[month]} ${year}`;

  return (
    <div>
      <H c={C.blue}>Planning des ateliers</H>

      {/* Controls */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {/* View */}
        <div style={{ display: "flex", gap: 4 }}>
          {(["semaine","jour","mois"] as ViewMode[]).map(v => (
            <button key={v} onClick={() => setView(v)} style={{ padding:"5px 12px", background: view===v ? C.blue+"33" : C.s1, border:`1px solid ${view===v ? C.blue : C.border}`, borderRadius:4, color: view===v ? C.blue : C.sec, fontSize:11, fontWeight:600, cursor:"pointer" }}>
              {v.charAt(0).toUpperCase()+v.slice(1)}
            </button>
          ))}
        </div>
        {/* Poste */}
        <div style={{ display:"flex", gap:4, marginLeft:6, flexWrap:"wrap" }}>
          {POSTES.map(p => (
            <button key={p.id} onClick={() => setPoste(p.id)} style={{ padding:"5px 12px", background: poste===p.id ? p.c+"33" : C.s1, border:`1px solid ${poste===p.id ? p.c : C.border}`, borderRadius:4, color: poste===p.id ? p.c : C.sec, fontSize:11, fontWeight:600, cursor:"pointer" }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Nav */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
        <button onClick={() => navigate(-1)} style={{ padding:"4px 12px", background:C.s1, border:`1px solid ${C.border}`, borderRadius:4, color:C.text, cursor:"pointer", fontSize:14 }}>←</button>
        <span style={{ fontSize:13, fontWeight:600, color:C.text, minWidth:260, textAlign:"center" }}>{navLabel}</span>
        <button onClick={() => navigate(1)}  style={{ padding:"4px 12px", background:C.s1, border:`1px solid ${C.border}`, borderRadius:4, color:C.text, cursor:"pointer", fontSize:14 }}>→</button>
        <button onClick={goToday} style={{ padding:"4px 10px", background:C.orange+"22", border:`1px solid ${C.orange}44`, borderRadius:4, color:C.orange, cursor:"pointer", fontSize:11, fontWeight:600 }}>{"Aujourd'hui"}</button>
      </div>

      {commandes.length === 0 && (
        <div style={{ textAlign:"center", padding:40, color:C.sec }}>{"Aucune commande — ajouter des commandes d'abord."}</div>
      )}

      {/* ════════════ VUE SEMAINE — Gantt ════════════ */}
      {view === "semaine" && (
        <div style={{ overflowX:"auto" }}>
          {/* Header */}
          <div style={{ display:"grid", gridTemplateColumns:"170px repeat(5,1fr)", minWidth:600 }}>
            <div style={{ padding:"7px 10px", background:C.s2, fontSize:10, color:C.sec, fontWeight:700, borderRadius:"6px 0 0 0" }}>COMMANDE</div>
            {weekDays.map(day => {
              const isToday = day === today;
              const dow = new Date(day).getDay();
              return (
                <div key={day} style={{ padding:"6px 4px", background: isToday ? C.orange+"33" : C.s2, textAlign:"center", borderLeft:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:10, color: isToday ? C.orange : C.sec, fontWeight: isToday ? 700 : 400 }}>{JOURS_FR[dow === 0 ? 6 : dow - 1]}</div>
                  <div className="mono" style={{ fontSize:13, fontWeight:700, color: isToday ? C.orange : C.text }}>{new Date(day).getDate()}</div>
                </div>
              );
            })}
          </div>

          {/* Rows */}
          {chemins.map(({ cmd, cc }) => {
            if (!cc) return null;
            const hasActivity = weekDays.some(day => getEtapesForDay(day, cc).length > 0);
            if (!hasActivity) return null;
            const tm = TYPES_MENUISERIE[cmd.type];
            const retardColor = cc.critique ? C.red : cc.enRetard ? C.orange : C.green;
            return (
              <div key={String(cmd.id)} style={{ display:"grid", gridTemplateColumns:"170px repeat(5,1fr)", borderTop:`1px solid ${C.border}`, minWidth:600 }}>
                <div style={{ padding:"8px 10px", background:C.s1, borderLeft:`3px solid ${retardColor}` }}>
                  <div style={{ fontSize:12, fontWeight:700, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{cmd.client}</div>
                  <div style={{ fontSize:9, color:C.sec }} className="mono">{tm?.label} ×{cmd.quantite}</div>
                  {cc.enRetard && <Bdg t={`+${cc.retardJours}j`} c={retardColor} sz={8} />}
                </div>
                {weekDays.map(day => {
                  const etapes = getEtapesForDay(day, cc);
                  const isToday = day === today;
                  return (
                    <div key={day} style={{ padding:3, background: isToday ? C.orange+"11" : C.s1, borderLeft:`1px solid ${C.border}`, minHeight:50, display:"flex", flexDirection:"column", gap:2 }}>
                      {etapes.map((e, i) => (
                        <div key={i} title={`${e.label} — ${e.qui}`} style={{ background: e.couleur+"33", border:`1px solid ${e.couleur}55`, borderRadius:3, padding:"2px 4px", fontSize:9, color:e.couleur, fontWeight:600, lineHeight:1.3, cursor:"default" }}>
                          {e.label.split(" / ")[0].split(" ")[0]}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {chemins.length > 0 && !chemins.some(({ cc }) => cc && weekDays.some(day => getEtapesForDay(day, cc).length > 0)) && (
            <div style={{ padding:24, textAlign:"center", color:C.sec, fontSize:12, background:C.s1, border:`1px solid ${C.border}`, borderRadius:"0 0 6px 6px" }}>
              Aucune activité cette semaine pour le filtre sélectionné
            </div>
          )}

          {/* Légende */}
          <div style={{ marginTop:10, display:"flex", gap:12, flexWrap:"wrap" }}>
            {Object.entries(ETAPE_C).filter(([k]) => k !== "options").map(([id, c]) => (
              <div key={id} style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:C.sec }}>
                <div style={{ width:10, height:10, borderRadius:2, background:c+"44", border:`1px solid ${c}66` }}/>
                {id === "coupe" ? "Coupe / Soudure" : id === "montage" ? "Montage" : id === "vitrage" ? "Vitrage" : "Contrôle + Palette"}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ════════════ VUE JOUR — par poste ════════════ */}
      {view === "jour" && (
        <div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
            {[
              { id:"coupe",   label:"Coupe / Soudure",   who:"Julien · Laurent · Mateo", c:"#42A5F5" },
              { id:"montage", label:"Montage",            who:"Alain / Michel · JF",      c:"#FFA726" },
              { id:"vitrage", label:"Vitrage",            who:"Quentin",                  c:"#26C6DA" },
              { id:"palette", label:"Contrôle + Palette", who:"Guillaume · Michel",       c:"#66BB6A" },
            ].filter(p => poste === "tous" || poste === p.id).map(p => {
              const activeOrders = chemins.filter(({ cc }) =>
                cc && cc.etapes.some(e => e.id === p.id && isBetween(anchor, e.debut, e.fin))
              );
              return (
                <div key={p.id} style={{ background:C.s1, border:`1px solid ${C.border}`, borderTop:`3px solid ${p.c}`, borderRadius:6, padding:12 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:p.c, marginBottom:2 }}>{p.label}</div>
                  <div style={{ fontSize:10, color:C.muted, marginBottom:10 }}>{p.who}</div>
                  {activeOrders.length === 0 && <div style={{ fontSize:11, color:C.muted, fontStyle:"italic" }}>Rien ce jour</div>}
                  {activeOrders.map(({ cmd, cc }) => {
                    if (!cc) return null;
                    const tm = TYPES_MENUISERIE[cmd.type];
                    const etape = cc.etapes.find(e => e.id === p.id);
                    const retardColor = cc.critique ? C.red : cc.enRetard ? C.orange : C.green;
                    return (
                      <div key={String(cmd.id)} style={{ marginBottom:8, padding:8, background:C.bg, borderRadius:4, border:`1px solid ${C.border}`, borderLeft:`2px solid ${retardColor}` }}>
                        <div style={{ fontSize:12, fontWeight:700, marginBottom:2 }}>{cmd.client}</div>
                        <div style={{ fontSize:10, color:C.sec }}>{tm?.label} × {cmd.quantite}</div>
                        {etape && (
                          <div style={{ fontSize:9, color:p.c, marginTop:4 }} className="mono">
                            {fmtDate(etape.debut)} → {fmtDate(etape.fin)}
                          </div>
                        )}
                        {cc.enRetard && <Bdg t={`+${cc.retardJours}j retard`} c={retardColor} sz={8} />}
                      </div>
                    );
                  })}
                  {/* Charge du jour */}
                  <div style={{ marginTop:8, paddingTop:8, borderTop:`1px solid ${C.border}`, fontSize:10, color:C.sec }}>
                    {activeOrders.length} commande(s) en cours
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ════════════ VUE MOIS — calendrier ════════════ */}
      {view === "mois" && (
        <div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:4, gap:2 }}>
            {JOURS_FR.map(d => (
              <div key={d} style={{ textAlign:"center", fontSize:10, color:C.sec, padding:"4px 0", fontWeight:700 }}>{d}</div>
            ))}
          </div>

          {monthGrid.map((week, wi) => (
            <div key={wi} style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, marginBottom:2 }}>
              {week.map((day, di) => {
                if (!day) return <div key={di} style={{ minHeight:72, background:C.s2, borderRadius:4 }} />;
                const isToday  = day === today;
                const isWeekend = di >= 5;
                const dayEtapes = chemins.flatMap(({ cmd, cc }) => {
                  if (!cc) return [];
                  return cc.etapes
                    .filter(e => (poste === "tous" || e.id === poste) && isBetween(day, e.debut, e.fin))
                    .map(e => ({ cmd, e }));
                });
                return (
                  <div key={di}
                    onClick={() => { setView("jour"); setAnchor(day); }}
                    style={{ minHeight:72, background: isToday ? C.orange+"22" : isWeekend ? C.s2 : C.s1, borderRadius:4, border:`1px solid ${isToday ? C.orange : C.border}`, padding:4, cursor:"pointer" }}>
                    <div style={{ fontSize:11, fontWeight: isToday ? 700 : 400, color: isToday ? C.orange : isWeekend ? C.muted : C.sec, marginBottom:4 }}>
                      {new Date(day).getDate()}
                    </div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:2 }}>
                      {dayEtapes.slice(0, 5).map(({ cmd, e }, i) => (
                        <div key={i} title={`${cmd.client} — ${e.label}`}
                          style={{ width:8, height:8, borderRadius:"50%", background: ETAPE_C[e.id] || C.sec }} />
                      ))}
                      {dayEtapes.length > 5 && <div style={{ fontSize:8, color:C.muted }}>+{dayEtapes.length - 5}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Légende */}
          <div style={{ marginTop:12, display:"flex", gap:12, flexWrap:"wrap", alignItems:"center" }}>
            <span style={{ fontSize:10, color:C.sec }}>Légende :</span>
            {Object.entries(ETAPE_C).filter(([k]) => k !== "options").map(([id, c]) => (
              <div key={id} style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:C.sec }}>
                <div style={{ width:8, height:8, borderRadius:"50%", background:c }} />
                {id === "coupe" ? "Coupe" : id === "montage" ? "Montage" : id === "vitrage" ? "Vitrage" : "Contrôle"}
              </div>
            ))}
            <span style={{ fontSize:10, color:C.muted }}>· Cliquer sur un jour pour voir le détail</span>
          </div>
        </div>
      )}
    </div>
  );
}
