"use client";
import { useState, useMemo, useRef, useEffect } from "react";
import { calcCheminCritique, C, CFAM, fmtDate, CommandeCC, TYPES_MENUISERIE, ZONES, JOURS_FERIES, isWorkday, getWeekNum } from "@/lib/sial-data";
import { H, Bdg } from "@/components/ui";
import { openPrintWindow, fmtDatePrint } from "@/lib/print-utils";

const ZONE_COLORS: Record<string, string> = {
  "SIAL":             "#EC407A", // Rose
  "Porto-Vecchio":    "#FB8C00", // Orange
  "Ajaccio":          "#1E88E5", // Bleu
  "Bastia":           "#E53935", // Rouge
  "Balagne":          "#FDD835", // Jaune
  "Plaine Orientale": "#8E24AA", // Violet
  "Continent":        "#43A047", // Vert
  "Sur chantier":     "#6D4C41", // Marron
  "Autre":            "#546E7A", // Gris bleuté
};

function getZoneColor(zone: string | null | undefined, fallback = "#888"): string {
  if (!zone) return fallback;
  // Match exact d'abord
  if (ZONE_COLORS[zone]) return ZONE_COLORS[zone];
  // Match case-insensitive ensuite
  const norm = zone.trim().toLowerCase();
  for (const [k, v] of Object.entries(ZONE_COLORS)) {
    if (k.toLowerCase() === norm) return v;
  }
  return fallback;
}

const TRANSPORTEURS = [
  { id: "nous",    label: "Par nous-mêmes",   c: "#42A5F5" },
  { id: "setec",   label: "Par Setec",         c: "#FFA726" },
  { id: "express", label: "Transporteur express", c: "#66BB6A" },
  { id: "poseur",  label: "Par un poseur",     c: "#AB47BC" },
  { id: "depot",   label: "Client au dépôt",   c: "#26C6DA" },
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

export default function PlanningLivraison({ commandes, onPatch, onEdit }: {
  commandes: CommandeCC[];
  onPatch: (id: string, updates: Record<string, any>) => void;
  onEdit?: (cmd: CommandeCC) => void;
}) {
  const today = localStr(new Date());
  const [view,        setView]        = useState<ViewMode>("semaine");
  const [anchor,      setAnchor]      = useState(() => {
    if (typeof window === "undefined") return today;
    try { return localStorage.getItem("sial_livraison_anchor") || today; } catch { return today; }
  });
  useEffect(() => { try { localStorage.setItem("sial_livraison_anchor", anchor); } catch {} }, [anchor]);
  const [zone,        setZone]        = useState("toutes");
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; fromDay: string } | null>(null);
  const [quickAction, setQuickAction] = useState<{ cmdId: string; client: string; chantier: string; livDate: string; transporteur: string; zone: string; notes: string } | null>(null);
  const [quickNewDate, setQuickNewDate] = useState("");
  const [quickTransporteur, setQuickTransporteur] = useState("");
  const [quickZone, setQuickZone] = useState("");
  const [quickNotes, setQuickNotes] = useState("");

  // ── Quick Action popup : Livrée / Décaler ──
  const openQuickAction = (cmd: any, livDate: string) => {
    setQuickAction({ cmdId: String(cmd.id), client: cmd.client || "", chantier: cmd.ref_chantier || "", livDate, transporteur: cmd.transporteur || "", zone: cmd.zone || "", notes: cmd.notes || "" });
    setQuickNewDate(livDate);
    setQuickTransporteur(cmd.transporteur || "");
    setQuickZone(cmd.zone || "");
    setQuickNotes(cmd.notes || "");
  };

  const quickPatchBase = () => {
    const updates: Record<string, unknown> = {};
    if (quickTransporteur !== quickAction?.transporteur) updates.transporteur = quickTransporteur || null;
    if (quickZone !== quickAction?.zone) updates.zone = quickZone || null;
    if (quickNotes !== (quickAction?.notes || "")) updates.notes = quickNotes || null;
    return updates;
  };

  const markLivree = () => {
    if (!quickAction) return;
    onPatch(quickAction.cmdId, {
      ...quickPatchBase(),
      statut: "livre",
      date_livraison_souhaitee: quickNewDate || quickAction.livDate,
    });
    setQuickAction(null);
  };


  // Enriched commandes
  const enriched = useMemo(() => {
    const result: { cmd: any; c: CommandeCC; cc: any; livSouhaitee: string; livIndex: number; livTotal: number; livDesc: string }[] = [];
    for (const c of commandes) {
      const cc  = calcCheminCritique(c);
      const cmd = c as any;
      const nbLiv = cmd.nb_livraisons || 1;
      const datesLiv = cmd.dates_livraisons as { date: string; description: string }[] | null;

      if (nbLiv > 1 && datesLiv && datesLiv.length > 0) {
        for (let i = 0; i < nbLiv; i++) {
          const livDate = datesLiv[i]?.date || "";
          if (!livDate) continue;
          result.push({ cmd, c, cc, livSouhaitee: livDate, livIndex: i + 1, livTotal: nbLiv, livDesc: datesLiv[i]?.description || "" });
        }
      } else {
        const livSouhaitee = cmd.date_livraison_souhaitee || "";
        if (livSouhaitee) result.push({ cmd, c, cc, livSouhaitee, livIndex: 0, livTotal: 1, livDesc: "" });
      }
    }
    return result;
  }, [commandes]);

  const filtered = zone === "toutes" ? enriched : enriched.filter(x => (x.cmd as any).zone === zone);

  // ── Grouper les livraisons par chargement (date + transporteur + zone) ──
  function groupByChargement(delivs: typeof enriched) {
    const groups = new Map<string, typeof enriched>();
    const order: string[] = [];
    for (const x of delivs) {
      const transp = x.cmd.transporteur || "_aucun";
      const zoneG = x.cmd.zone || "_aucune";
      const key = `${transp}|${zoneG}`;
      if (!groups.has(key)) { groups.set(key, []); order.push(key); }
      groups.get(key)!.push(x);
    }
    return order.map(key => ({ key, items: groups.get(key)! }));
  }

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
    ? `S${getWeekNum(weekDays[0])} — du ${fmtDate(weekDays[0])} au ${fmtDate(weekDays[4])}`
    : view === "jour"
    ? `S${getWeekNum(anchor)} — ${fmtDate(anchor)}`
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
  const handleDragStart = (id: string, fromDay: string, splitIndex?: number) => (e: React.DragEvent) => {
    (dragRef as any).current = { id, fromDay, splitIndex };
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
    const drag = (dragRef as any).current;
    if (!drag || drag.fromDay === day) { dragRef.current = null; return; }
    if (drag.splitIndex != null && drag.splitIndex > 0) {
      const cmd = commandes.find(c => String(c.id) === drag.id) as any;
      if (cmd?.dates_livraisons) {
        const arr = [...(cmd.dates_livraisons as any[])];
        arr[drag.splitIndex - 1] = { ...arr[drag.splitIndex - 1], date: day };
        onPatch(drag.id, { dates_livraisons: arr });
      }
    } else {
      onPatch(drag.id, { date_livraison_souhaitee: day });
      const cmd = commandes.find(c => String(c.id) === drag.id) as any;
      if (cmd?.dates_livraisons && cmd.nb_livraisons > 1) {
        const arr = [...(cmd.dates_livraisons as any[])];
        arr[0] = { ...arr[0], date: day };
        onPatch(drag.id, { date_livraison_souhaitee: day, dates_livraisons: arr });
      }
    }
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
    const { cmd, c, cc, livSouhaitee, livIndex, livTotal, livDesc } = x;
    const tm = TYPES_MENUISERIE[c.type];
    const retardColor = cc?.critique ? C.red : cc?.enRetard ? C.orange : C.green;
    const jr = livSouhaitee
      ? Math.round((new Date(livSouhaitee).getTime() - Date.now()) / 86400000)
      : null;
    const jc = jr === null ? C.sec : jr < 0 ? C.red : jr < 7 ? C.orange : C.green;
    const zoneColor = getZoneColor(cmd.zone, C.sec);
    const transp = TRANSPORTEURS.find(t => t.id === cmd.transporteur);
    const isSplit = livTotal > 1;

    return (
      <div
        draggable={isDraggable}
        onDragStart={isDraggable ? handleDragStart(String(c.id), livSouhaitee, livIndex || undefined) : undefined}
        onDragEnd={isDraggable ? handleDragEnd : undefined}
        onClick={() => openQuickAction(cmd, livSouhaitee)}
        onDoubleClick={() => onEdit?.(x.c)}
        style={{
          marginBottom:6, padding:"8px 10px", background:C.bg, borderRadius:5,
          border:`1px solid ${zoneColor}44`, borderLeft:`4px solid ${zoneColor}`,
          cursor: "pointer",
        }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap", marginBottom:3 }}>
              <span className="mono" style={{ fontSize:10, color:C.orange, fontWeight:700 }}>{cmd.num_commande||"—"}</span>
              <span style={{ fontSize:13, fontWeight:700, color:C.text }}>{c.client}</span>
              {cmd.ref_chantier && <Bdg t={cmd.ref_chantier} c={C.teal} sz={9}/>}
              {isSplit && (
                <span style={{ fontSize:9, padding:"1px 7px", background:C.purple+"22", border:`1px solid ${C.purple}66`, borderRadius:3, color:C.purple, fontWeight:700 }}>
                  {livIndex}/{livTotal}
                </span>
              )}
              {tm && <Bdg t={tm.label} c={tm.famille==="hors_standard"?C.purple:CFAM[tm.famille]||C.blue} sz={9}/>}
              <Bdg t={`×${c.quantite}`} c={C.sec} sz={9}/>
              {transp
                ? <span style={{ fontSize:9, padding:"1px 6px", background:transp.c+"22", border:`1px solid ${transp.c}44`, borderRadius:3, color:transp.c, fontWeight:700 }}>{transp.label}</span>
                : <span style={{ fontSize:9, padding:"1px 6px", borderRadius:3, color:C.muted, fontStyle:"italic" }}>— transporteur non défini</span>
              }
            </div>
            <div style={{ display:"flex", gap:10, fontSize:10, color:C.sec, flexWrap:"wrap" }}>
              {cmd.zone && <span style={{ color: zoneColor, fontWeight: 600 }}>{cmd.zone}</span>}
              {isSplit && livDesc && <span style={{ color: C.purple, fontWeight: 600 }}>{livDesc}</span>}
              {showDate && livSouhaitee && (
                <span>Livraison : <span className="mono" style={{ color:C.text }}>{fmtDate(livSouhaitee)}</span></span>
              )}
              {cc?.dateLivraisonAuPlusTot && livSouhaitee !== cc.dateLivraisonAuPlusTot && (
                <span>Au + tôt : <span className="mono" style={{ color:retardColor }}>{fmtDate(cc.dateLivraisonAuPlusTot)}</span></span>
              )}
            </div>
            {cmd.notes && (
              <div style={{ fontSize:9, color:C.yellow, marginTop:3, whiteSpace:"pre-wrap", overflow:"hidden", maxHeight:28, textOverflow:"ellipsis" }}>
                {cmd.notes.length > 80 ? cmd.notes.slice(0, 80) + "…" : cmd.notes}
              </div>
            )}
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
      const zc = getZoneColor(cmd.zone);
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
      <div style={{ marginBottom:10, padding:"8px 10px", background:C.s1, borderRadius:6, border:`1px solid ${C.border}` }}>
        <div style={{ fontSize:9, color:C.sec, fontWeight:700, letterSpacing:"0.07em", marginBottom:5 }}>LÉGENDE — ZONES</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
          {Object.entries(ZONE_COLORS).map(([z, col]) => (
            <span key={z} style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:10, padding:"2px 8px", borderRadius:3, background:col+"22", border:`1px solid ${col}55`, color:col, fontWeight:600 }}>
              <span style={{ width:8, height:8, borderRadius:"50%", background:col, display:"inline-block", flexShrink:0 }} />
              {z}
            </span>
          ))}
          <span style={{ fontSize:10, color:C.sec, marginLeft:6 }}>· Transporteurs :</span>
          {TRANSPORTEURS.map(t => (
            <span key={t.id} style={{ fontSize:10, padding:"2px 8px", borderRadius:3, background:t.c+"22", border:`1px solid ${t.c}55`, color:t.c, fontWeight:600 }}>{t.label}</span>
          ))}
        </div>
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
                  {/* Bouton "Tout Livré" si jour passé (≤ aujourd'hui) et commandes non livrées */}
                  {(day <= today) && (() => {
                    const nonLivrees = delivs.filter(x => (x.cmd as any).statut !== "livre");
                    if (nonLivrees.length === 0) return null;
                    return (
                      <button onClick={() => {
                        if (!confirm(`Marquer les ${nonLivrees.length} commande(s) du ${fmtDate(day)} comme livrées ?`)) return;
                        for (const x of nonLivrees) {
                          onPatch(String(x.c.id), { statut: "livre" });
                        }
                      }} style={{
                        marginTop: 4, padding: "3px 8px", background: C.green + "22",
                        border: `1px solid ${C.green}`, borderRadius: 3, color: C.green,
                        fontSize: 9, fontWeight: 700, cursor: "pointer", width: "100%",
                      }}>
                        ✓ Tout livré ({nonLivrees.length})
                      </button>
                    );
                  })()}
                </div>

                {isDragTarget && delivs.length === 0 && (
                  <div style={{ fontSize:9, color:C.green, textAlign:"center", padding:"8px 0", border:`1px dashed ${C.green}`, borderRadius:3 }}>
                    ↓ Déposer ici
                  </div>
                )}

                {delivs.length === 0 && !isDragTarget && (
                  <div style={{ fontSize:10, color:C.muted, textAlign:"center" }}>—</div>
                )}

                {groupByChargement(delivs).map((grp, gi) => {
                  const transpId = grp.items[0].cmd.transporteur;
                  const zoneName = grp.items[0].cmd.zone;
                  const transp = TRANSPORTEURS.find(t => t.id === transpId);
                  const zoneCol = getZoneColor(zoneName, C.border);
                  const totalQte = grp.items.reduce((s, x) => s + (x.c.quantite || 0), 0);

                  return (
                    <div key={gi} style={{
                      marginBottom: 6,
                      padding: grp.items.length > 1 ? "4px 5px 5px" : 0,
                      background: grp.items.length > 1 ? zoneCol + "10" : "transparent",
                      borderRadius: 5,
                      border: grp.items.length > 1 ? `2px dashed ${zoneCol}66` : "none",
                    }}>
                      {grp.items.length > 1 && (
                        <div style={{ fontSize: 8, fontWeight: 700, color: zoneCol, marginBottom: 3, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span>🚚 CHARGEMENT ({grp.items.length} cmd, {totalQte}p)</span>
                          <span style={{ color: transp?.c || C.muted }}>{transp?.label?.slice(0, 10) || "?"}</span>
                        </div>
                      )}
                      {grp.items.map((x, i) => {
                        const retardColor = x.cc?.critique ? C.red : x.cc?.enRetard ? C.orange : C.green;
                        const tm = TYPES_MENUISERIE[x.c.type];
                        return (
                          <div key={i}
                            draggable
                            onDragStart={handleDragStart(String(x.c.id), x.livSouhaitee)}
                            onDragEnd={handleDragEnd}
                            onClick={() => openQuickAction(x.cmd, x.livSouhaitee)}
                            onDoubleClick={e => { e.stopPropagation(); onEdit?.(x.c); }}
                            style={{ marginBottom: i < grp.items.length - 1 ? 2 : 0, padding:"5px 6px", background:C.bg, borderRadius:4, border:`1px solid ${zoneCol}33`, borderLeft:`4px solid ${zoneCol}`, cursor: "pointer", userSelect:"none" }}>
                            <div style={{ fontSize:11, fontWeight:700, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                              {x.c.client}{x.cmd.ref_chantier ? ` — ${x.cmd.ref_chantier}` : ""}
                            </div>
                            <div style={{ fontSize:9, color:C.sec }}>{tm?.label} ×{x.c.quantite}</div>
                            <div style={{ display:"flex", gap:4, marginTop:2, flexWrap:"wrap", alignItems:"center" }}>
                              {x.cc?.enRetard && <Bdg t={`+${x.cc.retardJours}j`} c={retardColor} sz={8}/>}
                              {grp.items.length === 1 && (transp
                                ? <span style={{ fontSize:8, padding:"0px 4px", background:transp.c+"22", border:`1px solid ${transp.c}44`, borderRadius:2, color:transp.c, fontWeight:700 }}>{transp.label}</span>
                                : <span style={{ fontSize:8, color:C.muted, fontStyle:"italic" }}>— transporteur non défini</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
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
            const sorted = [...delivs].sort((a,b) => (a.cc?.critique?0:1) - (b.cc?.critique?0:1));
            const groups = groupByChargement(sorted);
            const nonLivrees = sorted.filter(x => (x.cmd as any).statut !== "livre");
            const isPassed = anchor <= today;
            return (
              <div>
                <div style={{ marginBottom:10, fontSize:12, color:C.sec, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <span>
                    <span className="mono" style={{ color:C.green, fontWeight:700 }}>{delivs.length}</span> livraison(s) prévue(s) le {fmtDate(anchor)} · <span className="mono" style={{ color: C.blue, fontWeight: 700 }}>{groups.filter(g => g.items.length > 1 || g.items[0].cmd.transporteur).length}</span> chargement(s)
                  </span>
                  {isPassed && nonLivrees.length > 0 && (
                    <button onClick={() => {
                      if (!confirm(`Marquer les ${nonLivrees.length} commande(s) du ${fmtDate(anchor)} comme livrées ?`)) return;
                      for (const x of nonLivrees) onPatch(String(x.c.id), { statut: "livre" });
                    }} style={{
                      padding: "6px 14px", background: C.green, border: "none", borderRadius: 5,
                      color: "#000", fontSize: 12, fontWeight: 700, cursor: "pointer",
                    }}>
                      ✓ Tout livré ({nonLivrees.length})
                    </button>
                  )}
                </div>
                {groups.map((grp, gi) => {
                  const transpId = grp.items[0].cmd.transporteur;
                  const zoneName = grp.items[0].cmd.zone;
                  const transp = TRANSPORTEURS.find(t => t.id === transpId);
                  const zoneCol = getZoneColor(zoneName, C.border);
                  const totalQte = grp.items.reduce((s, x) => s + (x.c.quantite || 0), 0);
                  if (grp.items.length === 1 && !transpId) {
                    return <DelivCard key={gi} x={grp.items[0]} draggable />;
                  }
                  return (
                    <div key={gi} style={{
                      marginBottom: 10, padding: 10, borderRadius: 8,
                      background: zoneCol + "10",
                      border: `2px dashed ${zoneCol}66`,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: zoneCol }}>
                          🚚 Chargement · {zoneName || "Zone?"}
                        </div>
                        <div style={{ fontSize: 11, color: transp?.c || C.muted, fontWeight: 600 }}>
                          {transp?.label || "Transporteur non défini"} · {grp.items.length} cmd · {totalQte} pièces
                        </div>
                      </div>
                      {grp.items.map((x, i) => <DelivCard key={i} x={x} draggable />)}
                    </div>
                  );
                })}
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
                          // retardColor unused — zone color used instead
                          const transp = TRANSPORTEURS.find(t => t.id === x.cmd.transporteur);
                          const zoneCol = getZoneColor(x.cmd.zone, C.border);
                          return (
                            <div key={i}
                              draggable
                              onDragStart={e => { e.stopPropagation(); handleDragStart(String(x.c.id), x.livSouhaitee)(e); }}
                              onDragEnd={handleDragEnd}
                              onDoubleClick={e => { e.stopPropagation(); onEdit?.(x.c); }}
                              style={{ fontSize:8, color:C.sec, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", marginBottom:1, padding:"1px 3px", background:C.bg, borderRadius:2, borderLeft:`3px solid ${zoneCol}`, cursor: onEdit ? "pointer" : "grab" }}>
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
      {/* ── Popup rapide livraison ── */}
      {quickAction && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setQuickAction(null)}>
          <div style={{ background: C.s1, borderRadius: 12, padding: 20, width: 360, maxWidth: "90vw", border: `1px solid ${C.border}` }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
              {quickAction.client}
            </div>
            {quickAction.chantier && <div style={{ fontSize: 11, color: C.teal, marginBottom: 8 }}>{quickAction.chantier}</div>}
            <div style={{ fontSize: 10, color: C.sec, marginBottom: 12 }}>
              Livraison prévue : <b>{fmtDate(quickAction.livDate)}</b> (S{getWeekNum(quickAction.livDate)})
            </div>

            {/* Date */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 10, color: C.sec, display: "block", marginBottom: 4 }}>Date de livraison</label>
              <input type="date" value={quickNewDate} onChange={e => setQuickNewDate(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 13 }} />
              {quickNewDate && quickNewDate !== quickAction.livDate && (
                <div style={{ fontSize: 10, color: C.orange, marginTop: 4 }}>
                  Nouvelle date : S{getWeekNum(quickNewDate)} — {fmtDate(quickNewDate)}
                </div>
              )}
            </div>

            {/* Transporteur + Zone */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: C.sec, display: "block", marginBottom: 4 }}>Transporteur</label>
                <select value={quickTransporteur} onChange={e => setQuickTransporteur(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", background: C.bg, border: `1px solid ${quickTransporteur ? C.blue : C.border}`, borderRadius: 6, color: C.text, fontSize: 12 }}>
                  <option value="">— Non defini —</option>
                  {TRANSPORTEURS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: C.sec, display: "block", marginBottom: 4 }}>Zone</label>
                <select value={quickZone} onChange={e => setQuickZone(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", background: C.bg, border: `1px solid ${quickZone ? C.teal : C.border}`, borderRadius: 6, color: C.text, fontSize: 12 }}>
                  <option value="">— Zone —</option>
                  {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 10, color: C.yellow, display: "block", marginBottom: 4, fontWeight: 700 }}>Notes chantier</label>
              <textarea value={quickNotes} onChange={e => setQuickNotes(e.target.value)}
                placeholder="Ajouter des notes sur ce chantier / cette livraison…"
                style={{ width: "100%", boxSizing: "border-box", minHeight: 60, padding: "8px 10px", background: C.bg, border: `1px solid ${quickNotes ? C.yellow + "66" : C.border}`, borderRadius: 6, color: C.text, fontSize: 12, resize: "vertical", outline: "none" }} />
            </div>

            {/* Bouton Enregistrer (change transporteur/zone/date sans changer statut) */}
            <button onClick={() => {
              if (!quickAction) return;
              const updates: Record<string, unknown> = { ...quickPatchBase() };
              if (quickNewDate && quickNewDate !== quickAction.livDate) {
                updates.date_livraison_souhaitee = quickNewDate;
              }
              if (Object.keys(updates).length === 0) { setQuickAction(null); return; }
              onPatch(quickAction.cmdId, updates);
              setQuickAction(null);
            }} style={{
              width: "100%", padding: "10px 0", background: C.orange, border: "none", borderRadius: 6,
              color: "#000", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 8,
            }}>
              💾 Enregistrer
            </button>

            {/* Actions statut */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button onClick={markLivree} style={{
                flex: 1, padding: "10px 0", background: C.green, border: "none", borderRadius: 6,
                color: "#000", fontWeight: 700, fontSize: 12, cursor: "pointer",
              }}>
                ✓ Livrée
              </button>
              <button onClick={() => {
                if (!quickAction) return;
                const dateUsed = quickNewDate || quickAction.livDate;
                onPatch(quickAction.cmdId, {
                  ...quickPatchBase(),
                  statut: "en_cours",
                  notes: ((commandes.find(c => String(c.id) === quickAction.cmdId) as any)?.notes || "") + `\n[Livraison partielle le ${fmtDate(dateUsed)}]`,
                });
                setQuickAction(null);
              }} style={{
                flex: 1, padding: "10px 0", background: C.orange + "22", border: `1px solid ${C.orange}`,
                borderRadius: 6, color: C.orange, fontWeight: 700, fontSize: 12, cursor: "pointer",
              }}>
                Partielle
              </button>
            </div>

            {/* Lien modifier */}
            <div style={{ textAlign: "center", marginTop: 10 }}>
              <button onClick={() => { setQuickAction(null); onEdit?.(commandes.find(c => String(c.id) === quickAction.cmdId)!); }}
                style={{ background: "none", border: "none", color: C.sec, fontSize: 10, cursor: "pointer", textDecoration: "underline" }}>
                Modifier la commande
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
