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
  M1:"Coul.",M2:"Galand.",M3:"Portes",F1:"Dorm.F",F2:"Ouv.+F",F3:"Bois+CQ",MHS:"Mont.HS",
  V1:"V.Frap",V2:"V.C/G",V3:"Embal.",
  L4:"Acc.",L6:"Pal.",L7:"Charg.",
};
function postColor(pid: string): string {
  return POST_GROUPS.find(g => g.ids.includes(pid))?.color || C.sec;
}

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
  const [typeOverrides, setTypeOverrides] = useState<Record<string, Record<string, number>>>({});
  const [editCell, setEditCell] = useState<string | null>(null); // "typeId|postId"
  const [editVal, setEditVal] = useState("");
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/referentiel")
      .then(r => r.ok ? r.json() : { unitaires: {}, typeOverrides: {} })
      .then(data => {
        if (data.unitaires) setTemps(data.unitaires);
        if (data.typeOverrides) setTypeOverrides(data.typeOverrides);
      })
      .catch(() => {});
  }, []);

  const saveTemps = useCallback((key: string, val: number) => {
    setTemps(prev => ({ ...prev, [key]: val }));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      await fetch("/api/referentiel", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: val }) }).catch(() => {});
      setSaving(false);
    }, 800);
  }, []);

  const saveTypeOverride = useCallback((typeId: string, postId: string, min: number) => {
    setTypeOverrides(prev => {
      const next = { ...prev };
      if (!next[typeId]) next[typeId] = {};
      if (min < 0) { delete next[typeId][postId]; } else { next[typeId][postId] = min; }
      return next;
    });
    setSaving(true);
    fetch("/api/referentiel", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ typeId, postId, min }) })
      .then(() => setSaving(false))
      .catch(() => setSaving(false));
  }, []);

  const getMin = (typeId: string, postId: string, calculatedMin: number): { min: number; overridden: boolean } => {
    const ov = typeOverrides[typeId]?.[postId];
    if (ov !== undefined) return { min: ov, overridden: true };
    return { min: calculatedMin, overridden: false };
  };

  const familles = ["tous", "frappe", "coulissant", "glandage", "porte"];
  const types = Object.entries(TYPES_MENUISERIE)
    .filter(([, tm]) => tm.famille !== "hors_standard" && tm.famille !== "intervention")
    .filter(([, tm]) => filtre === "tous" || tm.famille === filtre);

  return (
    <div>
      <H c={C.teal}>Référentiel — Nomenclature &amp; Temps de fabrication</H>

      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.border}`, marginBottom: 14 }}>
        {([["nomenclature", "Temps par type"], ["temps", "Temps unitaires"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: "8px 16px", background: "none", border: "none",
            borderBottom: `2px solid ${tab === id ? C.orange : "transparent"}`,
            color: tab === id ? C.text : C.sec, fontWeight: tab === id ? 700 : 400, fontSize: 13, cursor: "pointer",
          }}>{label}</button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 10, color: saving ? C.orange : C.green, alignSelf: "center" }}>
          {saving ? "Sauvegarde..." : ""}
        </span>
      </div>

      {/* ── Onglet 1 : Temps par type (ÉDITABLE) ── */}
      {tab === "nomenclature" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 4 }}>
              {familles.map(f => (
                <button key={f} onClick={() => setFiltre(f)} style={{ padding: "5px 12px", background: filtre === f ? C.teal + "33" : C.s1, border: `1px solid ${filtre === f ? C.teal : C.border}`, borderRadius: 4, color: filtre === f ? C.teal : C.sec, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  {f === "tous" ? "Tous" : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
              <span style={{ fontSize: 11, color: C.sec }}>Quantité</span>
              <input type="number" min={1} value={qte} onChange={e => setQte(Math.max(1, parseInt(e.target.value) || 1))} style={{ ...inp, width: 50 }} />
            </div>
            <div style={{ fontSize: 10, color: C.muted }}>Clic sur un temps pour le modifier</div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ padding: "6px 8px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "left", fontSize: 10, color: C.sec, width: 100 }}>TYPE</th>
                  <th rowSpan={2} style={{ padding: "6px 4px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 10, color: C.sec, width: 35 }}>MAT.</th>
                  {POST_GROUPS.map(g => (
                    <th key={g.label} colSpan={g.ids.length} style={{ padding: "3px", background: g.color + "15", borderBottom: `2px solid ${g.color}`, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 8, fontWeight: 700, color: g.color, textTransform: "uppercase" }}>
                      {g.label}
                    </th>
                  ))}
                  <th rowSpan={2} style={{ padding: "6px 4px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 10, color: C.orange, fontWeight: 700, width: 50 }}>TOTAL</th>
                </tr>
                <tr>
                  {ALL_POST_IDS.map(pid => (
                    <th key={pid} style={{ padding: "2px 1px", background: C.s1, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 7, color: postColor(pid), fontWeight: 700, minWidth: 36 }}>
                      {pid}<br/><span style={{ color: C.muted, fontWeight: 400 }}>{POST_LABELS[pid]}</span>
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

                  // Appliquer les overrides
                  let total = 0;
                  const finalVals: Record<string, { min: number; ov: boolean }> = {};
                  for (const pid of ALL_POST_IDS) {
                    const calc = parPoste[pid] || 0;
                    if (calc === 0 && !typeOverrides[id]?.[pid]) {
                      finalVals[pid] = { min: 0, ov: false };
                    } else {
                      const { min, overridden } = getMin(id, pid, calc);
                      finalVals[pid] = { min: min * (overridden && qte > 1 ? qte : 1), ov: overridden };
                      total += finalVals[pid].min;
                    }
                  }
                  if (!total) total = Object.values(finalVals).reduce((s, v) => s + v.min, 0);
                  const maxVal = Math.max(...Object.values(finalVals).map(v => v.min));

                  return (
                    <tr key={id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "5px 6px", background: C.s1, border: `1px solid ${C.border}` }}>
                        <span style={{ fontWeight: 700, fontSize: 11 }}>{tm.label}</span>
                      </td>
                      <td style={{ padding: "3px", textAlign: "center", border: `1px solid ${C.border}` }}>
                        <Bdg t={tm.mat} c={CMAT[tm.mat] || C.sec} />
                      </td>
                      {ALL_POST_IDS.map(pid => {
                        const { min, ov } = finalVals[pid];
                        const cellKey = `${id}|${pid}`;
                        const isEditing = editCell === cellKey;
                        const isMax = min === maxVal && min > 0;

                        if (min === 0 && !isEditing) {
                          return (
                            <td key={pid} style={{ textAlign: "center", border: `1px solid ${C.border}`, color: C.muted, fontSize: 10, cursor: "pointer" }}
                              onClick={() => { setEditCell(cellKey); setEditVal(""); }}>
                              —
                            </td>
                          );
                        }

                        if (isEditing) {
                          return (
                            <td key={pid} style={{ padding: "2px", border: `2px solid ${C.orange}`, background: C.bg }}>
                              <input
                                autoFocus
                                type="number"
                                min={0}
                                step={1}
                                value={editVal}
                                placeholder={String(min)}
                                onChange={e => setEditVal(e.target.value)}
                                onBlur={() => {
                                  const v = parseFloat(editVal);
                                  if (!isNaN(v) && v >= 0) {
                                    // Sauvegarder pour 1 pièce
                                    saveTypeOverride(id, pid, qte > 1 ? Math.round(v / qte) : v);
                                  }
                                  setEditCell(null);
                                }}
                                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditCell(null); }}
                                style={{ width: "100%", padding: "2px 4px", fontSize: 11, background: C.bg, border: "none", color: C.orange, textAlign: "center", outline: "none", boxSizing: "border-box" }}
                              />
                            </td>
                          );
                        }

                        return (
                          <td key={pid} style={{
                            padding: "3px 2px", textAlign: "center",
                            border: `1px solid ${ov ? C.orange + "88" : C.border}`,
                            background: isMax ? C.orange + "12" : ov ? C.orange + "08" : undefined,
                            cursor: "pointer",
                          }}
                            onClick={() => { setEditCell(cellKey); setEditVal(String(min)); }}
                          >
                            <div className="mono" style={{ fontSize: 11, fontWeight: 700, color: ov ? C.orange : isMax ? C.orange : postColor(pid) }}>
                              {hm(min)}
                            </div>
                            {ov && <div style={{ fontSize: 6, color: C.orange }}>modifié</div>}
                            {isMax && !ov && <div style={{ fontSize: 6, color: C.orange }}>GOULOT</div>}
                          </td>
                        );
                      })}
                      <td style={{ padding: "3px", textAlign: "center", border: `1px solid ${C.border}`, background: C.s1 }}>
                        <span className="mono" style={{ fontSize: 12, fontWeight: 800, color: C.orange }}>{hm(total)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 8, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 10, color: C.sec }}>
            {POST_GROUPS.map(g => (
              <div key={g.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: g.color }} />
                <span>{g.label}</span>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: C.orange }} />
              <span style={{ color: C.orange }}>= modifié / goulot</span>
            </div>
          </div>
        </>
      )}

      {/* ── Onglet 2 : Temps unitaires (éditable) ── */}
      {tab === "temps" && (
        <div>
          <div style={{ fontSize: 12, color: C.sec, marginBottom: 12 }}>
            Modifie les temps unitaires. Les changements recalculent toute la nomenclature (sauf les temps modifiés manuellement par type).
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {Object.entries(TEMPS_LABELS).map(([key, { label, unit }]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: C.s1, border: `1px solid ${C.border}`, borderRadius: 5 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{unit}</div>
                </div>
                <input type="number" min={0} step={0.5} value={temps[key] ?? 0} onChange={e => saveTemps(key, parseFloat(e.target.value) || 0)} style={inp} />
                <span style={{ fontSize: 10, color: C.muted, width: 25 }}>min</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
