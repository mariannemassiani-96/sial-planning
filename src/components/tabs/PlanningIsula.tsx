"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { calcCheminCritique, C, isWorkday, JOURS_FERIES, fmtDate, CommandeCC, TYPES_MENUISERIE } from "@/lib/sial-data";
import { H, Card, Bdg } from "@/components/ui";
import { openPrintWindow, fmtDatePrint } from "@/lib/print-utils";

// ── Postes ISULA ──────────────────────────────────────────────────────────────
const ISULA_POSTES = [
  { id:"debit",      label:"Débit verre",          c:"#4DB6AC", defaultOps:["bruno"] },
  { id:"assemblage", label:"Assemblage DV",         c:"#26C6DA", defaultOps:["momo","ali"] },
  { id:"finition",   label:"Retouche / Finition",  c:"#80DEEA", defaultOps:["bruno","ali"] },
  { id:"palette",    label:"Palette / Expédition", c:"#4DB6AC", defaultOps:["momo"] },
] as const;

const ISULA_OPS_COLOR: Record<string,string> = {
  bruno:"#4DB6AC", momo:"#26C6DA", ali:"#80DEEA",
};
const ISULA_EQUIPE = [
  { id:"bruno", nom:"Bruno", poste:"Débit / Finition" },
  { id:"momo",  nom:"Momo",  poste:"Assemblage / Expé." },
  { id:"ali",   nom:"Ali",   poste:"Assemblage" },
];
type DayPlan  = Record<string, string[]>;
type WeekPlan = Record<string, DayPlan>;
type DragInfo = { opId: string; fromDay: string|null; fromPoste: string|null };

// ── Date helpers ──────────────────────────────────────────────────────────────
function localStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function addDays(s: string, n: number): string {
  const d = new Date(s+"T00:00:00"); d.setDate(d.getDate()+n); return localStr(d);
}
function getMondayOf(s: string): string {
  const d = new Date(s+"T00:00:00"); const day = d.getDay();
  d.setDate(d.getDate()-(day===0?6:day-1)); return localStr(d);
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

function genProposition(weekDays: string[]): WeekPlan {
  const plan: WeekPlan = {};
  weekDays.forEach(day => {
    const isFriday = new Date(day+"T00:00:00").getDay()===5;
    plan[day] = {};
    ISULA_POSTES.forEach(poste => {
      plan[day][poste.id] = isFriday
        ? [...poste.defaultOps].filter(id => id !== "ali") // Ali vendredi off exemple
        : [...poste.defaultOps];
    });
  });
  return plan;
}

// ── Composant ─────────────────────────────────────────────────────────────────
export default function PlanningIsula({ commandes }: { commandes: CommandeCC[] }) {
  const today = localStr(new Date());
  const [anchor,   setAnchor]   = useState(getMondayOf(today));
  const [plan,     setPlan]     = useState<WeekPlan>({});
  const [valide,   setValide]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [dragOver, setDragOver] = useState<{day:string;poste:string}|null>(null);
  const dragRef = useRef<DragInfo|null>(null);

  const weekDays = useMemo(() => Array.from({length:5},(_,i)=>addDays(anchor,i)), [anchor]);
  const semaine  = useMemo(() => semaineId(anchor), [anchor]);

  // ── Load ────────────────────────────────────────────────────────────────────
  const loadPlan = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/planning-isula?semaine=${encodeURIComponent(semaine)}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.plan) { setPlan(data.plan); setValide(data.valide); setSaved(true); setLoading(false); return; }
      }
    } catch {}
    setPlan(genProposition(weekDays));
    setValide(false); setSaved(false); setLoading(false);
  }, [semaine, weekDays]);

  useEffect(() => { loadPlan(); }, [loadPlan]);

  const savePlan = async (v: boolean) => {
    await fetch("/api/planning-isula", { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({semaine,plan,valide:v}) });
    setValide(v); setSaved(true);
  };

  // ── Drag & Drop ─────────────────────────────────────────────────────────────
  const handleDragStart = (opId: string, fromDay: string|null, fromPoste: string|null) => (e: React.DragEvent) => {
    dragRef.current = { opId, fromDay, fromPoste };
    e.dataTransfer.effectAllowed = fromDay ? "move" : "copy";
  };
  const handleDragOver = (day: string, poste: string) => (e: React.DragEvent) => {
    e.preventDefault(); setDragOver({day, poste});
  };
  const handleDrop = (day: string, poste: string) => (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(null);
    const drag = dragRef.current; if (!drag) return;
    const { opId, fromDay, fromPoste } = drag;
    if (fromDay===day && fromPoste===poste) { dragRef.current=null; return; }
    if ((plan[day]?.[poste]||[]).includes(opId)) { dragRef.current=null; return; }
    setPlan(p => {
      let next = {...p};
      if (fromDay && fromPoste)
        next = {...next,[fromDay]:{...next[fromDay],[fromPoste]:(next[fromDay]?.[fromPoste]||[]).filter(x=>x!==opId)}};
      next = {...next,[day]:{...next[day],[poste]:[...(next[day]?.[poste]||[]),opId]}};
      return next;
    });
    setSaved(false); dragRef.current = null;
  };
  const handleDragEnd = () => { dragRef.current=null; setDragOver(null); };
  const removeOp = (day: string, poste: string, opId: string) => {
    setPlan(p=>({...p,[day]:{...p[day],[poste]:(p[day]?.[poste]||[]).filter(x=>x!==opId)}}));
    setSaved(false);
  };

  // ── Vitrage demand from SIAL commandes ───────────────────────────────────────
  const demandes = useMemo(() => {
    return commandes.flatMap(c => {
      const cc = calcCheminCritique(c);
      const cmd = c as any;
      if (!cc || !cc.dateCmdVitrage || cmd.aucun_vitrage) return [];
      const vitrages = cmd.vitrages || [];
      const m2 = Math.round(vitrages.reduce((s: number, v: any) =>
        s + (parseFloat(v.surface_m2)||0) * (parseInt(v.quantite)||1), 0) * 100) / 100;
      const nb = vitrages.reduce((s: number, v: any) => s + (parseInt(v.quantite)||1), 0);
      if (m2 === 0 && nb === 0) return [];
      return [{ cmd, client:c.client, dateCmdVit: cc.dateCmdVitrage as string, m2, nb, retard:!!cc.enRetard }];
    }).sort((a,b) => a.dateCmdVit.localeCompare(b.dateCmdVit));
  }, [commandes]);

  // Demandes cette semaine
  const demandesSemaine = useMemo(() =>
    demandes.filter(d => d.dateCmdVit >= weekDays[0] && d.dateCmdVit <= weekDays[4]),
    [demandes, weekDays]);

  // Prochaines demandes (4 semaines)
  const demandesProchaines = useMemo(() => {
    const endFuture = addDays(weekDays[4], 28);
    return demandes.filter(d => d.dateCmdVit > weekDays[4] && d.dateCmdVit <= endFuture);
  }, [demandes, weekDays]);

  const totalM2Sem = demandesSemaine.reduce((s,d) => s+d.m2, 0);
  const totalNbSem = demandesSemaine.reduce((s,d) => s+d.nb, 0);

  // ── Print ────────────────────────────────────────────────────────────────────
  const handlePrint = () => {
    const semLabel = `Semaine ${getWeekNum(anchor)} — ${new Date(anchor+"T00:00:00").toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"})}`;
    const JOURS_FR = ["Lun","Mar","Mer","Jeu","Ven"];
    const header = `<div class="header">
      <div class="header-left"><h1>ISULA Vitrage &nbsp;|&nbsp; Planning Hebdomadaire</h1><div class="subtitle">${semLabel}</div></div>
      <div class="header-right"><div>${demandesSemaine.length} commande(s) vitrage</div><div>${Math.round(totalM2Sem*100)/100} m² · ${totalNbSem} panneaux</div></div>
    </div>`;
    const demHtml = demandesSemaine.length > 0 ? `
      <h2>Demandes vitrage de la semaine</h2>
      <table><thead><tr><th>Client</th><th>Type</th><th>Date besoin</th><th>m²</th><th>Panneaux</th><th>État</th></tr></thead>
      <tbody>${demandesSemaine.map(d=>`<tr>
        <td><b>${d.client}</b>${d.cmd.ref_chantier?` — ${d.cmd.ref_chantier}`:""}</td>
        <td>${TYPES_MENUISERIE[d.cmd.type]?.label||d.cmd.type}</td>
        <td class="mono center">${fmtDatePrint(d.dateCmdVit)}</td>
        <td class="mono center">${d.m2}</td>
        <td class="mono center">${d.nb}</td>
        <td class="center"><span class="${d.retard?"warn":"ok"}">${d.retard?"Retard":"OK"}</span></td>
      </tr>`).join("")}</tbody></table>` : "";
    const thDays = weekDays.map((day,i)=>`<th style="text-align:center">${JOURS_FR[i]}<br/><span style="font-weight:400;font-size:9px">${new Date(day+"T00:00:00").toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"})}</span></th>`).join("");
    const gridRows = ISULA_POSTES.map(poste=>{
      const cells = weekDays.map(day=>{
        if(!!JOURS_FERIES[day]||!isWorkday(day)) return `<td style="background:#f0f0f0;text-align:center">—</td>`;
        const ops=(plan[day]?.[poste.id]||[]).map(id=>ISULA_EQUIPE.find(e=>e.id===id)?.nom||id).join(", ");
        return `<td>${ops||"<span style='color:#bbb'>—</span>"}</td>`;
      }).join("");
      return `<tr><td style="font-weight:700;color:${poste.c}">${poste.label}</td>${cells}</tr>`;
    }).join("");
    const gridHtml = `<h2>Affectations équipe</h2><table><thead><tr><th>Poste</th>${thDays}</tr></thead><tbody>${gridRows}</tbody></table>`;
    openPrintWindow(`ISULA Vitrage — ${semLabel}`, header+demHtml+gridHtml);
  };

  const JOURS_FR = ["Lun","Mar","Mer","Jeu","Ven"];

  if (loading) return <div style={{textAlign:"center",padding:60,color:C.sec}}>Chargement…</div>;

  return (
    <div>
      <H c={C.teal}>ISULA Vitrage — Planning</H>

      {/* Navigation */}
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <button onClick={()=>setAnchor(p=>addDays(getMondayOf(p),-7))} style={{padding:"5px 10px",background:C.s1,border:`1px solid ${C.border}`,borderRadius:4,color:C.sec,cursor:"pointer",fontSize:14}}>‹</button>
        <span style={{fontSize:13,fontWeight:700,color:C.text,minWidth:220,textAlign:"center"}}>
          Semaine {getWeekNum(anchor)} — {new Date(anchor+"T00:00:00").toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"})}
        </span>
        <button onClick={()=>setAnchor(p=>addDays(getMondayOf(p),7))} style={{padding:"5px 10px",background:C.s1,border:`1px solid ${C.border}`,borderRadius:4,color:C.sec,cursor:"pointer",fontSize:14}}>›</button>
        <button onClick={()=>setAnchor(getMondayOf(today))} style={{padding:"5px 10px",background:C.s1,border:`1px solid ${C.border}`,borderRadius:4,color:C.sec,cursor:"pointer",fontSize:11}}>Cette semaine</button>
        <button onClick={()=>{setPlan(genProposition(weekDays));setValide(false);setSaved(false);}} style={{padding:"5px 12px",background:C.teal+"22",border:`1px solid ${C.teal}55`,borderRadius:4,color:C.teal,cursor:"pointer",fontSize:11,fontWeight:600}}>↺ Regénérer</button>
        <button onClick={handlePrint} style={{padding:"5px 12px",background:"#000",color:"#fff",border:"none",borderRadius:4,cursor:"pointer",fontSize:11,fontWeight:700}}>🖨️ Imprimer</button>
        <div style={{display:"flex",gap:6,marginLeft:"auto"}}>
          {!valide ? (
            <button onClick={()=>savePlan(true)} style={{padding:"6px 16px",background:C.teal+"33",border:`1px solid ${C.teal}`,borderRadius:5,color:C.teal,cursor:"pointer",fontSize:12,fontWeight:700}}>✓ Valider la semaine</button>
          ) : (
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <span style={{fontSize:11,color:C.teal,fontWeight:700}}>✓ Semaine validée</span>
              <button onClick={()=>{setValide(false);setSaved(false);}} style={{padding:"4px 10px",background:"none",border:`1px solid ${C.border}`,borderRadius:4,color:C.sec,cursor:"pointer",fontSize:10}}>Modifier</button>
            </div>
          )}
          {!saved && <button onClick={()=>savePlan(false)} style={{padding:"6px 12px",background:C.blue+"22",border:`1px solid ${C.blue}`,borderRadius:5,color:C.blue,cursor:"pointer",fontSize:11,fontWeight:600}}>Sauvegarder</button>}
        </div>
      </div>

      {!saved && (
        <div style={{marginBottom:10,padding:"6px 12px",background:C.yellow+"22",border:`1px solid ${C.yellow}44`,borderRadius:5,fontSize:11,color:C.yellow}}>
          Proposition automatique — glissez-déposez les noms pour modifier, puis validez.
        </div>
      )}

      {/* Demandes vitrage SIAL → ISULA */}
      <div style={{marginBottom:16}}>
        <div style={{fontSize:11,fontWeight:700,color:C.teal,letterSpacing:".05em",marginBottom:8}}>
          DEMANDES VITRAGE SIAL → ISULA — CETTE SEMAINE
          {demandesSemaine.length > 0 && (
            <span style={{marginLeft:12,fontSize:10,color:C.sec,fontWeight:400}}>
              {Math.round(totalM2Sem*100)/100} m² · {totalNbSem} panneaux · {demandesSemaine.length} commande(s)
            </span>
          )}
        </div>

        {demandesSemaine.length === 0 ? (
          <div style={{padding:"12px 16px",background:C.s1,borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,color:C.sec}}>
            Aucune commande vitrage cette semaine.
          </div>
        ) : (
          <div style={{display:"grid",gap:6}}>
            {demandesSemaine.map((d, i) => {
              const tm = TYPES_MENUISERIE[d.cmd.type];
              const jRestant = Math.round((new Date(d.dateCmdVit).getTime()-Date.now())/86400000);
              const jc = jRestant < 0 ? C.red : jRestant < 3 ? C.orange : C.green;
              return (
                <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 12px",background:C.s1,borderRadius:6,border:`1px solid ${d.retard?C.red:C.border}`,borderLeft:`4px solid ${jc}`}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",marginBottom:2}}>
                      <span className="mono" style={{fontSize:10,color:C.orange,fontWeight:700}}>{d.cmd.num_commande||"—"}</span>
                      <span style={{fontSize:12,fontWeight:700,color:C.text}}>{d.client}</span>
                      {d.cmd.ref_chantier && <Bdg t={d.cmd.ref_chantier} c={C.teal} sz={9}/>}
                      {tm && <Bdg t={tm.label} c={C.teal} sz={9}/>}
                      {d.retard && <Bdg t="RETARD" c={C.red} sz={9}/>}
                    </div>
                    <div style={{fontSize:10,color:C.sec,display:"flex",gap:10}}>
                      <span>Besoin ISULA : <span className="mono" style={{color:C.teal,fontWeight:700}}>{fmtDate(d.dateCmdVit)}</span></span>
                      {d.m2 > 0 && <span style={{color:C.text}}><b>{d.m2}</b> m²</span>}
                      {d.nb > 0 && <span style={{color:C.text}}><b>{d.nb}</b> panneaux</span>}
                    </div>
                  </div>
                  <div className="mono" style={{fontSize:15,fontWeight:700,color:jc,flexShrink:0}}>
                    J{jRestant >= 0 ? `-${jRestant}` : `+${Math.abs(jRestant)}`}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Aperçu demandes prochaines */}
        {demandesProchaines.length > 0 && (
          <div style={{marginTop:10,padding:"8px 12px",background:C.s1,borderRadius:6,border:`1px solid ${C.border}`}}>
            <div style={{fontSize:10,fontWeight:700,color:C.sec,marginBottom:6}}>PROCHAINES DEMANDES (4 semaines)</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {demandesProchaines.map((d,i)=>(
                <div key={i} style={{padding:"3px 8px",background:C.teal+"18",border:`1px solid ${C.teal}33`,borderRadius:4,fontSize:9}}>
                  <span style={{color:C.orange,fontWeight:700}}>{d.cmd.num_commande||"—"}</span>
                  <span style={{color:C.text,marginLeft:4}}>{d.client}</span>
                  <span style={{color:C.teal,marginLeft:4}}>{fmtDate(d.dateCmdVit)}</span>
                  {d.m2>0&&<span style={{color:C.sec,marginLeft:4}}>{d.m2}m²</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Grille affectations */}
      <div style={{marginBottom:8,fontSize:11,fontWeight:700,color:C.teal,letterSpacing:".05em"}}>AFFECTATIONS ÉQUIPE ISULA</div>
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
                  <th key={day} style={{padding:"6px 8px",background:isToday?C.teal+"22":C.s2,border:`1px solid ${C.border}`,textAlign:"center",fontSize:11}}>
                    <div style={{fontWeight:700,color:isToday?C.teal:ferie?C.purple:C.text}}>{JOURS_FR[i]}</div>
                    <div style={{fontSize:9,color:C.sec,fontWeight:400}}>{new Date(day+"T00:00:00").toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"})}</div>
                    {ferie&&<div style={{fontSize:8,color:C.purple,marginTop:1}}>{ferie}</div>}
                    {/* Indicateur demandes ce jour */}
                    {demandes.filter(d=>d.dateCmdVit===day).length > 0 && (
                      <div style={{fontSize:8,color:C.teal,marginTop:1,fontWeight:700}}>
                        {demandes.filter(d=>d.dateCmdVit===day).length} vit.
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {ISULA_POSTES.map(poste=>(
              <tr key={poste.id}>
                <td style={{padding:"8px 10px",background:C.s1,border:`1px solid ${C.border}`,verticalAlign:"middle"}}>
                  <div style={{fontSize:11,fontWeight:700,color:poste.c}}>{poste.label}</div>
                </td>
                {weekDays.map(day=>{
                  const isHoliday=!!JOURS_FERIES[day]||!isWorkday(day);
                  const ops=plan[day]?.[poste.id]||[];
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
                        transition:"background 0.1s",
                      }}>
                      {isHoliday ? (
                        <div style={{fontSize:9,color:C.purple,textAlign:"center",padding:"12px 0"}}>—</div>
                      ) : (
                        <>
                          <div style={{display:"flex",flexWrap:"wrap",gap:3,marginBottom:ops.length>0?4:0}}>
                            {ops.map(opId=>{
                              const op=ISULA_EQUIPE.find(e=>e.id===opId);
                              const col=ISULA_OPS_COLOR[opId]||C.sec;
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
                                    cursor:valide?"default":"grab",userSelect:"none",
                                  }}>
                                  {op?.nom||opId}
                                  {!valide&&<button onClick={()=>removeOp(day,poste.id,opId)}
                                    style={{background:"none",border:"none",color:col,cursor:"pointer",padding:"0 0 0 1px",fontSize:11,lineHeight:1,opacity:0.7}}>×</button>}
                                </span>
                              );
                            })}
                          </div>
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

      {/* Bench */}
      <Card>
        <div style={{fontSize:10,color:C.sec,fontWeight:700,marginBottom:6}}>
          ÉQUIPE ISULA {!valide && <span style={{fontWeight:400}}>— glissez vers une cellule</span>}
        </div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {ISULA_EQUIPE.map(op=>{
            const col=ISULA_OPS_COLOR[op.id]||C.sec;
            return (
              <div key={op.id}
                draggable={!valide}
                onDragStart={!valide ? handleDragStart(op.id,null,null) : undefined}
                onDragEnd={handleDragEnd}
                style={{padding:"4px 10px",background:col+"18",border:`1px solid ${col}44`,borderRadius:4,fontSize:10,cursor:valide?"default":"grab",userSelect:"none"}}>
                <span style={{color:col,fontWeight:700}}>{op.nom}</span>
                <span style={{color:C.muted,marginLeft:5,fontSize:9}}>{op.poste}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
