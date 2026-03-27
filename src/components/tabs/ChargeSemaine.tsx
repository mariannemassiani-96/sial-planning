"use client";
import { useState, useMemo } from "react";
import { calcCheminCritique, calcLogistique, T, C, hm, CommandeCC, TYPES_MENUISERIE, isWorkday, JOURS_FERIES } from "@/lib/sial-data";
import { H, Bdg, Bar, Card } from "@/components/ui";
import { openPrintWindow, fmtDatePrint, hmPrint, pctColor } from "@/lib/print-utils";

type ViewMode = "semaine" | "jour" | "mois";

const MOIS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

const POSTE_INFO = {
  coupe:      { l:"Coupe / Soudure",       who:"Julien · Laurent · Mateo", c:C.blue,   capJour:3*480 },
  frappes:    { l:"Montage Frappes",       who:"Michel · Jean-François",   c:C.orange, capJour:2*480 },
  coulissant: { l:"Coulissant / Glandage", who:"Alain (30h/sem)",          c:C.green,  capJour:360   },
  vitrage_ov: { l:"Vitrage Ouvrants",      who:"Quentin",                  c:C.cyan,   capJour:480   },
  palette:    { l:"Contrôle + Palette",    who:"Guillaume",                c:"#66BB6A",capJour:240   },
} as const;
type PosteKey = keyof typeof POSTE_INFO;

const ETAPE_COLOR: Record<string,string> = { coupe:C.blue, montage:C.orange, vitrage:C.cyan, palette:"#66BB6A" };

function localStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function addDays(s: string, n: number): string {
  const d = new Date(s+"T00:00:00"); d.setDate(d.getDate()+n); return localStr(d);
}
function getMondayOf(s: string): string {
  const d = new Date(s+"T00:00:00");
  const day = d.getDay();
  d.setDate(d.getDate()-(day===0?6:day-1));
  return localStr(d);
}
function workdaysBetween(start: string, end: string): number {
  let count = 0;
  const d = new Date(start+"T00:00:00");
  while (localStr(d) <= end) { if (isWorkday(localStr(d))) count++; d.setDate(d.getDate()+1); }
  return Math.max(1, count);
}
function getWeekNum(s: string): number {
  const d = new Date(s+"T00:00:00");
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const w1start = new Date(jan4); w1start.setDate(jan4.getDate()-((jan4.getDay()||7)-1));
  return Math.ceil((d.getTime()-w1start.getTime())/(7*86400000))+1;
}

function calcChargePoste(commandes: CommandeCC[], pStart: string, pEnd: string): Record<PosteKey,number> {
  const r: Record<PosteKey,number> = { coupe:0, frappes:0, coulissant:0, vitrage_ov:0, palette:0 };
  commandes.forEach(cmd => {
    const cc = calcCheminCritique(cmd);
    if (!cc) return;
    const famille = TYPES_MENUISERIE[cmd.type]?.famille || "";
    cc.etapes.forEach(et => {
      if (et.id==="options" || et.duree_min===0) return;
      const oStart = et.debut>pStart ? et.debut : pStart;
      const oEnd   = et.fin<pEnd   ? et.fin   : pEnd;
      if (oStart>oEnd) return;
      const totalWd = workdaysBetween(et.debut, et.fin);
      const ovWd    = workdaysBetween(oStart, oEnd);
      const load    = Math.round(et.duree_min*ovWd/totalWd);
      let p: PosteKey|null = null;
      if (et.id==="coupe")   p="coupe";
      else if (et.id==="montage") p=(famille==="coulissant"||famille==="glandage")?"coulissant":"frappes";
      else if (et.id==="vitrage") p="vitrage_ov";
      else if (et.id==="palette") p="palette";
      if (p) r[p]+=load;
    });
  });
  return r;
}

export default function ChargeSemaine({ commandes }: { commandes: CommandeCC[] }) {
  const today = localStr(new Date());
  const [view, setView]     = useState<ViewMode>("semaine");
  const [anchor, setAnchor] = useState(today);

  const navigate = (delta: number) => {
    if (view==="semaine") setAnchor(p => addDays(getMondayOf(p), delta*7));
    else if (view==="jour") setAnchor(p => {
      let d = addDays(p, delta);
      let guard = 0;
      while (!isWorkday(d) && guard++<7) d = addDays(d, delta>0?1:-1);
      return d;
    });
    else setAnchor(p => { const d=new Date(p+"T00:00:00"); d.setMonth(d.getMonth()+delta); d.setDate(1); return localStr(d); });
  };

  const { pStart, pEnd, navLabel } = useMemo(() => {
    if (view==="semaine") {
      const mon = getMondayOf(anchor);
      const fri = addDays(mon, 4);
      return { pStart:mon, pEnd:fri, navLabel:`Semaine ${getWeekNum(mon)} — ${new Date(mon+"T00:00:00").toLocaleDateString("fr-FR",{day:"2-digit",month:"short"})} → ${new Date(fri+"T00:00:00").toLocaleDateString("fr-FR",{day:"2-digit",month:"short",year:"numeric"})}` };
    } else if (view==="jour") {
      return { pStart:anchor, pEnd:anchor, navLabel:new Date(anchor+"T00:00:00").toLocaleDateString("fr-FR",{weekday:"long",day:"2-digit",month:"long",year:"numeric"}) };
    } else {
      const d=new Date(anchor+"T00:00:00"); const y=d.getFullYear(),m=d.getMonth();
      return { pStart:localStr(new Date(y,m,1)), pEnd:localStr(new Date(y,m+1,0)), navLabel:`${MOIS_FR[m]} ${y}` };
    }
  }, [view, anchor]);

  const wdInPeriod = useMemo(() => workdaysBetween(pStart, pEnd), [pStart, pEnd]);
  const weekFrac   = wdInPeriod / 5;

  const charge = useMemo(() => {
    const r = calcChargePoste(commandes, pStart, pEnd);
    r.coupe += Math.round((T.prep_deballage_joints_sem+T.coupe_double_tete_sem)*weekFrac);
    return r;
  }, [commandes, pStart, pEnd, weekFrac]);

  const cap = useMemo(() => {
    const wd = wdInPeriod;
    const result: Record<PosteKey,number> = {} as any;
    (Object.keys(POSTE_INFO) as PosteKey[]).forEach(p => result[p]=POSTE_INFO[p].capJour*wd);
    return result;
  }, [wdInPeriod]);

  const activeCommandes = useMemo(() =>
    commandes.filter(cmd => {
      const cc = calcCheminCritique(cmd);
      if (!cc||!cc.etapes.length) return false;
      return cc.etapes[0].debut<=pEnd && cc.etapes[cc.etapes.length-1].fin>=pStart;
    }), [commandes, pStart, pEnd]);

  const logi = useMemo(() => calcLogistique(activeCommandes), [activeCommandes]);

  // Month heatmap data
  const monthDays = useMemo(() => {
    if (view!=="mois") return [];
    const d=new Date(anchor+"T00:00:00"); const y=d.getFullYear(),m=d.getMonth();
    const days=[];
    for (let i=1; i<=new Date(y,m+1,0).getDate(); i++) {
      const ds=localStr(new Date(y,m,i));
      if (!isWorkday(ds)) continue;
      const dc=calcChargePoste(commandes,ds,ds);
      dc.coupe+=Math.round((T.prep_deballage_joints_sem+T.coupe_double_tete_sem)*0.2);
      const pcts=(Object.keys(POSTE_INFO) as PosteKey[]).map(p=>dc[p]>0?dc[p]/POSTE_INFO[p].capJour:0);
      days.push({ ds, maxPct:Math.max(...pcts,0), dc });
    }
    return days;
  }, [view, anchor, commandes]);

  const ferie = view==="jour" ? JOURS_FERIES[anchor] : null;

  // ── Impression ───────────────────────────────────────────────────────────
  const handlePrint = () => {
    const ETAPE_TO_POSTE: Record<string, (f: string) => PosteKey | null> = {
      coupe:   () => "coupe",
      montage: (f) => (f==="coulissant"||f==="glandage") ? "coulissant" : "frappes",
      vitrage: () => "vitrage_ov",
      palette: () => "palette",
    };
    const cmdsAtPoste = (p: PosteKey) => activeCommandes.filter(cmd => {
      const cc = calcCheminCritique(cmd); if (!cc) return false;
      const fam = TYPES_MENUISERIE[cmd.type]?.famille || "";
      return cc.etapes.some(et => {
        if (et.debut>pEnd||et.fin<pStart||et.duree_min===0) return false;
        const fn = ETAPE_TO_POSTE[et.id]; return fn ? fn(fam)===p : false;
      });
    });

    const header = `
      <div class="header">
        <div class="header-left">
          <h1>SIAL <span>+</span> ISULA &nbsp;|&nbsp; Charge Atelier</h1>
          <div class="subtitle">${navLabel}</div>
        </div>
        <div class="header-right">
          <div>${wdInPeriod} jour${wdInPeriod>1?"s":""} ouvré${wdInPeriod>1?"s":""}</div>
          <div>${activeCommandes.length} commande${activeCommandes.length>1?"s":""} en cours</div>
          <div>Vue : ${view}</div>
        </div>
      </div>`;

    const postesHtml = (Object.keys(POSTE_INFO) as PosteKey[]).map(p => {
      const info = POSTE_INFO[p];
      const v = (p==="coupe" ? charge.coupe : charge[p]) || 0;
      const max = cap[p] || 1;
      const pct = Math.min(100, Math.round(v/max*100));
      const cmds = cmdsAtPoste(p);
      const col = pctColor(pct);
      const rows = cmds.map(cmd => {
        const cc = calcCheminCritique(cmd);
        const fam = TYPES_MENUISERIE[cmd.type]?.famille || "";
        const et = cc?.etapes.find(e => {
          const fn = ETAPE_TO_POSTE[e.id]; return fn && fn(fam)===p && e.debut<=pEnd && e.fin>=pStart;
        });
        const num = (cmd as any).num_commande || "—";
        const retard = cc?.enRetard ? `<span class="${cc.critique?"crit":"warn"}">+${cc.retardJours}j</span>` : `<span class="ok">OK</span>`;
        return `<tr>
          <td class="mono" style="white-space:nowrap">${num}</td>
          <td><b>${cmd.client}</b>${(cmd as any).ref_chantier ? `<br/><span style="font-size:9px;color:#666">${(cmd as any).ref_chantier}</span>` : ""}</td>
          <td>${TYPES_MENUISERIE[cmd.type]?.label||cmd.type}</td>
          <td class="center">${cmd.quantite}</td>
          <td class="mono">${fmtDatePrint(et?.debut)}</td>
          <td class="mono">${fmtDatePrint(et?.fin)}</td>
          <td class="mono">${et ? hmPrint(et.duree_min) : "—"}</td>
          <td class="center">${retard}</td>
        </tr>`;
      }).join("");
      return `
        <h2>${info.l}</h2>
        <div class="section-card">
          <div class="stats">
            <span><b>${info.who}</b></span>
            <span>Charge : <b>${hmPrint(v)}</b> / ${hmPrint(max)}</span>
            <span style="color:${col}"><b>${pct}%</b></span>
          </div>
          <div class="bar-wrap"><div class="bar-fill" style="width:${pct}%;background:${col}"></div></div>
          ${cmds.length>0 ? `
          <table style="margin-top:8px">
            <tr><th>N° Cmd</th><th>Client</th><th>Type</th><th>Qté</th><th>Début</th><th>Fin</th><th>Durée</th><th>État</th></tr>
            ${rows}
          </table>` : `<p style="margin-top:8px;color:#666;font-size:10px">Aucune commande sur cette période.</p>`}
        </div>`;
    }).join("");

    openPrintWindow(`Charge Atelier — ${navLabel}`, header + postesHtml);
  };

  return (
    <div>
      <H c={C.orange}>Charge atelier</H>

      {/* Controls */}
      <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap", alignItems:"center" }}>
        <div style={{ display:"flex", gap:4 }}>
          {(["semaine","jour","mois"] as ViewMode[]).map(v=>(
            <button key={v} onClick={()=>setView(v)} style={{ padding:"5px 12px", background:view===v?C.orange+"33":C.s1, border:`1px solid ${view===v?C.orange:C.border}`, borderRadius:4, color:view===v?C.orange:C.sec, fontSize:11, fontWeight:600, cursor:"pointer" }}>
              {v.charAt(0).toUpperCase()+v.slice(1)}
            </button>
          ))}
        </div>
        <button onClick={()=>navigate(-1)} style={{ padding:"5px 10px", background:C.s1, border:`1px solid ${C.border}`, borderRadius:4, color:C.sec, cursor:"pointer", fontSize:14 }}>‹</button>
        <span style={{ fontSize:12, fontWeight:600, color:C.text, minWidth:280, textAlign:"center" }}>{navLabel}</span>
        <button onClick={()=>navigate(1)}  style={{ padding:"5px 10px", background:C.s1, border:`1px solid ${C.border}`, borderRadius:4, color:C.sec, cursor:"pointer", fontSize:14 }}>›</button>
        <button onClick={()=>setAnchor(today)} style={{ padding:"5px 10px", background:C.s1, border:`1px solid ${C.border}`, borderRadius:4, color:C.sec, cursor:"pointer", fontSize:11 }}>
          {view==="jour"?"Aujourd'hui":view==="semaine"?"Cette semaine":"Ce mois"}
        </button>
        <span style={{ fontSize:10, color:C.sec }}>{wdInPeriod} j. ouvrés · {activeCommandes.length} cmd en cours</span>
        <button onClick={handlePrint} style={{ marginLeft:"auto", padding:"5px 14px", background:"#000", color:"#fff", border:"none", borderRadius:4, cursor:"pointer", fontSize:11, fontWeight:700 }}>
          🖨️ Imprimer
        </button>
      </div>

      {ferie && (
        <div style={{ marginBottom:12, padding:"8px 14px", background:C.purple+"22", border:`1px solid ${C.purple}55`, borderRadius:6, fontSize:11, color:C.purple }}>
          🎉 Jour férié : {ferie}
        </div>
      )}

      {/* Charge bars */}
      <div style={{ display:"grid", gap:10, marginBottom:16 }}>
        {(Object.keys(POSTE_INFO) as PosteKey[]).map(p=>{
          const info=POSTE_INFO[p]; const v=charge[p]||0; const max=cap[p]||1;
          const pct=Math.min(100,Math.round(v/max*100));
          if (v===0 && p!=="coupe") return null;
          return (
            <Card key={p} accent={info.c}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <div>
                  <span style={{ fontSize:13, fontWeight:700, color:info.c }}>{info.l}</span>
                  <span style={{ fontSize:11, color:C.sec, marginLeft:8 }}>{info.who}</span>
                </div>
                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                  <span className="mono" style={{ fontSize:16, fontWeight:700, color:pct>95?C.red:C.text }}>{hm(v)}</span>
                  <span style={{ color:C.sec, fontSize:11 }}>/ {hm(max)}</span>
                  <Bdg t={`${pct}%`} c={pct>95?C.red:pct>80?C.orange:C.green} />
                </div>
              </div>
              <Bar v={v} max={max} c={info.c} h={8} />
              {p==="coupe" && <div style={{ marginTop:6, fontSize:10, color:C.yellow }}>
                Dont {hm(Math.round((T.prep_deballage_joints_sem+T.coupe_double_tete_sem)*weekFrac))} overhead fixe ({view==="jour"?"1/5 sem.":view==="semaine"?"1 sem.":"proportionnel"})
              </div>}
            </Card>
          );
        })}
      </div>

      {/* Month heatmap */}
      {view==="mois" && monthDays.length>0 && (
        <Card style={{ marginBottom:16 }}>
          <div style={{ fontSize:10, color:C.sec, fontWeight:700, marginBottom:10 }}>CHARGE PAR JOUR — cliquer pour détail</div>
          <div style={{ display:"flex", gap:3, flexWrap:"wrap" }}>
            {monthDays.map(({ds,maxPct})=>{
              const d=new Date(ds+"T00:00:00");
              const bg=maxPct>0.9?C.red+"44":maxPct>0.7?C.orange+"44":maxPct>0.2?C.green+"33":C.s2;
              const isToday=ds===today;
              return (
                <div key={ds} onClick={()=>{setView("jour");setAnchor(ds);}}
                  title={`${d.toLocaleDateString("fr-FR")} — ${Math.round(maxPct*100)}% max`}
                  style={{ width:34,height:40,background:bg,borderRadius:4,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",border:`1px solid ${isToday?C.orange:C.border}`,fontWeight:isToday?800:400 }}>
                  <div style={{ fontSize:8,color:C.sec }}>{"LMMJV"[d.getDay()-1]}</div>
                  <div style={{ fontSize:11,color:C.text }}>{d.getDate()}</div>
                  {maxPct>0&&<div style={{ fontSize:7,color:maxPct>0.9?C.red:maxPct>0.7?C.orange:C.green }}>{Math.round(maxPct*100)}%</div>}
                </div>
              );
            })}
          </div>
          <div style={{ display:"flex",gap:12,marginTop:8,fontSize:9,color:C.sec }}>
            <span style={{color:C.green}}>▪ &lt;70%</span>
            <span style={{color:C.orange}}>▪ 70–90%</span>
            <span style={{color:C.red}}>▪ &gt;90% saturé</span>
          </div>
        </Card>
      )}

      {/* Active commandes */}
      {activeCommandes.length>0 && (
        <Card style={{ marginBottom:14 }}>
          <div style={{ fontSize:10, color:C.sec, fontWeight:700, marginBottom:8 }}>COMMANDES EN COURS ({activeCommandes.length})</div>
          <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
            {activeCommandes.map(cmd=>{
              const cc=calcCheminCritique(cmd);
              const activeEtape=cc?.etapes.find(et=>et.debut<=pEnd&&et.fin>=pStart&&et.duree_min>0&&et.id!=="options");
              const ec=activeEtape?ETAPE_COLOR[activeEtape.id]||C.sec:C.sec;
              return (
                <div key={String(cmd.id)} style={{ padding:"4px 8px",background:ec+"22",border:`1px solid ${ec}44`,borderRadius:4,fontSize:10 }}>
                  <span style={{color:C.orange,fontWeight:700}}>{(cmd as any).num_commande||"—"}</span>
                  <span style={{color:C.text,marginLeft:4}}>{cmd.client}{(cmd as any).ref_chantier ? ` — ${(cmd as any).ref_chantier}` : ""}</span>
                  {activeEtape&&<span style={{color:ec,marginLeft:4,fontSize:9}}>({activeEtape.label})</span>}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Logistique */}
      <Card>
        <div style={{ fontSize:10, color:C.cyan, fontWeight:700, marginBottom:10 }}>LOGISTIQUE — {navLabel}</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
          {[
            {l:"Chariots profilés",v:logi.chariots_profils,detail:`${logi.total_pieces_coupe} profils · 80/chariot`,c:C.blue},
            {l:"Chariots vitrages",v:logi.chariots_vitrages,detail:`${logi.ouvrantsCoul} ouvrants · 15/chariot`,c:C.cyan},
            {l:"Palettes livraison",v:logi.palettes,detail:`${logi.pieces} pièces · 6/palette`,c:C.orange},
          ].map((x,i)=>(
            <div key={i} style={{textAlign:"center",padding:14,background:C.bg,borderRadius:6}}>
              <div className="mono" style={{fontSize:32,fontWeight:800,color:x.c}}>{x.v}</div>
              <div style={{fontSize:12,color:C.text,marginBottom:4}}>{x.l}</div>
              <div style={{fontSize:10,color:C.muted}}>{x.detail}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
