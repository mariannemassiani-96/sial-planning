"use client";
import { useState } from "react";
import { TYPES_MENUISERIE, C, CMAT, hm } from "@/lib/sial-data";
import { getRoutage } from "@/lib/routage-production";
import { H, Bdg } from "@/components/ui";

const inp = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "7px 11px", color: C.text, fontSize: 13, outline: "none" };

// Postes à afficher dans le tableau — même structure que les compétences
const POST_GROUPS = [
  { label: "Coupe & Prépa", color: "#42A5F5", ids: ["C2","C3","C4","C5","C6"] },
  { label: "Montage",       color: "#FFA726", ids: ["M1","M2","M3","F1","F2","F3"] },
  { label: "Vitrage",       color: "#26C6DA", ids: ["V1","V2","V3"] },
  { label: "Logistique",    color: "#CE93D8", ids: ["L4","L6","L7"] },
];
const ALL_POST_IDS = POST_GROUPS.flatMap(g => g.ids);
const POST_LABELS: Record<string, string> = {
  C2:"Prépa",C3:"LMT",C4:"2 têtes",C5:"Acier",C6:"Soudure",
  M1:"Coul.",M2:"Galand.",M3:"Portes",F1:"Dorm.F",F2:"Ouv.+F",F3:"Bois+CQ",
  V1:"V.Frap",V2:"V.C/G",V3:"Embal.",
  L4:"Acc.",L6:"Pal.",L7:"Charg.",
};

function postColor(pid: string): string {
  return POST_GROUPS.find(g => g.ids.includes(pid))?.color || C.sec;
}

export default function Nomenclature() {
  const [filtre, setFiltre] = useState("tous");
  const [qte, setQte] = useState(1);

  const familles = ["tous", "frappe", "coulissant", "glandage", "porte"];
  const types = Object.entries(TYPES_MENUISERIE)
    .filter(([, tm]) => tm.famille !== "hors_standard" && tm.famille !== "intervention")
    .filter(([, tm]) => filtre === "tous" || tm.famille === filtre);

  return (
    <div>
      <H c={C.teal}>Nomenclature — Temps par poste et par type</H>

      {/* Filtres */}
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
          <input type="number" min={1} value={qte} onChange={e => setQte(Math.max(1, parseInt(e.target.value) || 1))} style={{ ...inp, width: 60, textAlign: "center", padding: "5px 8px" }} />
          <span style={{ fontSize: 11, color: C.sec }}>pièces</span>
        </div>
      </div>

      {/* Tableau */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            {/* Ligne 1 : groupes de postes */}
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
            {/* Ligne 2 : IDs postes */}
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

              // Agréger les temps par poste
              const parPoste: Record<string, number> = {};
              for (const e of routage) {
                parPoste[e.postId] = (parPoste[e.postId] || 0) + e.estimatedMin;
              }
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
                    if (min === 0) {
                      return <td key={pid} style={{ textAlign: "center", border: `1px solid ${C.border}`, color: C.muted, fontSize: 10 }}>—</td>;
                    }
                    const isMax = min === maxVal && min > 0;
                    const col = postColor(pid);
                    return (
                      <td key={pid} style={{ padding: "4px 2px", textAlign: "center", border: `1px solid ${C.border}`, background: isMax ? C.orange + "12" : undefined }}>
                        <div className="mono" style={{ fontSize: 11, fontWeight: 700, color: isMax ? C.orange : col }}>{hm(min)}</div>
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

      {/* Légende */}
      <div style={{ marginTop: 12, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 10, color: C.sec }}>
        {POST_GROUPS.map(g => (
          <div key={g.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: g.color }} />
            <span>{g.label}</span>
            <span style={{ color: C.muted }}>({g.ids.join(", ")})</span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: C.orange }} />
          <span style={{ color: C.orange }}>= Goulot (temps max)</span>
        </div>
      </div>
    </div>
  );
}
