"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { TYPES_MENUISERIE, C, CMAT, hm } from "@/lib/sial-data";
import { getRoutage } from "@/lib/routage-production";
import { H, Bdg } from "@/components/ui";

const POST_GROUPS = [
  { label: "Coupe & Prépa", color: "#42A5F5", ids: ["C2","C3","C4","C5","C6"] },
  { label: "Montage",       color: "#FFA726", ids: ["M1","M2","M3","F1","F2","F3","MHS"] },
  { label: "Vitrage",       color: "#26C6DA", ids: ["V1","V2","V3"] },
  { label: "Logistique",    color: "#CE93D8", ids: ["L4","L6","L7"] },
];
const ALL_POST_IDS = POST_GROUPS.flatMap(g => g.ids);
const POST_LABELS: Record<string, string> = {
  C2:"Prépa",C3:"LMT",C4:"2 têtes",C5:"Acier",C6:"Soudure",
  M1:"Coul.",M2:"Galand.",M3:"Portes",F1:"Dorm.F",F2:"Ouv.+F",F3:"Bois+CQ",
  MHS:"Mont.HS",
  V1:"V.Frap",V2:"V.C/G",V3:"Embal.",
  L4:"Acc.",L6:"Pal.",L7:"Charg.",
};
function postColor(pid: string): string {
  return POST_GROUPS.find(g => g.ids.includes(pid))?.color || C.sec;
}

// Labels des temps unitaires
const TEMPS_LABELS: Record<string, { label: string; unit: string }> = {
  coupe_profil:           { label: "Coupe profil LMT", unit: "min/profil" },
  coupe_double_tete:      { label: "Coupe double tête", unit: "min/profil DT" },
  coupe_renfort:          { label: "Coupe renfort acier", unit: "min/renfort" },
  soudure_pvc:            { label: "Soudure PVC", unit: "min/cadre" },
  poincon_alu:            { label: "Poinçon/assemblage ALU", unit: "min/cadre" },
  prep_dormant:           { label: "Prépa dormant", unit: "min/pièce" },
  pose_rails_accessoires: { label: "Pose rails + accessoires", unit: "min/pièce" },
  montage_dormant_coul:   { label: "Montage dormant coulissant", unit: "min/pièce" },
  montage_dormant_gland:  { label: "Montage dormant galandage", unit: "min/pièce" },
  ferrage_ouvrant:        { label: "Ferrage ouvrant", unit: "min/ouvrant" },
  mise_en_bois:           { label: "Mise en bois", unit: "min/pièce" },
  vitrage_frappe:         { label: "Vitrage frappe", unit: "min/ouvrant" },
  vitrage_coul_gland:     { label: "Vitrage coulissant/galandage", unit: "min/ouvrant" },
  controle:               { label: "Contrôle", unit: "min/pièce" },
  prep_accessoires_fab:   { label: "Prépa accessoires fab", unit: "min/pièce" },
  emballage:              { label: "Emballage", unit: "min/pièce" },
  palette:                { label: "Palette", unit: "min/pièce" },
  chargement:             { label: "Chargement", unit: "min/pièce" },
};

const inp = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: "4px 8px", color: C.text, fontSize: 12, outline: "none", width: 60, textAlign: "center" as const };

export default function Nomenclature() {
  const [filtre, setFiltre] = useState("tous");
  const [qte, setQte] = useState(1);
  const [tab, setTab] = useState<"nomenclature" | "temps">("nomenclature");
  const [temps, setTemps] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Charger les temps depuis la base
  useEffect(() => {
    fetch("/api/referentiel")
      .then(r => r.ok ? r.json() : {})
      .then(data => { if (data && typeof data === "object") setTemps(data as Record<string, number>); })
      .catch(() => {});
  }, []);

  // Sauvegarde auto (debounce)
  const saveTemps = useCallback((key: string, val: number) => {
    setTemps(prev => ({ ...prev, [key]: val }));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      await fetch("/api/referentiel", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: val }),
      }).catch(() => {});
      setSaving(false);
    }, 800);
  }, []);

  const familles = ["tous", "frappe", "coulissant", "glandage", "porte"];
  const types = Object.entries(TYPES_MENUISERIE)
    .filter(([, tm]) => tm.famille !== "hors_standard" && tm.famille !== "intervention")
    .filter(([, tm]) => filtre === "tous" || tm.famille === filtre);

  return (
    <div>
      <H c={C.teal}>Référentiel — Nomenclature &amp; Temps de fabrication</H>

      {/* Sous-onglets */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.border}`, marginBottom: 14 }}>
        {([["nomenclature", "Temps par type"], ["temps", "Temps unitaires"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: "8px 16px", background: "none", border: "none",
            borderBottom: `2px solid ${tab === id ? C.orange : "transparent"}`,
            color: tab === id ? C.text : C.sec, fontWeight: tab === id ? 700 : 400, fontSize: 13, cursor: "pointer",
          }}>
            {label}
          </button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 10, color: saving ? C.orange : C.green, alignSelf: "center" }}>
          {saving ? "Sauvegarde..." : Object.keys(temps).length > 0 ? "Sauvegardé" : ""}
        </span>
      </div>

      {/* ── Onglet 1 : Nomenclature (lecture) ── */}
      {tab === "nomenclature" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 4 }}>
              {familles.map(f => (
                <button key={f} onClick={() => setFiltre(f)} style={{ padding: "5px 12px", background: filtre === f ? C.teal + "33" : C.s1, border: `1px solid ${filtre === f ? C.teal : C.border}`, borderRadius: 4, color: filtre === f ? C.teal : C.sec, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  {f === "tous" ? "Tous" : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
              <span style={{ fontSize: 11, color: C.sec }}>Simuler pour</span>
              <input type="number" min={1} value={qte} onChange={e => setQte(Math.max(1, parseInt(e.target.value) || 1))} style={{ ...inp, width: 60 }} />
              <span style={{ fontSize: 11, color: C.sec }}>pièces</span>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ padding: "6px 8px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "left", fontSize: 10, color: C.sec, width: 110 }}>TYPE</th>
                  <th rowSpan={2} style={{ padding: "6px 4px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 10, color: C.sec, width: 40 }}>MAT.</th>
                  {POST_GROUPS.map(g => (
                    <th key={g.label} colSpan={g.ids.length} style={{ padding: "4px 4px", background: g.color + "15", borderBottom: `2px solid ${g.color}`, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 9, fontWeight: 700, color: g.color, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      {g.label}
                    </th>
                  ))}
                  <th rowSpan={2} style={{ padding: "6px 4px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 10, color: C.orange, fontWeight: 700, width: 55 }}>TOTAL</th>
                </tr>
                <tr>
                  {ALL_POST_IDS.map(pid => (
                    <th key={pid} style={{ padding: "3px 2px", background: C.s1, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 8, color: postColor(pid), fontWeight: 700, minWidth: 38 }}>
                      <div>{pid}</div>
                      <div style={{ fontSize: 7, color: C.muted, fontWeight: 400 }}>{POST_LABELS[pid]}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {types.map(([id, tm]) => {
                  const routage = getRoutage(id, qte);
                  if (routage.length === 0) return null;
                  const parPoste: Record<string, number> = {};
                  for (const e of routage) parPoste[e.postId] = (parPoste[e.postId] || 0) + e.estimatedMin;
                  const total = routage.reduce((s, e) => s + e.estimatedMin, 0);
                  const maxVal = Math.max(...Object.values(parPoste));
                  return (
                    <tr key={id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "6px 8px", background: C.s1, border: `1px solid ${C.border}` }}>
                        <span style={{ fontWeight: 700, fontSize: 11 }}>{tm.label}</span>
                      </td>
                      <td style={{ padding: "4px 4px", textAlign: "center", border: `1px solid ${C.border}` }}>
                        <Bdg t={tm.mat} c={CMAT[tm.mat] || C.sec} />
                      </td>
                      {ALL_POST_IDS.map(pid => {
                        const min = parPoste[pid] || 0;
                        if (min === 0) return <td key={pid} style={{ textAlign: "center", border: `1px solid ${C.border}`, color: C.muted, fontSize: 10 }}>—</td>;
                        const isMax = min === maxVal && min > 0;
                        return (
                          <td key={pid} style={{ padding: "4px 2px", textAlign: "center", border: `1px solid ${C.border}`, background: isMax ? C.orange + "12" : undefined }}>
                            <div className="mono" style={{ fontSize: 11, fontWeight: 700, color: isMax ? C.orange : postColor(pid) }}>{hm(min)}</div>
                            {isMax && <div style={{ fontSize: 7, color: C.orange, fontWeight: 700 }}>GOULOT</div>}
                          </td>
                        );
                      })}
                      <td style={{ padding: "4px 4px", textAlign: "center", border: `1px solid ${C.border}`, background: C.s1 }}>
                        <span className="mono" style={{ fontSize: 12, fontWeight: 800, color: C.orange }}>{hm(total)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Onglet 2 : Temps unitaires (éditable) ── */}
      {tab === "temps" && (
        <div>
          <div style={{ fontSize: 12, color: C.sec, marginBottom: 12 }}>
            Modifie les temps unitaires ci-dessous. Les changements sont sauvegardés automatiquement et recalculent toute la nomenclature.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {Object.entries(TEMPS_LABELS).map(([key, { label, unit }]) => {
              const val = temps[key] ?? 0;
              return (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: C.s1, border: `1px solid ${C.border}`, borderRadius: 5 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
                    <div style={{ fontSize: 10, color: C.muted }}>{unit}</div>
                  </div>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={val}
                    onChange={e => saveTemps(key, parseFloat(e.target.value) || 0)}
                    style={inp}
                  />
                  <span style={{ fontSize: 10, color: C.muted, width: 25 }}>min</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Légende */}
      {tab === "nomenclature" && (
        <div style={{ marginTop: 12, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 10, color: C.sec }}>
          {POST_GROUPS.map(g => (
            <div key={g.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: g.color }} />
              <span>{g.label} ({g.ids.join(", ")})</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: C.orange }} />
            <span style={{ color: C.orange }}>= Goulot</span>
          </div>
        </div>
      )}
    </div>
  );
}
