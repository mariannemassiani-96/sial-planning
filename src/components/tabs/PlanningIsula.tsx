"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { calcCheminCritique, C, isWorkday, JOURS_FERIES, fmtDate, CommandeCC, TYPES_MENUISERIE, getWeekNum as getWeekNumUtil, toSemaineId as toSemaineIdUtil } from "@/lib/sial-data";
import { H, Card, Bdg } from "@/components/ui";
import { openPrintWindow, fmtDatePrint } from "@/lib/print-utils";

// ── Warm Edge helpers ─────────────────────────────────────────────────────────
function calcWeDim(dimMm: number): number {
  if (dimMm <= 1800) return dimMm - 30;
  if (dimMm <= 2000) return dimMm - 31;
  return dimMm - 32;
}
function calcPerimetre(lWe: number, hWe: number): number {
  return (lWe * 2) + (hWe * 2);
}

type WeLigne = {
  id: string;
  commandeId: string;
  num_commande: string;
  client: string;
  ref_chantier: string;
  composition: string;
  quantite: number;
  position: string;
  largeur_mm: number | null;
  hauteur_mm: number | null;
  epaisseur_intercalaire: string;
  coloris_intercalaire: string;
  largeur_we: number | null;
  hauteur_we: number | null;
  perimetre_we: number | null;
  date_fabrication: string;
};

type WeSaisieRow = {
  key: string;
  largeur: string;
  hauteur: string;
  epaisseur: string;
  coloris: string;
  quantite: string;
  composition: string;
  position: string;
};

function emptyWeSaisieRow(): WeSaisieRow {
  return { key: Math.random().toString(36).slice(2), largeur: "", hauteur: "", epaisseur: "16mm", coloris: "argent", quantite: "1", composition: "", position: "" };
}

function parseWecsv(text: string): WeSaisieRow[] {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(sep).map(h => h.toLowerCase().trim().replace(/['"]/g, ""));
  const idx = (keys: string[]) => keys.reduce((acc, k) => acc >= 0 ? acc : headers.indexOf(k), -1);
  const iL = idx(["largeur", "largeur_mm", "l (mm)", "l(mm)", "width"]);
  const iH = idx(["hauteur", "hauteur_mm", "h (mm)", "h(mm)", "height"]);
  const iE = idx(["epaisseur", "epaisseur_intercalaire", "ep", "thickness"]);
  const iC = idx(["coloris", "couleur", "coloris_intercalaire", "color", "couleur_intercalaire"]);
  const iQ = idx(["quantite", "qte", "qty", "quantity"]);
  const iP = idx(["position", "pos"]);
  const iCo = idx(["composition", "compo"]);
  return lines.slice(1).map(line => {
    const cols = line.split(sep).map(c => c.replace(/['"]/g, "").trim());
    return {
      key: Math.random().toString(36).slice(2),
      largeur:     iL >= 0 ? cols[iL] || "" : "",
      hauteur:     iH >= 0 ? cols[iH] || "" : "",
      epaisseur:   iE >= 0 ? cols[iE] || "16mm" : "16mm",
      coloris:     iC >= 0 ? cols[iC] || "argent" : "argent",
      quantite:    iQ >= 0 ? cols[iQ] || "1" : "1",
      position:    iP >= 0 ? cols[iP] || "" : "",
      composition: iCo >= 0 ? cols[iCo] || "" : "",
    };
  }).filter(r => r.largeur || r.hauteur);
}

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
const getWeekNum = getWeekNumUtil;
function semaineId(mondayStr: string): string {
  return toSemaineIdUtil(mondayStr);
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

  // ── Warm Edge state ──────────────────────────────────────────────────────────
  const [weTab,      setWeTab]      = useState<"saisie"|"of_cmd"|"of_semaine">("saisie");
  const [weLignes,   setWeLignes]   = useState<WeSaisieRow[]>([emptyWeSaisieRow()]);
  const [weClient,   setWeClient]   = useState("");
  const [weNumCmd,   setWeNumCmd]   = useState("");
  const [weChantier, setWeChantier] = useState("");
  const [weDateFab,  setWeDateFab]  = useState(today);
  const [weShowCsv,  setWeShowCsv]  = useState(false);
  const [weCsvText,  setWeCsvText]  = useState("");
  const [weCsvErr,   setWeCsvErr]   = useState("");

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

  // ── Warm Edge helpers ────────────────────────────────────────────────────────
  const weComputed = useMemo<(WeSaisieRow & { lWe: number|null; hWe: number|null; perim: number|null })[]>(() =>
    weLignes.map(r => {
      const l = parseFloat(r.largeur);
      const h = parseFloat(r.hauteur);
      const lWe = isNaN(l) || l <= 0 ? null : calcWeDim(l);
      const hWe = isNaN(h) || h <= 0 ? null : calcWeDim(h);
      const perim = lWe != null && hWe != null ? calcPerimetre(lWe, hWe) : null;
      return { ...r, lWe, hWe, perim };
    }), [weLignes]);

  // Summary grouped by coloris + epaisseur from saisie
  const weSummary = useMemo(() => {
    const map = new Map<string, { coloris: string; epaisseur: string; nbPieces: number; totalMl: number }>();
    weComputed.forEach(r => {
      if (r.perim == null) return;
      const key = `${r.coloris}||${r.epaisseur}`;
      const qte = parseInt(r.quantite) || 1;
      const ml = (r.perim * qte) / 1000;
      if (map.has(key)) {
        const ex = map.get(key)!;
        map.set(key, { ...ex, nbPieces: ex.nbPieces + qte, totalMl: ex.totalMl + ml });
      } else {
        map.set(key, { coloris: r.coloris, epaisseur: r.epaisseur, nbPieces: qte, totalMl: ml });
      }
    });
    return Array.from(map.values());
  }, [weComputed]);

  // Populate saisie from SIAL commandes vitrages with WE data
  const weCommandesVitrages = useMemo(() => {
    return commandes.flatMap(c => {
      const cmd = c as any;
      const vitrages: any[] = cmd.vitrages || [];
      return vitrages
        .filter(v => v.largeur && v.hauteur && v.fournisseur === "isula")
        .map(v => ({
          commandeId: String(c.id),
          num_commande: cmd.num_commande || "",
          client: c.client || "",
          ref_chantier: cmd.ref_chantier || "",
          composition: v.composition || "",
          quantite: parseInt(v.quantite) || 1,
          position: v.position || "",
          largeur_mm: parseFloat(v.largeur) || null,
          hauteur_mm: parseFloat(v.hauteur) || null,
          epaisseur_intercalaire: v.epaisseur_intercalaire || "",
          coloris_intercalaire: v.couleur_intercalaire || v.coloris_intercalaire || "",
        }));
    });
  }, [commandes]);

  // Print OF
  const handlePrintOF = (lignesOf: WeLigne[], titre: string) => {
    if (lignesOf.length === 0) { alert("Aucune ligne à imprimer."); return; }

    const detailRows = lignesOf.map(l => {
      const perimM = l.perimetre_we != null ? (l.perimetre_we / 1000).toFixed(3) : "—";
      const totalM = l.perimetre_we != null ? ((l.perimetre_we * l.quantite) / 1000).toFixed(3) : "—";
      return `<tr>
        <td class="mono center">${l.num_commande || "—"}</td>
        <td><b>${l.client || "—"}</b>${l.ref_chantier ? `<br/><span style="font-size:9px;color:#555">${l.ref_chantier}</span>` : ""}</td>
        <td class="center">${l.position || "—"}</td>
        <td class="center">${l.composition || "—"}</td>
        <td class="mono center">${l.largeur_we != null ? l.largeur_we : "—"}</td>
        <td class="mono center">${l.hauteur_we != null ? l.hauteur_we : "—"}</td>
        <td class="center">${l.epaisseur_intercalaire || "—"}</td>
        <td class="center">${l.coloris_intercalaire || "—"}</td>
        <td class="mono center">${l.quantite}</td>
        <td class="mono center">${perimM} m</td>
        <td class="mono center" style="font-weight:700">${totalM} m</td>
      </tr>`;
    }).join("");

    // Groupement par coloris + épaisseur
    const groupMap = new Map<string, { coloris: string; epaisseur: string; nbPieces: number; totalMl: number }>();
    lignesOf.forEach(l => {
      const key = `${l.coloris_intercalaire}||${l.epaisseur_intercalaire}`;
      const ml = l.perimetre_we != null ? (l.perimetre_we * l.quantite) / 1000 : 0;
      if (groupMap.has(key)) {
        const ex = groupMap.get(key)!;
        groupMap.set(key, { ...ex, nbPieces: ex.nbPieces + l.quantite, totalMl: ex.totalMl + ml });
      } else {
        groupMap.set(key, { coloris: l.coloris_intercalaire || "—", epaisseur: l.epaisseur_intercalaire || "—", nbPieces: l.quantite, totalMl: ml });
      }
    });
    const totalGlobalMl = Array.from(groupMap.values()).reduce((s, g) => s + g.totalMl, 0);
    const recapRows = Array.from(groupMap.values()).map(g => `<tr>
      <td style="font-weight:700">${g.coloris}</td>
      <td class="center">${g.epaisseur}</td>
      <td class="mono center" style="font-weight:700">${g.nbPieces}</td>
      <td class="mono center" style="font-weight:700;color:#166116">${g.totalMl.toFixed(3)} m</td>
    </tr>`).join("");

    const html = `
      <div class="header">
        <div class="header-left">
          <h1>SIAL &nbsp;|&nbsp; <span>ISULA Vitrage</span></h1>
          <div class="subtitle">OF Coupe Intercalaires Warm Edge — ${titre}</div>
        </div>
        <div class="header-right">
          <div>Date fabrication : <b>${fmtDatePrint(lignesOf[0]?.date_fabrication || "")}</b></div>
          <div>${lignesOf.length} ligne(s) · ${lignesOf.reduce((s,l)=>s+l.quantite,0)} pièce(s)</div>
          <div>Total : <b>${totalGlobalMl.toFixed(3)} ml</b></div>
        </div>
      </div>
      <h2>Détail par vitrage</h2>
      <table>
        <thead><tr>
          <th>N° Cmd</th><th>Client / Chantier</th><th>Pos.</th><th>Composition</th>
          <th>L WE (mm)</th><th>H WE (mm)</th><th>Épais.</th><th>Coloris</th>
          <th>Qté</th><th>Périm.</th><th>Total</th>
        </tr></thead>
        <tbody>${detailRows}</tbody>
      </table>
      <h2>Récapitulatif par coloris & épaisseur</h2>
      <table>
        <thead><tr><th>Coloris</th><th>Épaisseur</th><th>Nb pièces</th><th>Longueur totale (ml)</th></tr></thead>
        <tbody>${recapRows}
          <tr style="border-top:2px solid #000;background:#e8e8e8">
            <td colspan="2" style="font-weight:700">TOTAL</td>
            <td class="mono center" style="font-weight:700">${Array.from(groupMap.values()).reduce((s,g)=>s+g.nbPieces,0)}</td>
            <td class="mono center" style="font-weight:800;font-size:12px">${totalGlobalMl.toFixed(3)} m</td>
          </tr>
        </tbody>
      </table>`;
    openPrintWindow(`OF WE — ${titre}`, html);
  };

  // Print OF from saisie directe
  const handlePrintOfSaisie = () => {
    const dedupLignes: WeLigne[] = weComputed
      .filter(r => r.lWe != null && r.hWe != null)
      .map(r => ({
        id: r.key,
        commandeId: "",
        num_commande: weNumCmd,
        client: weClient,
        ref_chantier: weChantier,
        composition: r.composition,
        quantite: parseInt(r.quantite) || 1,
        position: r.position,
        largeur_mm: parseFloat(r.largeur) || null,
        hauteur_mm: parseFloat(r.hauteur) || null,
        epaisseur_intercalaire: r.epaisseur,
        coloris_intercalaire: r.coloris,
        largeur_we: r.lWe,
        hauteur_we: r.hWe,
        perimetre_we: r.perim,
        date_fabrication: weDateFab,
      }));
    handlePrintOF(dedupLignes, `${weClient || "saisie directe"} — ${fmtDatePrint(weDateFab)}`);
  };

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
                  <span style={{color:C.text,marginLeft:4}}>{d.client}{d.cmd.ref_chantier ? ` — ${d.cmd.ref_chantier}` : ""}</span>
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

      {/* ── Module Intercalaires Warm Edge ──────────────────────────────────── */}
      <div style={{marginTop:24}}>
        <H c={C.purple}>Intercalaires Warm Edge — Calcul &amp; OF</H>

        {/* Onglets */}
        <div style={{display:"flex",gap:6,marginBottom:14}}>
          {([["saisie","Saisie / Calcul"],[`of_cmd`,"OF par commande"],["of_semaine","OF semaine"]] as const).map(([id,lbl])=>(
            <button key={id} onClick={()=>setWeTab(id as any)}
              style={{padding:"5px 14px",borderRadius:4,border:`1px solid ${weTab===id?C.purple:C.border}`,background:weTab===id?C.purple+"33":"none",color:weTab===id?C.purple:C.sec,fontSize:11,fontWeight:700,cursor:"pointer"}}>
              {lbl}
            </button>
          ))}
        </div>

        {/* ── Tab Saisie ── */}
        {weTab === "saisie" && (
          <Card>
            <div style={{fontSize:10,color:C.sec,fontWeight:700,marginBottom:10}}>SAISIE DES VITRAGES</div>

            {/* Entête commande */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:10}}>
              <div><label style={{fontSize:9,color:C.orange,display:"block",marginBottom:2}}>N° COMMANDE</label><input style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,padding:"5px 8px",color:C.text,fontSize:11,width:"100%",outline:"none"}} value={weNumCmd} onChange={e=>setWeNumCmd(e.target.value)} placeholder="ex: O_2026-047" /></div>
              <div><label style={{fontSize:9,color:C.sec,display:"block",marginBottom:2}}>CLIENT</label><input style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,padding:"5px 8px",color:C.text,fontSize:11,width:"100%",outline:"none"}} value={weClient} onChange={e=>setWeClient(e.target.value)} placeholder="Nom client" /></div>
              <div><label style={{fontSize:9,color:C.teal,display:"block",marginBottom:2}}>CHANTIER</label><input style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,padding:"5px 8px",color:C.text,fontSize:11,width:"100%",outline:"none"}} value={weChantier} onChange={e=>setWeChantier(e.target.value)} placeholder="Réf. chantier" /></div>
              <div><label style={{fontSize:9,color:C.blue,display:"block",marginBottom:2}}>DATE FABRICATION</label><input type="date" style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,padding:"5px 8px",color:C.text,fontSize:11,width:"100%",outline:"none"}} value={weDateFab} onChange={e=>setWeDateFab(e.target.value)} /></div>
            </div>

            {/* Import CSV */}
            <div style={{marginBottom:10}}>
              <button onClick={()=>{setWeShowCsv(p=>!p);setWeCsvErr("");}}
                style={{padding:"4px 12px",background:weShowCsv?C.cyan+"33":"none",border:`1px solid ${weShowCsv?C.cyan:C.border}`,borderRadius:4,color:weShowCsv?C.cyan:C.sec,fontSize:10,fontWeight:700,cursor:"pointer",marginBottom:weShowCsv?8:0}}>
                📥 Import CSV / Excel exporté Pro F2
              </button>
              {weShowCsv && (
                <div style={{padding:10,background:C.s2,borderRadius:5,border:`1px solid ${C.cyan}33`}}>
                  <div style={{fontSize:10,color:C.sec,marginBottom:6}}>Colonnes attendues : largeur, hauteur, epaisseur, coloris, quantite, position, composition (séparateur ; ou ,)</div>
                  <textarea value={weCsvText} onChange={e=>{setWeCsvText(e.target.value);setWeCsvErr("");}}
                    placeholder="Collez le contenu CSV ici…"
                    style={{width:"100%",boxSizing:"border-box",minHeight:80,padding:"6px 8px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontSize:11,resize:"vertical",outline:"none"}}/>
                  <div style={{display:"flex",gap:8,marginTop:6,alignItems:"center"}}>
                    <button onClick={()=>{
                      const rows=parseWecsv(weCsvText);
                      if(rows.length===0){setWeCsvErr("Aucune ligne valide trouvée.");return;}
                      setWeLignes(rows);setWeShowCsv(false);setWeCsvText("");setWeCsvErr("");
                    }} style={{padding:"4px 14px",background:C.cyan+"33",border:`1px solid ${C.cyan}`,borderRadius:4,color:C.cyan,fontSize:11,fontWeight:700,cursor:"pointer"}}>
                      Importer
                    </button>
                    {weCsvErr && <span style={{fontSize:10,color:C.red}}>{weCsvErr}</span>}
                  </div>
                </div>
              )}
            </div>

            {/* Pré-remplir depuis SIAL commandes */}
            {weCommandesVitrages.length > 0 && (
              <div style={{marginBottom:10,padding:"8px 12px",background:C.s1,borderRadius:5,border:`1px solid ${C.border}`}}>
                <div style={{fontSize:10,color:C.teal,fontWeight:700,marginBottom:6}}>VITRAGES ISULA DEPUIS COMMANDES SIAL</div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  {commandes.filter(c=>{
                    const cmd=c as any;
                    return (cmd.vitrages||[]).some((v:any)=>v.largeur&&v.hauteur&&v.fournisseur==="isula");
                  }).slice(0,20).map(c=>{
                    const cmd=c as any;
                    const nbVit=(cmd.vitrages||[]).filter((v:any)=>v.largeur&&v.hauteur&&v.fournisseur==="isula").length;
                    return (
                      <button key={String(c.id)} onClick={()=>{
                        const rows=(cmd.vitrages||[]).filter((v:any)=>v.largeur&&v.hauteur&&v.fournisseur==="isula").map((v:any)=>({
                          key:Math.random().toString(36).slice(2),
                          largeur:v.largeur||"",hauteur:v.hauteur||"",
                          epaisseur:v.epaisseur_intercalaire||"16mm",
                          coloris:v.couleur_intercalaire||v.coloris_intercalaire||"argent",
                          quantite:String(v.quantite||"1"),
                          composition:v.composition||"",position:v.position||"",
                        }));
                        setWeLignes(rows.length>0?rows:[emptyWeSaisieRow()]);
                        setWeNumCmd(cmd.num_commande||"");
                        setWeClient(c.client||"");
                        setWeChantier(cmd.ref_chantier||"");
                      }} style={{padding:"3px 10px",background:C.teal+"18",border:`1px solid ${C.teal}44`,borderRadius:4,fontSize:9,color:C.teal,cursor:"pointer"}}>
                        {cmd.num_commande||c.client} ({nbVit} vit.)
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tableau saisie */}
            <div style={{overflowX:"auto",marginBottom:10}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead>
                  <tr style={{background:C.s2}}>
                    {["Pos.","Composition","L vitrage (mm)","H vitrage (mm)","L WE (mm)","H WE (mm)","Épais.","Coloris","Qté","Périm. (mm)","Total ml",""].map(h=>(
                      <th key={h} style={{padding:"4px 6px",border:`1px solid ${C.border}`,fontSize:9,color:C.sec,textAlign:"center",whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weComputed.map((r,i)=>(
                    <tr key={r.key} style={{borderBottom:`1px solid ${C.border}22`}}>
                      <td style={{padding:"3px 4px",border:`1px solid ${C.border}`}}>
                        <input style={{width:40,background:C.bg,border:"none",color:C.orange,fontSize:10,padding:"2px 3px",outline:"none"}} value={r.position} onChange={e=>setWeLignes(p=>{const n=[...p];n[i]={...n[i],position:e.target.value};return n;})} placeholder="A1"/>
                      </td>
                      <td style={{padding:"3px 4px",border:`1px solid ${C.border}`}}>
                        <input style={{width:80,background:C.bg,border:"none",color:C.text,fontSize:10,padding:"2px 3px",outline:"none"}} value={r.composition} onChange={e=>setWeLignes(p=>{const n=[...p];n[i]={...n[i],composition:e.target.value};return n;})} placeholder="4/16/4"/>
                      </td>
                      <td style={{padding:"3px 4px",border:`1px solid ${C.border}`}}>
                        <input type="number" style={{width:65,background:C.bg,border:"none",color:C.purple,fontWeight:700,fontSize:11,padding:"2px 3px",outline:"none",textAlign:"right"}} value={r.largeur} onChange={e=>setWeLignes(p=>{const n=[...p];n[i]={...n[i],largeur:e.target.value};return n;})} placeholder="1200"/>
                      </td>
                      <td style={{padding:"3px 4px",border:`1px solid ${C.border}`}}>
                        <input type="number" style={{width:65,background:C.bg,border:"none",color:C.purple,fontWeight:700,fontSize:11,padding:"2px 3px",outline:"none",textAlign:"right"}} value={r.hauteur} onChange={e=>setWeLignes(p=>{const n=[...p];n[i]={...n[i],hauteur:e.target.value};return n;})} placeholder="1400"/>
                      </td>
                      <td style={{padding:"3px 6px",border:`1px solid ${C.border}`,textAlign:"right",color:C.teal,fontWeight:700,background:C.teal+"0A",fontFamily:"monospace"}}>{r.lWe ?? "—"}</td>
                      <td style={{padding:"3px 6px",border:`1px solid ${C.border}`,textAlign:"right",color:C.teal,fontWeight:700,background:C.teal+"0A",fontFamily:"monospace"}}>{r.hWe ?? "—"}</td>
                      <td style={{padding:"3px 4px",border:`1px solid ${C.border}`}}>
                        <input list={`ep-list-${i}`} style={{width:55,background:C.bg,border:"none",color:C.cyan,fontSize:10,padding:"2px 3px",outline:"none"}} value={r.epaisseur} onChange={e=>setWeLignes(p=>{const n=[...p];n[i]={...n[i],epaisseur:e.target.value};return n;})}/>
                        <datalist id={`ep-list-${i}`}><option value="12mm"/><option value="14mm"/><option value="16mm"/><option value="18mm"/><option value="20mm"/></datalist>
                      </td>
                      <td style={{padding:"3px 4px",border:`1px solid ${C.border}`}}>
                        <input list={`col-list-${i}`} style={{width:65,background:C.bg,border:"none",color:C.sec,fontSize:10,padding:"2px 3px",outline:"none"}} value={r.coloris} onChange={e=>setWeLignes(p=>{const n=[...p];n[i]={...n[i],coloris:e.target.value};return n;})}/>
                        <datalist id={`col-list-${i}`}><option value="argent"/><option value="noir"/><option value="bronze"/><option value="blanc"/><option value="gris"/></datalist>
                      </td>
                      <td style={{padding:"3px 4px",border:`1px solid ${C.border}`}}>
                        <input type="number" min={1} style={{width:40,background:C.bg,border:"none",color:C.blue,fontWeight:700,fontSize:11,padding:"2px 3px",outline:"none",textAlign:"center"}} value={r.quantite} onChange={e=>setWeLignes(p=>{const n=[...p];n[i]={...n[i],quantite:e.target.value};return n;})}/>
                      </td>
                      <td style={{padding:"3px 6px",border:`1px solid ${C.border}`,textAlign:"right",color:r.perim!=null?C.green:C.muted,fontFamily:"monospace"}}>{r.perim != null ? r.perim : "—"}</td>
                      <td style={{padding:"3px 6px",border:`1px solid ${C.border}`,textAlign:"right",color:r.perim!=null?C.green:C.muted,fontWeight:700,fontFamily:"monospace"}}>
                        {r.perim != null ? ((r.perim*(parseInt(r.quantite)||1))/1000).toFixed(3) : "—"}
                      </td>
                      <td style={{padding:"3px 4px",border:`1px solid ${C.border}`,textAlign:"center"}}>
                        <button onClick={()=>setWeLignes(p=>p.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:C.sec,cursor:"pointer",fontSize:13,padding:0}}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:14}}>
              <button onClick={()=>setWeLignes(p=>[...p,emptyWeSaisieRow()])}
                style={{padding:"4px 12px",background:C.purple+"22",border:`1px solid ${C.purple}`,borderRadius:4,color:C.purple,fontSize:10,fontWeight:700,cursor:"pointer"}}>
                + Ajouter ligne
              </button>
              <button onClick={()=>setWeLignes([emptyWeSaisieRow()])}
                style={{padding:"4px 10px",background:"none",border:`1px solid ${C.border}`,borderRadius:4,color:C.sec,fontSize:10,cursor:"pointer"}}>
                Tout effacer
              </button>
            </div>

            {/* Récapitulatif saisie */}
            {weSummary.length > 0 && (
              <div style={{marginBottom:10,padding:"8px 12px",background:C.s1,borderRadius:5,border:`1px solid ${C.purple}33`}}>
                <div style={{fontSize:10,fontWeight:700,color:C.purple,marginBottom:8}}>RÉCAPITULATIF PAR COLORIS & ÉPAISSEUR</div>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
                  <thead>
                    <tr style={{background:C.s2}}>
                      {["Coloris","Épaisseur","Nb pièces","Total (ml)"].map(h=><th key={h} style={{padding:"4px 8px",border:`1px solid ${C.border}`,fontSize:9,color:C.sec,textAlign:"center"}}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {weSummary.map((g,i)=>(
                      <tr key={i}>
                        <td style={{padding:"3px 8px",border:`1px solid ${C.border}`,fontWeight:700,color:C.text}}>{g.coloris||"—"}</td>
                        <td style={{padding:"3px 8px",border:`1px solid ${C.border}`,textAlign:"center",color:C.cyan}}>{g.epaisseur||"—"}</td>
                        <td style={{padding:"3px 8px",border:`1px solid ${C.border}`,textAlign:"center",fontWeight:700,color:C.blue,fontFamily:"monospace"}}>{g.nbPieces}</td>
                        <td style={{padding:"3px 8px",border:`1px solid ${C.border}`,textAlign:"right",fontWeight:700,color:C.green,fontFamily:"monospace"}}>{g.totalMl.toFixed(3)} m</td>
                      </tr>
                    ))}
                    <tr style={{background:C.s2,borderTop:`2px solid ${C.border}`}}>
                      <td colSpan={2} style={{padding:"4px 8px",fontWeight:700,color:C.text,border:`1px solid ${C.border}`}}>TOTAL</td>
                      <td style={{padding:"4px 8px",textAlign:"center",fontWeight:700,color:C.blue,fontFamily:"monospace",border:`1px solid ${C.border}`}}>{weSummary.reduce((s,g)=>s+g.nbPieces,0)}</td>
                      <td style={{padding:"4px 8px",textAlign:"right",fontWeight:800,color:C.green,fontFamily:"monospace",border:`1px solid ${C.border}`}}>{weSummary.reduce((s,g)=>s+g.totalMl,0).toFixed(3)} m</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            <div style={{display:"flex",gap:8}}>
              <button onClick={handlePrintOfSaisie}
                style={{padding:"6px 18px",background:"#000",color:"#fff",border:"none",borderRadius:4,cursor:"pointer",fontSize:11,fontWeight:700}}>
                🖨️ Imprimer OF
              </button>
            </div>
          </Card>
        )}

        {/* ── Tab OF par commande ── */}
        {weTab === "of_cmd" && (
          <Card>
            <div style={{fontSize:10,color:C.sec,fontWeight:700,marginBottom:10}}>GÉNÉRER L&apos;OF PAR COMMANDE</div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:10}}>
              {commandes.filter(c=>{
                const cmd=c as any;
                return (cmd.vitrages||[]).some((v:any)=>v.largeur&&v.hauteur&&v.fournisseur==="isula");
              }).map(c=>{
                const cmd=c as any;
                const nbVit=(cmd.vitrages||[]).filter((v:any)=>v.largeur&&v.hauteur&&v.fournisseur==="isula").length;
                return (
                  <button key={String(c.id)} onClick={()=>{
                    // Compute WE from vitrages JSON
                    const lv: WeLigne[]=(cmd.vitrages||[]).filter((v:any)=>v.largeur&&v.hauteur&&v.fournisseur==="isula").map((v:any,idx:number)=>{
                      const lMm=parseFloat(v.largeur)||0;
                      const hMm=parseFloat(v.hauteur)||0;
                      const lWe=lMm>0?calcWeDim(lMm):null;
                      const hWe=hMm>0?calcWeDim(hMm):null;
                      const perim=lWe!=null&&hWe!=null?calcPerimetre(lWe,hWe):null;
                      return {
                        id:String(idx),commandeId:String(c.id),num_commande:cmd.num_commande||"",
                        client:c.client||"",ref_chantier:cmd.ref_chantier||"",
                        composition:v.composition||"",quantite:parseInt(v.quantite)||1,
                        position:v.position||"",largeur_mm:lMm,hauteur_mm:hMm,
                        epaisseur_intercalaire:v.epaisseur_intercalaire||"",
                        coloris_intercalaire:v.couleur_intercalaire||v.coloris_intercalaire||"",
                        largeur_we:lWe,hauteur_we:hWe,perimetre_we:perim,
                        date_fabrication:today,
                      };
                    });
                    handlePrintOF(lv,`${cmd.num_commande||c.client} — ${c.client||""}`);
                  }}
                  style={{padding:"5px 12px",background:C.teal+"18",border:`1px solid ${C.teal}44`,borderRadius:4,fontSize:10,color:C.teal,cursor:"pointer",fontWeight:700}}>
                    {cmd.num_commande||"—"} · {c.client} ({nbVit} vit.)
                  </button>
                );
              })}
            </div>
            {commandes.filter(c=>{const cmd=c as any;return(cmd.vitrages||[]).some((v:any)=>v.largeur&&v.hauteur&&v.fournisseur==="isula");}).length===0 && (
              <div style={{fontSize:11,color:C.muted,padding:12,textAlign:"center"}}>Aucune commande avec vitrages ISULA (dimensions renseignées) dans le carnet.</div>
            )}
          </Card>
        )}

        {/* ── Tab OF Semaine ── */}
        {weTab === "of_semaine" && (
          <Card>
            <div style={{fontSize:10,color:C.sec,fontWeight:700,marginBottom:10}}>
              OF SEMAINE — {getWeekNum(anchor)} · {new Date(anchor+"T00:00:00").toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"})} → {new Date(weekDays[4]+"T00:00:00").toLocaleDateString("fr-FR",{day:"2-digit",month:"short"})}
            </div>
            {(() => {
              // All commandes with vitrages ISULA + WE data for the week (date_livraison in week)
              const semanLignes: WeLigne[] = commandes.flatMap(c=>{
                const cmd=c as any;
                if(!cmd.date_livraison_souhaitee) return [];
                const livDate=cmd.date_livraison_souhaitee||"";
                if(livDate<weekDays[0]||livDate>weekDays[4]) return [];
                return (cmd.vitrages||[]).filter((v:any)=>v.largeur&&v.hauteur&&v.fournisseur==="isula").map((v:any,idx:number)=>{
                  const lMm=parseFloat(v.largeur)||0;
                  const hMm=parseFloat(v.hauteur)||0;
                  const lWe=lMm>0?calcWeDim(lMm):null;
                  const hWe=hMm>0?calcWeDim(hMm):null;
                  const perim=lWe!=null&&hWe!=null?calcPerimetre(lWe,hWe):null;
                  return {
                    id:String(c.id)+idx,commandeId:String(c.id),num_commande:cmd.num_commande||"",
                    client:c.client||"",ref_chantier:cmd.ref_chantier||"",
                    composition:v.composition||"",quantite:parseInt(v.quantite)||1,
                    position:v.position||"",largeur_mm:lMm,hauteur_mm:hMm,
                    epaisseur_intercalaire:v.epaisseur_intercalaire||"",
                    coloris_intercalaire:v.couleur_intercalaire||v.coloris_intercalaire||"",
                    largeur_we:lWe,hauteur_we:hWe,perimetre_we:perim,
                    date_fabrication:weekDays[0],
                  };
                });
              });
              if(semanLignes.length===0) return <div style={{fontSize:11,color:C.muted,padding:12,textAlign:"center"}}>Aucun vitrage ISULA avec dimensions cette semaine.</div>;
              return (
                <div>
                  <div style={{marginBottom:10,fontSize:11,color:C.sec}}>
                    {semanLignes.length} ligne(s) · {semanLignes.reduce((s,l)=>s+l.quantite,0)} pièce(s) au total
                  </div>
                  <button onClick={()=>handlePrintOF(semanLignes,`Semaine ${getWeekNum(anchor)}`)}
                    style={{padding:"6px 18px",background:"#000",color:"#fff",border:"none",borderRadius:4,cursor:"pointer",fontSize:11,fontWeight:700}}>
                    🖨️ Imprimer OF Semaine {getWeekNum(anchor)}
                  </button>
                </div>
              );
            })()}
          </Card>
        )}
      </div>
    </div>
  );
}
