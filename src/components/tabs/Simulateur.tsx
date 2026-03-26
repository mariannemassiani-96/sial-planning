"use client";
import { useState, useMemo } from "react";
import { TYPES_MENUISERIE, calcTempsType, C, CMAT, CFAM, hm } from "@/lib/sial-data";
import { H, Bdg, Bar } from "@/components/ui";

const inp = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "7px 11px", color: C.text, fontSize: 13, width: "100%", outline: "none" };

function simulerObjectif(typeId: string, nbPieces: number) {
  const tm = TYPES_MENUISERIE[typeId];
  if (!tm) return [];
  const t = calcTempsType(typeId, nbPieces);
  if (!t) return [];
  const minDispo = 8 * 60;
  const postes = [
    { id: "coupe", label: "Coupe / Soudure", operateurs_std: 3, charge: t.par_poste.coupe },
    { id: "coulissant", label: "Montage Coulissant", operateurs_std: 1, charge: t.par_poste.coulissant },
    { id: "frappes", label: "Montage Frappes", operateurs_std: 2, charge: t.par_poste.frappes },
    { id: "vitrage_ov", label: "Vitrage Ouvrants", operateurs_std: 1, charge: t.par_poste.vitrage_ov },
  ].filter(p => p.charge > 0);
  return postes.map(p => ({
    ...p,
    nbPersonnes: Math.ceil(p.charge / minDispo),
    pct: Math.round(p.charge / (minDispo * p.operateurs_std) * 100),
    cadence: p.charge > 0 ? Math.floor(minDispo * p.operateurs_std / (p.charge / nbPieces)) : 0,
    goulot: Math.ceil(p.charge / minDispo) > p.operateurs_std,
  }));
}

export default function Simulateur() {
  const [typeId, setTypeId] = useState("ob1_pvc");
  const [objectif, setObjectif] = useState(20);
  const [mode, setMode] = useState<"objectif" | "equipe">("objectif");
  const [nbP, setNbP] = useState(2);
  const minDispo = 8 * 60;
  const sim = useMemo(() => simulerObjectif(typeId, objectif), [typeId, objectif]);
  const tm = TYPES_MENUISERIE[typeId];

  const capaciteMode = () => {
    if (!sim.length) return 0;
    const goulot = sim.reduce((g, s) => s.charge / s.operateurs_std > g.charge / g.operateurs_std ? s : g);
    return Math.floor(minDispo * nbP / (goulot.charge / objectif));
  };

  const groupes: Record<string, Record<string, Array<{ k: string; v: typeof tm }>>> = { PVC: { frappe: [] }, ALU: { frappe: [], porte: [], coulissant: [], glandage: [] } };
  Object.entries(TYPES_MENUISERIE).forEach(([k, v]) => {
    if (groupes[v.mat] && groupes[v.mat][v.famille]) groupes[v.mat][v.famille].push({ k, v });
  });

  return (
    <div>
      <H c={C.purple}>Simulateur de charge</H>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 4, gridColumn: "1/-1" }}>
          {[{ id: "objectif", l: "Objectif → Combien de personnes ?" }, { id: "equipe", l: "Équipe fixe → Capacité max ?" }].map(m => (
            <button key={m.id} onClick={() => setMode(m.id as any)} style={{ flex: 1, padding: "7px", background: mode === m.id ? C.purple + "33" : C.s1, border: `1px solid ${mode === m.id ? C.purple : C.border}`, borderRadius: 5, color: mode === m.id ? C.purple : C.sec, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{m.l}</button>
          ))}
        </div>
        <div>
          <label style={{ fontSize: 10, color: C.sec, display: "block", marginBottom: 3 }}>TYPE DE MENUISERIE</label>
          <select style={inp} value={typeId} onChange={e => setTypeId(e.target.value)}>
            <optgroup label="── PVC Frappes">{groupes.PVC.frappe.map(({ k, v }) => <option key={k} value={k}>{v.label}</option>)}</optgroup>
            <optgroup label="── ALU Frappes">{groupes.ALU.frappe.map(({ k, v }) => <option key={k} value={k}>{v.label}</option>)}</optgroup>
            <optgroup label="── ALU Portes">{groupes.ALU.porte.map(({ k, v }) => <option key={k} value={k}>{v.label}</option>)}</optgroup>
            <optgroup label="── ALU Coulissants">{groupes.ALU.coulissant.map(({ k, v }) => <option key={k} value={k}>{v.label}</option>)}</optgroup>
            <optgroup label="── ALU Glandages">{groupes.ALU.glandage.map(({ k, v }) => <option key={k} value={k}>{v.label}</option>)}</optgroup>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 10, color: C.sec, display: "block", marginBottom: 3 }}>{mode === "objectif" ? "OBJECTIF (pièces/jour)" : "NB PERSONNES DISPONIBLES"}</label>
          <input type="number" min={1} style={inp} value={mode === "objectif" ? objectif : nbP} onChange={e => mode === "objectif" ? setObjectif(parseInt(e.target.value) || 1) : setNbP(parseInt(e.target.value) || 1)} />
        </div>
      </div>

      {tm && (
        <div style={{ marginBottom: 12, padding: 10, background: C.bg, borderRadius: 5, border: `1px solid ${C.border}`, display: "flex", gap: 16, flexWrap: "wrap" }}>
          {[
            { l: "Matière", v: tm.mat, c: CMAT[tm.mat] || C.sec },
            { l: "Famille", v: tm.famille, c: CFAM[tm.famille] || C.sec },
            { l: "Profils/pièce", v: String(tm.profils_total), c: C.teal },
            { l: "Dormant", v: `${tm.dormant} prof.`, c: C.blue },
            { l: "Ouvrants", v: String(tm.ouvrants), c: C.orange },
          ].map((x, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, color: C.sec }}>{x.l}</div>
              <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: x.c }}>{x.v}</div>
            </div>
          ))}
        </div>
      )}

      {mode === "objectif" && (
        <div style={{ padding: 14, background: C.purple + "22", border: `1px solid ${C.purple}44`, borderRadius: 6 }}>
          <div style={{ fontSize: 12, color: C.purple, fontWeight: 700, marginBottom: 10 }}>
            Pour <span className="mono" style={{ fontSize: 16 }}>{objectif}</span> × {tm?.label}/jour
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
            {sim.map((s, i) => (
              <div key={i} style={{ textAlign: "center", padding: 10, background: C.bg, borderRadius: 5, border: `1px solid ${s.goulot ? C.red : C.border}` }}>
                <div style={{ fontSize: 9, color: C.sec, marginBottom: 2 }}>{s.label}</div>
                <div className="mono" style={{ fontSize: 22, fontWeight: 800, color: s.goulot ? C.red : C.green }}>{s.nbPersonnes}</div>
                <div style={{ fontSize: 9, color: C.sec }}>personne(s)</div>
                {s.goulot && <Bdg t="GOULOT" c={C.red} />}
                <div style={{ marginTop: 6, fontSize: 10, color: C.sec }}>Cadence : <span style={{ color: C.cyan }} className="mono">{s.cadence}/j</span></div>
                <Bar v={s.pct} max={100} c={s.goulot ? C.red : C.green} h={4} />
                <div style={{ fontSize: 9, color: C.sec, marginTop: 2 }}>{s.pct}% capacité std</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === "equipe" && (
        <div style={{ padding: 14, background: C.green + "22", border: `1px solid ${C.green}44`, borderRadius: 6 }}>
          <div style={{ fontSize: 12, color: C.green, fontWeight: 700, marginBottom: 10 }}>
            Avec <span className="mono" style={{ fontSize: 16 }}>{nbP}</span> personne(s) sur {tm?.label}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, color: C.sec }}>CAPACITÉ MAX / JOUR</div>
              <div className="mono" style={{ fontSize: 32, fontWeight: 800, color: C.green }}>{capaciteMode()}</div>
              <div style={{ fontSize: 11, color: C.sec }}>pièces/jour</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, color: C.sec }}>TEMPS/PIÈCE (flux)</div>
              <div className="mono" style={{ fontSize: 32, fontWeight: 800, color: C.cyan }}>
                {calcTempsType(typeId, 1) ? hm(Math.max(...Object.values(calcTempsType(typeId, 1)!.par_poste))) : "—"}
              </div>
              <div style={{ fontSize: 11, color: C.sec }}>goulot</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
