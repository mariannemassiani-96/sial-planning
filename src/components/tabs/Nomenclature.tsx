"use client";
import { useState } from "react";
import { TYPES_MENUISERIE, calcTempsType, T, C, CMAT, hm } from "@/lib/sial-data";
import { H, Bdg, Bar } from "@/components/ui";

const inp = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "7px 11px", color: C.text, fontSize: 13, outline: "none" };
const POSTE_C = { coupe: C.blue, coulissant: C.green, frappes: C.orange, vitrage_ov: C.cyan };

export default function Nomenclature() {
  const [filtre, setFiltre] = useState("tous");
  const [qte, setQte] = useState(1);

  const familles = ["tous", "frappe", "coulissant", "glandage"];
  const types = Object.entries(TYPES_MENUISERIE).filter(([, tm]) => filtre === "tous" || tm.famille === filtre);

  return (
    <div>
      <H c={C.teal}>Nomenclature — Temps par type de menuiserie</H>
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

      <div style={{ display: "grid", gridTemplateColumns: "140px 50px 80px 1fr", gap: 4, padding: "6px 12px", background: C.s2, borderRadius: "6px 6px 0 0", fontSize: 10, color: C.sec, fontWeight: 700, letterSpacing: "0.06em" }}>
        <span>TYPE</span><span>MAT.</span><span>PROFILS</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4, fontSize: 10 }}>
          <span style={{ color: C.blue }}>COUPE</span><span style={{ color: C.green }}>COUL.</span>
          <span style={{ color: C.orange }}>FRAPPES</span><span style={{ color: C.cyan }}>VIT. OUV.</span>
        </div>
      </div>

      {types.map(([id, tm]) => {
        const t = calcTempsType(id, qte);
        if (!t) return null;
        const maxT = Math.max(...Object.values(t.par_poste));
        return (
          <div key={id} style={{ display: "grid", gridTemplateColumns: "140px 50px 80px 1fr", gap: 4, padding: "8px 12px", background: C.s1, borderBottom: `1px solid ${C.border}`, alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{tm.label}</span>
            <Bdg t={tm.mat} c={CMAT[tm.mat] || C.sec} />
            <div style={{ textAlign: "center" }}>
              <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: C.teal }}>{(tm.profils_total || 0) * qte}</span>
              <span style={{ fontSize: 9, color: C.muted }}> prof.</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4 }}>
              {(["coupe", "coulissant", "frappes", "vitrage_ov"] as const).map(p => {
                const v = t.par_poste[p];
                const c = POSTE_C[p];
                return (
                  <div key={p} style={{ textAlign: "center" }}>
                    {v > 0 ? (
                      <>
                        <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: v === maxT && v > 0 ? C.orange : c }}>{hm(v)}</div>
                        <Bar v={v} max={maxT || 1} c={c} h={3} />
                        {v === maxT && v > 0 && <div style={{ fontSize: 8, color: C.orange }}>GOULOT</div>}
                      </>
                    ) : <span style={{ color: C.muted, fontSize: 11 }}>—</span>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div style={{ marginTop: 16, padding: 12, background: C.s2, borderRadius: 6, border: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 10, color: C.yellow, fontWeight: 700, marginBottom: 8 }}>TEMPS FIXES HEBDOMADAIRES — Sanctuarisés dans le planning coupe</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            { l: "Déballage + préparation + joints barres", v: "½ j × 2 personnes", t: T.prep_deballage_joints_sem, c: C.orange },
            { l: "Coupe double tête + renfort acier", v: "1 j × 2-3 personnes", t: T.coupe_double_tete_sem, c: C.blue },
          ].map((x, i) => (
            <div key={i} style={{ padding: 10, background: C.bg, borderRadius: 5 }}>
              <div style={{ fontSize: 11, color: C.text, marginBottom: 4 }}>{x.l}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Bdg t={x.v} c={x.c} />
                <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: x.c }}>{hm(x.t)}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 10, color: C.sec }}>
          Temps fixes quotidiens par poste : <span style={{ color: C.text }}>+10 min lancement matin</span> · <span style={{ color: C.text }}>+15 min nettoyage soir</span>
        </div>
      </div>
    </div>
  );
}
