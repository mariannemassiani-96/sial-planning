"use client";
import { useState, useEffect, useCallback } from "react";
import { C, JOURS_FERIES, isWorkday } from "@/lib/sial-data";
import { H, Card } from "@/components/ui";

// ── Checklists (config statique) ─────────────────────────────────────────────
const CHECKLISTS = [
  {
    id: "sial",
    label: "Atelier SIAL",
    color: C.orange,
    sections: [
      { id:"coupe", label:"Coupe / Soudure", items:[
        { id:"lames",    label:"Vérification lames de coupe" },
        { id:"angles",   label:"Contrôle angles (90° / 45°)" },
        { id:"machine",  label:"Nettoyage machine" },
        { id:"epi",      label:"EPI portés (lunettes, bouchons)" },
      ]},
      { id:"montage", label:"Montage Frappes", items:[
        { id:"jeux",      label:"Contrôle jeux / alignements" },
        { id:"ferrures",  label:"Vérif. ferrures et fixations" },
        { id:"ouverture", label:"Test ouverture / fermeture" },
        { id:"quincaill", label:"Vérif. quincaillerie" },
      ]},
      { id:"vitrage", label:"Vitrage Ouvrants", items:[
        { id:"etancheite", label:"Test étanchéité joints" },
        { id:"joint",      label:"Contrôle joint périphérique" },
        { id:"nettoyage",  label:"Nettoyage vitrages" },
      ]},
      { id:"global", label:"Global Atelier", items:[
        { id:"rangement",  label:"Rangement et propreté atelier" },
        { id:"palettes",   label:"Vérif. palettes / conditionnement" },
        { id:"etiquettes", label:"Contrôle étiquetage commandes" },
        { id:"incident",   label:"Aucun incident / accident signalé" },
      ]},
    ],
  },
  {
    id: "isula",
    label: "ISULA Vitrage",
    color: C.teal,
    sections: [
      { id:"debit", label:"Débit verre", items:[
        { id:"dim",     label:"Contrôle dimensions verre" },
        { id:"qualite", label:"Vérif. qualité (éclats, rayures)" },
        { id:"machine", label:"Nettoyage machine de débit" },
      ]},
      { id:"assemblage", label:"Assemblage Double Vitrage", items:[
        { id:"argon",       label:"Test étanchéité argon" },
        { id:"epaisseur",   label:"Contrôle épaisseur DV" },
        { id:"intercalaire",label:"Vérif. intercalaire" },
        { id:"faces",       label:"Propreté faces internes" },
      ]},
      { id:"expedition", label:"Expédition / Palette", items:[
        { id:"protection", label:"Vérif. protection vitrages" },
        { id:"etiquetage", label:"Contrôle étiquetage" },
        { id:"cales",      label:"Cales et conditionnement en place" },
      ]},
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function localStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function addDays(s: string, n: number): string {
  const d = new Date(s+"T00:00:00"); d.setDate(d.getDate()+n); return localStr(d);
}
function countChecked(data: Record<string,any>, atelierId: string) {
  let total = 0, done = 0;
  const atelier = CHECKLISTS.find(a => a.id === atelierId);
  if (!atelier) return { total:0, done:0 };
  atelier.sections.forEach(sec => {
    sec.items.forEach(item => {
      total++;
      if (data?.[atelierId]?.[sec.id]?.[item.id]) done++;
    });
  });
  return { total, done };
}

// ── Composant ─────────────────────────────────────────────────────────────────
export default function Qualite() {
  const today = localStr(new Date());
  const [date, setDate] = useState(today);
  const [data, setData] = useState<Record<string,any>>({});
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string|null>(null);

  const load = useCallback(async (d: string) => {
    try {
      const res = await fetch(`/api/controle-qualite?date=${d}`);
      if (res.ok) { const row = await res.json(); setData(row?.data || {}); }
    } catch {}
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  const save = useCallback(async (newData: Record<string,any>) => {
    setSaving(true);
    try {
      await fetch("/api/controle-qualite", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, data: newData }),
      });
      setLastSaved(new Date().toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" }));
    } catch {}
    setSaving(false);
  }, [date]);

  const toggle = (atelierId: string, sectionId: string, itemId: string) => {
    setData(prev => {
      const cur = prev?.[atelierId]?.[sectionId]?.[itemId] ?? false;
      const next = {
        ...prev,
        [atelierId]: {
          ...prev?.[atelierId],
          [sectionId]: {
            ...prev?.[atelierId]?.[sectionId],
            [itemId]: !cur,
          },
        },
      };
      save(next);
      return next;
    });
  };

  const setNote = (atelierId: string, val: string) => {
    setData(prev => {
      const next = { ...prev, [`note_${atelierId}`]: val };
      return next;
    });
  };

  const saveNote = (atelierId: string) => {
    save(data);
    void atelierId;
  };

  const navigate = (delta: number) => {
    let d = addDays(date, delta);
    let guard = 0;
    while (!isWorkday(d) && guard++ < 7) d = addDays(d, delta > 0 ? 1 : -1);
    setDate(d);
  };

  const ferie = JOURS_FERIES[date];
  const dateLabel = new Date(date+"T00:00:00").toLocaleDateString("fr-FR", { weekday:"long", day:"2-digit", month:"long", year:"numeric" });
  const isToday = date === today;

  return (
    <div>
      <H c={C.green}>Contrôles Qualité</H>

      {/* Navigation date */}
      <div style={{ display:"flex", gap:8, marginBottom:16, alignItems:"center", flexWrap:"wrap" }}>
        <button onClick={() => navigate(-1)} style={{ padding:"5px 12px", background:C.s1, border:`1px solid ${C.border}`, borderRadius:4, color:C.sec, cursor:"pointer", fontSize:14 }}>‹</button>
        <span style={{ fontSize:13, fontWeight:700, color:isToday?C.green:C.text, minWidth:280, textAlign:"center" }}>
          {dateLabel}
          {isToday && <span style={{ marginLeft:8, fontSize:10, color:C.green }}>(aujourd&apos;hui)</span>}
        </span>
        <button onClick={() => navigate(1)}  style={{ padding:"5px 12px", background:C.s1, border:`1px solid ${C.border}`, borderRadius:4, color:C.sec, cursor:"pointer", fontSize:14 }}>›</button>
        <button onClick={() => setDate(today)} style={{ padding:"5px 10px", background:C.green+"22", border:`1px solid ${C.green}44`, borderRadius:4, color:C.green, cursor:"pointer", fontSize:11, fontWeight:600 }}>Aujourd&apos;hui</button>
        {saving && <span style={{ fontSize:10, color:C.sec }}>Sauvegarde…</span>}
        {!saving && lastSaved && <span style={{ fontSize:10, color:C.green }}>✓ Sauvegardé {lastSaved}</span>}
      </div>

      {ferie && (
        <div style={{ marginBottom:12, padding:"8px 14px", background:C.purple+"22", border:`1px solid ${C.purple}55`, borderRadius:6, fontSize:11, color:C.purple }}>
          🎉 Jour férié : {ferie} — contrôles non applicables
        </div>
      )}

      {/* Score global */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10, marginBottom:16 }}>
        {CHECKLISTS.map(atelier => {
          const { total, done } = countChecked(data, atelier.id);
          const pct = total > 0 ? Math.round(done/total*100) : 0;
          const col = pct === 100 ? C.green : pct >= 50 ? C.orange : C.red;
          return (
            <div key={atelier.id} style={{ padding:"12px 16px", background:C.s1, borderRadius:6, border:`1px solid ${pct===100?atelier.color:C.border}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                <span style={{ fontSize:12, fontWeight:700, color:atelier.color }}>{atelier.label}</span>
                <span style={{ fontSize:18, fontWeight:800, color:col }} className="mono">{pct}%</span>
              </div>
              <div style={{ height:6, background:C.s2, borderRadius:3, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${pct}%`, background:col, borderRadius:3, transition:"width 0.3s" }} />
              </div>
              <div style={{ marginTop:4, fontSize:10, color:C.sec }}>{done} / {total} points validés</div>
            </div>
          );
        })}
      </div>

      {/* Checklists par atelier */}
      {CHECKLISTS.map(atelier => (
        <div key={atelier.id} style={{ marginBottom:20 }}>
          <div style={{ fontSize:14, fontWeight:800, color:atelier.color, letterSpacing:".04em",
            borderBottom:`2px solid ${atelier.color}44`, paddingBottom:6, marginBottom:12 }}>
            {atelier.label}
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10, marginBottom:10 }}>
            {atelier.sections.map(section => {
              const allDone = section.items.every(item => data?.[atelier.id]?.[section.id]?.[item.id]);
              return (
                <Card key={section.id} accent={allDone ? atelier.color : C.border}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                    <span style={{ fontSize:11, fontWeight:700, color:atelier.color }}>{section.label}</span>
                    {allDone && <span style={{ fontSize:10, color:C.green, fontWeight:700 }}>✓ OK</span>}
                  </div>
                  {section.items.map(item => {
                    const checked = !!data?.[atelier.id]?.[section.id]?.[item.id];
                    return (
                      <label key={item.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0",
                        borderBottom:`1px solid ${C.border}`, cursor:"pointer" }}>
                        <input type="checkbox" checked={checked}
                          onChange={() => toggle(atelier.id, section.id, item.id)}
                          style={{ width:15, height:15, cursor:"pointer", accentColor:atelier.color }} />
                        <span style={{ fontSize:11, color:checked?C.text:C.sec, textDecoration:checked?"none":"none",
                          fontWeight:checked?600:400 }}>
                          {item.label}
                        </span>
                        {checked && <span style={{ marginLeft:"auto", fontSize:10, color:atelier.color }}>✓</span>}
                      </label>
                    );
                  })}
                </Card>
              );
            })}
          </div>

          {/* Note par atelier */}
          <div style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10, color:C.sec, fontWeight:700, marginBottom:4 }}>NOTE {atelier.label.toUpperCase()}</div>
              <textarea
                value={data?.[`note_${atelier.id}`] || ""}
                onChange={e => setNote(atelier.id, e.target.value)}
                onBlur={() => saveNote(atelier.id)}
                placeholder={`Observations, incidents, remarques ${atelier.label}…`}
                style={{ width:"100%", minHeight:60, padding:"8px 10px", background:C.bg, border:`1px solid ${C.border}`,
                  borderRadius:4, color:C.text, fontSize:11, resize:"vertical", fontFamily:"inherit", boxSizing:"border-box" }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
