"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { calcCheminCritique, C, EQUIPE, TYPES_MENUISERIE, isWorkday, JOURS_FERIES, hm, CommandeCC } from "@/lib/sial-data";
import { H, Card } from "@/components/ui";
import { openPrintWindow } from "@/lib/print-utils";

// ── Types ─────────────────────────────────────────────────────────────────────
type DayPlan  = Record<string, string[]>;
type WeekPlan = Record<string, DayPlan>;
type DragInfo = { opId: string; fromDay: string | null; fromPoste: string | null };

// ── Postes ────────────────────────────────────────────────────────────────────
const POSTES_RH = [
  { id: "coupe",      label: "Coupe / Soudure",      c: "#42A5F5", defaultOps: ["julien","laurent","mateo"] },
  { id: "frappes",    label: "Montage Frappes",      c: "#FFA726", defaultOps: ["michel","jf","apprenti"] },
  { id: "coulissant", label: "Coulissant / Glandage", c: "#66BB6A", defaultOps: ["alain"] },
  { id: "vitrage_ov", label: "Vitrage Ouvrants",     c: "#26C6DA", defaultOps: ["quentin"] },
  { id: "hors_std",   label: "Hors Standard",        c: "#CE93D8", defaultOps: ["jp"] },
  { id: "magasin",    label: "Magasin / Expédition", c: "#FFCA28", defaultOps: ["guillaume"] },
  { id: "isula",      label: "ISULA",                c: "#4DB6AC", defaultOps: ["bruno","momo","ali"] },
] as const;

const OP_COLOR: Record<string, string> = {
  julien:"#42A5F5", laurent:"#42A5F5", mateo:"#42A5F5",
  michel:"#FFA726", jf:"#FFA726", apprenti:"#FFA726",
  alain:"#66BB6A", quentin:"#26C6DA", jp:"#CE93D8",
  guillaume:"#FFCA28", bruno:"#4DB6AC", momo:"#4DB6AC", ali:"#4DB6AC",
};
const CAP_OP: Record<string, number> = { coupe:480, frappes:480, coulissant:480, vitrage_ov:480, hors_std:480, magasin:480, isula:480 };

// ── Date helpers ──────────────────────────────────────────────────────────────
function localStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function getMondayOf(s: string): string {
  const d = new Date(s+"T00:00:00"); const day = d.getDay();
  d.setDate(d.getDate()-(day===0?6:day-1)); return localStr(d);
}
function addDays(s: string, n: number): string {
  const d = new Date(s+"T00:00:00"); d.setDate(d.getDate()+n); return localStr(d);
}
function getWeekNum(s: string): number {
  const d = new Date(s+"T00:00:00");
  const jan4 = new Date(d.getFullYear(),0,4);
  const w1 = new Date(jan4); w1.setDate(jan4.getDate()-((jan4.getDay()||7)-1));
  return Math.ceil((d.getTime()-w1.getTime())/(7*86400000))+1;
}
function semaineId(mondayStr: string): string {
  return `${new Date(mondayStr+"T00:00:00").getFullYear()}-W${String(getWeekNum(mondayStr)).padStart(2,"0")}`;
}

// ── Charge helpers ────────────────────────────────────────────────────────────
function workdaysBetween(start: string, end: string): number {
  let n=0; const d=new Date(start+"T00:00:00");
  while(localStr(d)<=end){ if(isWorkday(localStr(d)))n++; d.setDate(d.getDate()+1); }
  return Math.max(1,n);
}
function chargeDayPoste(commandes: CommandeCC[], day: string): Record<string,number> {
  const r: Record<string,number>={};
  commandes.forEach(cmd=>{
    const cc=calcCheminCritique(cmd); if(!cc) return;
    const fam=TYPES_MENUISERIE[cmd.type]?.famille||"";
    cc.etapes.forEach(et=>{
      if(et.id==="options"||et.duree_min===0||et.debut>day||et.fin<day) return;
      const load=Math.round(et.duree_min/workdaysBetween(et.debut,et.fin));
      let p="";
      if(et.id==="coupe") p="coupe";
      else if(et.id==="montage") p=(fam==="coulissant"||fam==="glandage")?"coulissant":"frappes";
      else if(et.id==="vitrage") p="vitrage_ov";
      else if(et.id==="palette") p="magasin";
      if(p) r[p]=(r[p]||0)+load;
    });
  });
  return r;
}

// ── Proposal generator ────────────────────────────────────────────────────────
function genererProposition(weekDays: string[]): WeekPlan {
  const plan: WeekPlan = {};
  weekDays.forEach(day => {
    const isFriday = new Date(day+"T00:00:00").getDay()===5;
    plan[day] = {};
    POSTES_RH.forEach(poste => {
      let ops = [...poste.defaultOps] as string[];
      if (isFriday) ops = ops.filter(id => !EQUIPE.find(e=>e.id===id)?.vendrediOff);
      plan[day][poste.id] = ops;
    });
  });
  return plan;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PlanningRH({ commandes }: { commandes: CommandeCC[] }) {
  const today   = localStr(new Date());
  const [anchor,    setAnchor]    = useState(getMondayOf(today));
  const [plan,      setPlan]      = useState<WeekPlan>({});
  const [valide,    setValide]    = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [dragOver,  setDragOver]  = useState<{day:string;poste:string}|null>(null);
  const dragRef = useRef<DragInfo | null>(null);

  const weekDays = useMemo(()=>Array.from({length:5},(_,i)=>addDays(anchor,i)),[anchor]);
  const semaine  = useMemo(()=>semaineId(anchor),[anchor]);

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadPlan = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/planning-rh?semaine=${encodeURIComponent(semaine)}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.plan) { setPlan(data.plan); setValide(data.valide); setSaved(true); setLoading(false); return; }
      }
    } catch {}
    setPlan(genererProposition(weekDays));
    setValide(false); setSaved(false); setLoading(false);
  }, [semaine, weekDays]);

  useEffect(()=>{ loadPlan(); },[loadPlan]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const savePlan = async (v: boolean) => {
    await fetch("/api/planning-rh",{ method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({semaine,plan,valide:v}) });
    setValide(v); setSaved(true);
  };

  // ── Mutations ─────────────────────────────────────────────────────────────
  const removeOp = (day: string, poste: string, opId: string) => {
    setPlan(p=>({...p,[day]:{...p[day],[poste]:(p[day]?.[poste]||[]).filter(x=>x!==opId)}}));
    setSaved(false);
  };

  // ── Drag & Drop ───────────────────────────────────────────────────────────
  const handleDragStart = (opId: string, fromDay: string|null, fromPoste: string|null) => (e: React.DragEvent) => {
    dragRef.current = { opId, fromDay, fromPoste };
    e.dataTransfer.effectAllowed = fromDay ? "move" : "copy";
    // Ghost image styling
    const ghost = e.currentTarget as HTMLElement;
    e.dataTransfer.setDragImage(ghost, ghost.offsetWidth/2, ghost.offsetHeight/2);
  };

  const handleDragOver = (day: string, poste: string) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = dragRef.current?.fromDay ? "move" : "copy";
    setDragOver({day, poste});
  };

  const handleDrop = (day: string, poste: string) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const drag = dragRef.current;
    if (!drag) return;
    const { opId, fromDay, fromPoste } = drag;
    // Same cell → noop
    if (fromDay===day && fromPoste===poste) { dragRef.current=null; return; }
    // Already in target → noop
    if ((plan[day]?.[poste]||[]).includes(opId)) { dragRef.current=null; return; }

    setPlan(p => {
      let next = {...p};
      // Remove from source cell (only if dragged from a cell, not from legend)
      if (fromDay && fromPoste) {
        next = {...next,[fromDay]:{...next[fromDay],[fromPoste]:(next[fromDay]?.[fromPoste]||[]).filter(x=>x!==opId)}};
      }
      // Add to target
      next = {...next,[day]:{...next[day],[poste]:[...(next[day]?.[poste]||[]),opId]}};
      return next;
    });
    setSaved(false);
    dragRef.current = null;
  };

  const handleDragEnd = () => { dragRef.current=null; setDragOver(null); };

  // ── Computed ──────────────────────────────────────────────────────────────
  const chargeMap = useMemo(()=>{
    const m: Record<string,Record<string,number>>={};
    weekDays.forEach(day=>{ if(isWorkday(day)) m[day]=chargeDayPoste(commandes,day); });
    return m;
  },[weekDays,commandes]);

  const suggestions = useMemo(()=>{
    const sug: Array<{day:string;msg:string;color:string}>=[];
    weekDays.forEach(day=>{
      const dayPlan=plan[day]||{};
      const isFriday=new Date(day+"T00:00:00").getDay()===5;
      if(isFriday && (dayPlan["coulissant"]||[]).length===0)
        sug.push({day,msg:"Vendredi : Alain absent — coulissant non couvert. Envisager Michel ou JF.",color:C.orange});
      const charge=chargeMap[day]||{};
      POSTES_RH.forEach(poste=>{
        const ops=dayPlan[poste.id]||[];
        const load=charge[poste.id]||0;
        const cap=ops.length*CAP_OP[poste.id];
        if(cap>0 && load/cap>0.95)
          sug.push({day,msg:`${poste.label} saturé (${Math.round(load/cap*100)}%) — envisager renfort.`,color:C.red});
        if(ops.length>0 && load===0 && !["isula","magasin"].includes(poste.id))
          sug.push({day,msg:`${poste.label} : aucune charge — ${ops.map(id=>EQUIPE.find(e=>e.id===id)?.nom||id).join(", ")} disponible.`,color:C.cyan});
      });
    });
    return sug;
  },[plan,weekDays,chargeMap]);

  const JOURS_FR = ["Lun","Mar","Mer","Jeu","Ven"];

  const handlePrint = () => {
    const semLabel = `Semaine ${getWeekNum(anchor)} — ${new Date(anchor+"T00:00:00").toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"})}`;
    const header = `
      <div class="header">
        <div class="header-left">
          <h1>SIAL <span>+</span> ISULA &nbsp;|&nbsp; Affectations Équipe</h1>
          <div class="subtitle">${semLabel}</div>
        </div>
        <div class="header-right">${valide?"<span class=ok>✓ Semaine validée</span>":"<span class=warn>Non validée</span>"}</div>
      </div>`;
    const thDays = weekDays.map((day,i)=>{
      const f=JOURS_FERIES[day];
      return `<th style="text-align:center">${JOURS_FR[i]}<br/><span style="font-weight:400;font-size:9px">${new Date(day+"T00:00:00").toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"})}${f?`<br/><span style="color:#7a4000">${f}</span>`:""}</span></th>`;
    }).join("");
    const rows = POSTES_RH.map(poste=>{
      const cells = weekDays.map(day=>{
        const isHoliday=!!JOURS_FERIES[day]||!isWorkday(day);
        if(isHoliday) return `<td style="background:#f0f0f0;text-align:center;color:#999">—</td>`;
        const ops=plan[day]?.[poste.id]||[];
        const names=ops.map(opId=>EQUIPE.find(e=>e.id===opId)?.nom||opId).join(", ");
        const charge=chargeMap[day]?.[poste.id]||0;
        const cap=ops.length*CAP_OP[poste.id];
        const pct=cap>0?Math.min(100,Math.round(charge/cap*100)):0;
        const col=pct>90?"#990000":pct>70?"#7a4000":"#166116";
        return `<td>${names||"<span style='color:#bbb'>—</span>"}${charge>0?`<div style="font-size:8px;color:${col};margin-top:2px">${hm(charge)}${cap>0?` (${pct}%)`:""}</div>`:""}</td>`;
      }).join("");
      return `<tr><td style="font-weight:700;color:${poste.c}">${poste.label}</td>${cells}</tr>`;
    }).join("");
    const table = `<table><thead><tr><th>Poste</th>${thDays}</tr></thead><tbody>${rows}</tbody></table>`;
    openPrintWindow(`Affectations Équipe — ${semLabel}`, header+table);
  };

  if (loading) return <div style={{textAlign:"center",padding:60,color:C.sec}}>Chargement…</div>;

  return (
    <div>
      <H c={C.purple}>Affectations équipe</H>

      {/* Navigation */}
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <button onClick={()=>setAnchor(p=>addDays(getMondayOf(p),-7))} style={{padding:"5px 10px",background:C.s1,border:`1px solid ${C.border}`,borderRadius:4,color:C.sec,cursor:"pointer",fontSize:14}}>‹</button>
        <span style={{fontSize:13,fontWeight:700,color:C.text,minWidth:220,textAlign:"center"}}>
          Semaine {getWeekNum(anchor)} — {new Date(anchor+"T00:00:00").toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"})}
        </span>
        <button onClick={()=>setAnchor(p=>addDays(getMondayOf(p),7))} style={{padding:"5px 10px",background:C.s1,border:`1px solid ${C.border}`,borderRadius:4,color:C.sec,cursor:"pointer",fontSize:14}}>›</button>
        <button onClick={()=>setAnchor(getMondayOf(today))} style={{padding:"5px 10px",background:C.s1,border:`1px solid ${C.border}`,borderRadius:4,color:C.sec,cursor:"pointer",fontSize:11}}>Cette semaine</button>
        <button onClick={()=>{setPlan(genererProposition(weekDays));setValide(false);setSaved(false);}} style={{padding:"5px 12px",background:C.blue+"22",border:`1px solid ${C.blue}55`,borderRadius:4,color:C.blue,cursor:"pointer",fontSize:11,fontWeight:600}}>↺ Regénérer</button>
        <button onClick={handlePrint} style={{padding:"5px 12px",background:"#000",color:"#fff",border:"none",borderRadius:4,cursor:"pointer",fontSize:11,fontWeight:700}}>🖨️ Imprimer</button>
        <div style={{display:"flex",gap:6,marginLeft:"auto"}}>
          {!valide ? (
            <button onClick={()=>savePlan(true)} style={{padding:"6px 16px",background:C.green+"33",border:`1px solid ${C.green}`,borderRadius:5,color:C.green,cursor:"pointer",fontSize:12,fontWeight:700}}>✓ Valider la semaine</button>
          ) : (
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <span style={{fontSize:11,color:C.green,fontWeight:700}}>✓ Semaine validée</span>
              <button onClick={()=>{setValide(false);setSaved(false);}} style={{padding:"4px 10px",background:"none",border:`1px solid ${C.border}`,borderRadius:4,color:C.sec,cursor:"pointer",fontSize:10}}>Modifier</button>
            </div>
          )}
          {!saved && <button onClick={()=>savePlan(false)} style={{padding:"6px 12px",background:C.blue+"22",border:`1px solid ${C.blue}`,borderRadius:5,color:C.blue,cursor:"pointer",fontSize:11,fontWeight:600}}>Sauvegarder</button>}
        </div>
      </div>

      {!saved && (
        <div style={{marginBottom:10,padding:"6px 12px",background:C.yellow+"22",border:`1px solid ${C.yellow}44`,borderRadius:5,fontSize:11,color:C.yellow}}>
          📋 Proposition automatique — glissez-déposez les noms pour modifier, puis validez.
        </div>
      )}

      {/* Grid */}
      <div style={{overflowX:"auto",marginBottom:16}}>
        <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed"}}>
          <colgroup>
            <col style={{width:150}}/>
            {weekDays.map(d=><col key={d}/>)}
          </colgroup>
          <thead>
            <tr>
              <th style={{padding:"8px 10px",background:C.s2,border:`1px solid ${C.border}`,fontSize:10,color:C.sec,textAlign:"left"}}>POSTE</th>
              {weekDays.map((day,i)=>{
                const ferie=JOURS_FERIES[day]; const isToday=day===today;
                return (
                  <th key={day} style={{padding:"6px 8px",background:isToday?C.orange+"22":C.s2,border:`1px solid ${C.border}`,textAlign:"center",fontSize:11}}>
                    <div style={{fontWeight:700,color:isToday?C.orange:ferie?C.purple:C.text}}>{JOURS_FR[i]}</div>
                    <div style={{fontSize:9,color:C.sec,fontWeight:400}}>{new Date(day+"T00:00:00").toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"})}</div>
                    {ferie&&<div style={{fontSize:8,color:C.purple,marginTop:1}}>{ferie}</div>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {POSTES_RH.map(poste=>(
              <tr key={poste.id}>
                <td style={{padding:"8px 10px",background:C.s1,border:`1px solid ${C.border}`,verticalAlign:"middle"}}>
                  <div style={{fontSize:11,fontWeight:700,color:poste.c}}>{poste.label}</div>
                </td>
                {weekDays.map(day=>{
                  const isHoliday=!!JOURS_FERIES[day]||!isWorkday(day);
                  const ops=plan[day]?.[poste.id]||[];
                  const charge=chargeMap[day]?.[poste.id]||0;
                  const cap=ops.length*CAP_OP[poste.id];
                  const pct=cap>0?Math.min(100,Math.round(charge/cap*100)):0;
                  const isDragTarget=dragOver?.day===day&&dragOver?.poste===poste.id;

                  return (
                    <td key={day}
                      onDragOver={!valide&&!isHoliday ? handleDragOver(day,poste.id) : undefined}
                      onDragLeave={()=>setDragOver(null)}
                      onDrop={!valide&&!isHoliday ? handleDrop(day,poste.id) : undefined}
                      style={{
                        padding:"6px 8px",
                        background:isHoliday?C.s2+"88":isDragTarget?poste.c+"22":C.bg,
                        border:`1px solid ${isDragTarget?poste.c:C.border}`,
                        outline:isDragTarget?`2px solid ${poste.c}44`:"none",
                        verticalAlign:"top",
                        minWidth:120,
                        transition:"background 0.1s, border-color 0.1s",
                      }}>
                      {isHoliday ? (
                        <div style={{fontSize:9,color:C.purple,textAlign:"center",padding:"12px 0"}}>—</div>
                      ) : (
                        <>
                          {/* Operator badges */}
                          <div style={{display:"flex",flexWrap:"wrap",gap:3,marginBottom:ops.length>0?4:0}}>
                            {ops.map(opId=>{
                              const op=EQUIPE.find(e=>e.id===opId);
                              const col=OP_COLOR[opId]||C.sec;
                              return (
                                <span key={opId}
                                  draggable={!valide}
                                  onDragStart={!valide ? handleDragStart(opId,day,poste.id) : undefined}
                                  onDragEnd={handleDragEnd}
                                  style={{
                                    display:"inline-flex",alignItems:"center",gap:3,
                                    padding:"3px 7px",
                                    background:col+"28",border:`1px solid ${col}66`,borderRadius:4,
                                    fontSize:10,color:col,fontWeight:700,
                                    cursor:valide?"default":"grab",
                                    userSelect:"none",
                                    transition:"opacity 0.1s",
                                  }}>
                                  {op?.nom||opId}
                                  {!valide&&(
                                    <button onClick={()=>removeOp(day,poste.id,opId)}
                                      style={{background:"none",border:"none",color:col,cursor:"pointer",padding:"0 0 0 1px",fontSize:11,lineHeight:1,opacity:0.7}}>×</button>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                          {/* Charge bar */}
                          {charge>0&&(
                            <div style={{marginBottom:4}}>
                              <div style={{height:3,background:C.border,borderRadius:2,overflow:"hidden"}}>
                                <div style={{height:"100%",width:`${pct}%`,background:pct>90?C.red:pct>70?C.orange:C.green,borderRadius:2}}/>
                              </div>
                              <div style={{fontSize:7,color:pct>90?C.red:pct>70?C.orange:C.green,marginTop:1}} className="mono">
                                {hm(charge)}{cap>0?` / ${hm(cap)} (${pct}%)`:""}</div>
                            </div>
                          )}
                          {/* Drop hint when empty */}
                          {!valide&&ops.length===0&&(
                            <div style={{fontSize:9,color:isDragTarget?poste.c:C.muted,textAlign:"center",padding:"8px 0",border:`1px dashed ${isDragTarget?poste.c:C.border}`,borderRadius:3}}>
                              {isDragTarget?"↓ Déposer ici":"Glisser ici"}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Suggestions */}
      {suggestions.length>0&&(
        <Card style={{marginBottom:14}}>
          <div style={{fontSize:10,color:C.sec,fontWeight:700,marginBottom:8}}>SUGGESTIONS & ALERTES</div>
          {suggestions.map((s,i)=>(
            <div key={i} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"5px 0",borderBottom:`1px solid ${C.border}`}}>
              <span style={{fontSize:9,fontWeight:700,color:s.color,minWidth:40,paddingTop:1}}>
                {new Date(s.day+"T00:00:00").toLocaleDateString("fr-FR",{weekday:"short",day:"2-digit",month:"2-digit"})}
              </span>
              <span style={{fontSize:11,color:C.text}}>{s.msg}</span>
            </div>
          ))}
        </Card>
      )}

      {/* Bench — draggable from here to add to any cell */}
      {!valide&&(
        <Card>
          <div style={{fontSize:10,color:C.sec,fontWeight:700,marginBottom:6}}>
            ÉQUIPE — <span style={{fontWeight:400}}>glissez un nom vers une cellule pour l&apos;ajouter</span>
          </div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {EQUIPE.map(op=>{
              const col=OP_COLOR[op.id]||C.sec;
              return (
                <div key={op.id}
                  draggable
                  onDragStart={handleDragStart(op.id, null, null)}
                  onDragEnd={handleDragEnd}
                  style={{
                    padding:"4px 10px",background:col+"18",border:`1px solid ${col}44`,borderRadius:4,
                    fontSize:10,cursor:"grab",userSelect:"none",
                  }}>
                  <span style={{color:col,fontWeight:700}}>{op.nom}</span>
                  <span style={{color:C.muted,marginLeft:5,fontSize:9}}>{op.poste}</span>
                  {op.vendrediOff&&<span style={{color:C.orange,marginLeft:4,fontSize:8}}>📵</span>}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {valide&&(
        <Card>
          <div style={{fontSize:10,color:C.sec,fontWeight:700,marginBottom:6}}>ÉQUIPE</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {EQUIPE.map(op=>{
              const col=OP_COLOR[op.id]||C.sec;
              return (
                <div key={op.id} style={{padding:"4px 10px",background:col+"18",border:`1px solid ${col}44`,borderRadius:4,fontSize:10}}>
                  <span style={{color:col,fontWeight:700}}>{op.nom}</span>
                  <span style={{color:C.muted,marginLeft:5,fontSize:9}}>{op.poste}</span>
                  {op.vendrediOff&&<span style={{color:C.orange,marginLeft:4,fontSize:8}}>📵</span>}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
