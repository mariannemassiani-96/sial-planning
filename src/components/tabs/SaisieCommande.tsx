"use client";
import { useState } from "react";
import { TYPES_MENUISERIE, ZONES, C, hm, fmtDate, calcTempsType, calcCheminCritique, dateDemarrage } from "@/lib/sial-data";
import { H, Card } from "@/components/ui";

const inp = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "7px 11px", color: C.text, fontSize: 13, width: "100%", outline: "none" };

const emptyLigne = { type: "ob1_pvc", quantite: 1, coloris: "blanc", hs_nb_profils: "", hs_t_coupe: "", hs_t_montage: "", hs_t_vitrage: "", hs_op_montage: "jp", hs_op_vitrage: "quentin", hs_notes: "" };
const emptyVitrage = { composition: "4/16/4", quantite: "1", surface_m2: "" };
const empty = {
  num_commande: "", client: "", ref_chantier: "",
  zone: ZONES[0], priorite: "normale",
  semaine_theorique: "", semaine_atteignable: "",
  date_alu: "", date_pvc: "", date_accessoires: "",
  date_panneau_porte: "", date_volet_roulant: "",
  date_livraison_souhaitee: "",
  aucun_vitrage: false,
  cmd_alu_passee: false, cmd_pvc_passee: false, cmd_accessoires_passee: false,
  lignes: [{ ...emptyLigne }],
  vitrages: [{ ...emptyVitrage }],
};

type FormType = typeof empty;

export default function SaisieCommande({ onAjouter }: { onAjouter: (cmd: any) => void }) {
  const [f, setF] = useState<FormType>(empty);
  const set = (k: keyof FormType, v: any) => setF(p => ({ ...p, [k]: v }));
  const setLigne = (i: number, k: string, v: any) => setF(p => { const l = [...p.lignes]; l[i] = { ...l[i], [k]: v }; return { ...p, lignes: l }; });
  const addLigne = () => setF(p => ({ ...p, lignes: [...p.lignes, { ...emptyLigne }] }));
  const delLigne = (i: number) => setF(p => ({ ...p, lignes: p.lignes.filter((_, j) => j !== i) }));
  const setVitrage = (i: number, k: string, v: any) => setF(p => { const v2 = [...p.vitrages]; v2[i] = { ...v2[i], [k]: v }; return { ...p, vitrages: v2 }; });
  const addVitrage = () => setF(p => ({ ...p, vitrages: [...p.vitrages, { ...emptyVitrage }] }));
  const delVitrage = (i: number) => setF(p => ({ ...p, vitrages: p.vitrages.filter((_, j) => j !== i) }));

  const premiereLigne = f.lignes?.[0] || emptyLigne;
  const tm = TYPES_MENUISERIE[premiereLigne.type];
  const dd = dateDemarrage({ date_alu: f.date_alu, date_pvc: f.date_pvc, date_accessoires: f.date_accessoires });
  const isHS = premiereLigne.type === "hors_standard";
  const hsTemps = isHS ? { nb_profils: premiereLigne.hs_nb_profils, t_coupe: premiereLigne.hs_t_coupe, t_montage: premiereLigne.hs_t_montage, t_vitrage: premiereLigne.hs_t_vitrage, operateur_montage: premiereLigne.hs_op_montage || "jp", operateur_vitrage: premiereLigne.hs_op_vitrage || "quentin", notes: premiereLigne.hs_notes } : null;
  const qteTotale = f.lignes.reduce((s, l) => s + (parseInt(String(l.quantite)) || 0), 0);
  const dlAuto = () => {
    if (!dd) return "";
    const cc = calcCheminCritique({ type: premiereLigne.type, quantite: qteTotale, hsTemps, date_alu: f.date_alu, date_pvc: f.date_pvc, date_accessoires: f.date_accessoires, date_panneau_porte: f.date_panneau_porte, date_volet_roulant: f.date_volet_roulant });
    return cc?.dateLivraisonAuPlusTot || "";
  };
  const dlReelle = dlAuto;
  const t = calcTempsType(premiereLigne.type, qteTotale, hsTemps);

  const groupes: Record<string, Record<string, Array<{ k: string; v: any }>>> = { PVC: { frappe: [] }, ALU: { frappe: [], porte: [], coulissant: [], glandage: [] } };
  Object.entries(TYPES_MENUISERIE).forEach(([k, v]) => {
    if (groupes[v.mat] && groupes[v.mat][v.famille]) groupes[v.mat][v.famille].push({ k, v });
  });

  const selectType = (val: string, onChange: (v: string) => void) => (
    <select style={inp} value={val} onChange={e => onChange(e.target.value)}>
      <optgroup label="── PVC Frappes">{groupes.PVC.frappe.map(({ k, v }) => <option key={k} value={k}>{v.label}</option>)}</optgroup>
      <optgroup label="── ALU Frappes">{groupes.ALU.frappe.map(({ k, v }) => <option key={k} value={k}>{v.label}</option>)}</optgroup>
      <optgroup label="── ALU Portes">{groupes.ALU.porte.map(({ k, v }) => <option key={k} value={k}>{v.label}</option>)}</optgroup>
      <optgroup label="── ALU Coulissants">{groupes.ALU.coulissant.map(({ k, v }) => <option key={k} value={k}>{v.label}</option>)}</optgroup>
      <optgroup label="── ALU Glandages">{groupes.ALU.glandage.map(({ k, v }) => <option key={k} value={k}>{v.label}</option>)}</optgroup>
      <optgroup label="── Spécial"><option value="hors_standard">Hors Standard</option></optgroup>
    </select>
  );

  const submit = () => {
    if (!f.client || !f.num_commande) return;
    const premType = f.lignes[0]?.type || "ob1_pvc";
    const premHS = f.lignes[0]?.type === "hors_standard" ? { nb_profils: f.lignes[0].hs_nb_profils, t_coupe: f.lignes[0].hs_t_coupe, t_montage: f.lignes[0].hs_t_montage, t_vitrage: f.lignes[0].hs_t_vitrage, operateur_montage: f.lignes[0].hs_op_montage || "jp", operateur_vitrage: f.lignes[0].hs_op_vitrage || "quentin" } : null;
    onAjouter({ ...f, id: Date.now(), type: premType, quantite: qteTotale, hsTemps: premHS, date_livraison_souhaitee: f.date_livraison_souhaitee || dlReelle() || dlAuto() });
    setF(empty);
  };

  return (
    <Card>
      <H c={C.orange}>Nouvelle commande</H>
      <div style={{ padding: 10, background: C.bg, borderRadius: 5, border: `1px solid ${C.border}`, marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: C.orange, fontWeight: 700, marginBottom: 8 }}>IDENTIFICATION</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div><label style={{ fontSize: 10, color: C.sec, display: "block", marginBottom: 3 }}>N° COMMANDE *</label><input style={{ ...inp, fontWeight: 700, color: C.orange }} value={f.num_commande} onChange={e => set("num_commande", e.target.value)} placeholder="ex: 2026-047" /></div>
          <div><label style={{ fontSize: 10, color: C.sec, display: "block", marginBottom: 3 }}>CLIENT *</label><input style={inp} value={f.client} onChange={e => set("client", e.target.value)} placeholder="Nom du client" /></div>
          <div><label style={{ fontSize: 10, color: C.sec, display: "block", marginBottom: 3 }}>RÉF. CHANTIER</label><input style={inp} value={f.ref_chantier} onChange={e => set("ref_chantier", e.target.value)} placeholder="ex: Villa Marina T3" /></div>
        </div>
      </div>

      <div style={{ padding: 10, background: C.bg, borderRadius: 5, border: `1px solid ${C.border}`, marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: C.cyan, fontWeight: 700, marginBottom: 8 }}>PLANNING LIVRAISON</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
          <div><label style={{ fontSize: 10, color: C.sec, display: "block", marginBottom: 3 }}>ZONE</label><select style={inp} value={f.zone} onChange={e => set("zone", e.target.value)}>{ZONES.map(z => <option key={z}>{z}</option>)}</select></div>
          <div><label style={{ fontSize: 10, color: C.sec, display: "block", marginBottom: 3 }}>PRIORITÉ</label><select style={inp} value={f.priorite} onChange={e => set("priorite", e.target.value)}><option value="normale">Normale</option><option value="urgente">Urgente</option><option value="chantier_bloque">Chantier bloqué</option></select></div>
          <div><label style={{ fontSize: 10, color: C.blue, display: "block", marginBottom: 3 }}>SEM. THÉORIQUE</label><input style={{ ...inp, borderColor: C.blue + "66" }} value={f.semaine_theorique} onChange={e => set("semaine_theorique", e.target.value)} placeholder="ex: S18-2026" /></div>
          <div><label style={{ fontSize: 10, color: C.green, display: "block", marginBottom: 3 }}>SEM. ATTEIGNABLE</label><input style={{ ...inp, borderColor: C.green + "66" }} value={f.semaine_atteignable} onChange={e => set("semaine_atteignable", e.target.value)} placeholder="ex: S20-2026" /></div>
        </div>
      </div>

      <div style={{ padding: 10, background: C.bg, borderRadius: 5, border: `1px solid ${C.border}`, marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: C.purple, fontWeight: 700 }}>MENUISERIES</div>
          <button onClick={addLigne} style={{ padding: "3px 10px", background: C.purple + "33", border: `1px solid ${C.purple}`, borderRadius: 4, color: C.purple, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>+ Ajouter ligne</button>
        </div>
        {f.lignes.map((lg, i) => {
          const tmLg = TYPES_MENUISERIE[lg.type];
          const isHSLg = lg.type === "hors_standard";
          return (
            <div key={i} style={{ marginBottom: 8, padding: 8, background: C.s1, borderRadius: 4, border: `1px solid ${C.border}` }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
                <div><label style={{ fontSize: 9, color: C.sec, display: "block", marginBottom: 2 }}>TYPE</label>{selectType(lg.type, v => setLigne(i, "type", v))}</div>
                <div><label style={{ fontSize: 9, color: C.sec, display: "block", marginBottom: 2 }}>QTÉ</label><input type="number" min={1} style={inp} value={lg.quantite} onChange={e => setLigne(i, "quantite", Math.max(1, parseInt(e.target.value) || 1))} /></div>
                <div>
                  <label style={{ fontSize: 9, color: C.sec, display: "block", marginBottom: 2 }}>COLORIS</label>
                  <input list="coloris-list" style={inp} value={lg.coloris} onChange={e => setLigne(i, "coloris", e.target.value)} placeholder="ex: Blanc, RAL 7016…" />
                  <datalist id="coloris-list">
                    <option value="Blanc" /><option value="Blanc laqué" /><option value="Bois" /><option value="Gris anthracite" /><option value="Noir" /><option value="Aluminium" /><option value="Sable" /><option value="RAL 7016" /><option value="RAL 9005" /><option value="RAL 9010" /><option value="Bicolore" />
                  </datalist>
                </div>
                <button onClick={() => delLigne(i)} disabled={f.lignes.length === 1} style={{ padding: "6px 10px", background: "none", border: `1px solid ${C.border}`, borderRadius: 4, color: C.sec, cursor: "pointer", fontSize: 11 }}>✕</button>
              </div>
              {tmLg && !isHSLg && <div style={{ marginTop: 4, fontSize: 9, color: C.muted }} className="mono">{tmLg.profils_total} profils · {tmLg.dormant} dorm. · {tmLg.ouvrants} ouv.</div>}
              {isHSLg && (
                <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6 }}>
                  {[{ l: "Nb profils", k: "hs_nb_profils" }, { l: "Tps coupe(min)", k: "hs_t_coupe" }, { l: "Tps montage(min)", k: "hs_t_montage" }, { l: "Tps vitrage(min)", k: "hs_t_vitrage" }].map(x => (
                    <div key={x.k}><label style={{ fontSize: 8, color: C.purple, display: "block", marginBottom: 2 }}>{x.l}</label><input type="number" min={0} style={{ ...inp, fontSize: 11, padding: "4px 6px" }} value={(lg as any)[x.k] || ""} onChange={e => setLigne(i, x.k, e.target.value)} /></div>
                  ))}
                  <div><label style={{ fontSize: 8, color: C.purple, display: "block", marginBottom: 2 }}>Op. vitrage</label><select style={{ ...inp, fontSize: 11, padding: "4px 6px" }} value={lg.hs_op_vitrage || "quentin"} onChange={e => setLigne(i, "hs_op_vitrage", e.target.value)}>{[{ id: "quentin", l: "Quentin" }, { id: "michel", l: "Michel" }, { id: "jf", l: "Jean-François" }, { id: "jp", l: "Jean-Pierre" }, { id: "bruno", l: "Bruno" }].map(o => <option key={o.id} value={o.id}>{o.l}</option>)}</select></div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ padding: 10, background: C.bg, borderRadius: 5, border: `1px solid ${C.border}`, marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 10, color: C.teal, fontWeight: 700 }}>VITRAGES ISOLANTS (m²)</div>
            <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 10, color: f.aucun_vitrage ? C.orange : C.sec }}>
              <input type="checkbox" checked={f.aucun_vitrage} onChange={e => set("aucun_vitrage", e.target.checked)} />
              Aucun vitrage
            </label>
          </div>
          {!f.aucun_vitrage && <button onClick={addVitrage} style={{ padding: "3px 10px", background: C.teal + "33", border: `1px solid ${C.teal}`, borderRadius: 4, color: C.teal, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>+ Composition</button>}
        </div>
        {f.aucun_vitrage ? (
          <div style={{ fontSize: 11, color: C.orange, padding: "6px 0" }}>Sans vitrage isolant — fourni ou non applicable.</div>
        ) : (
          <>
            {f.vitrages.map((vg, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 0.6fr 1fr auto", gap: 8, marginBottom: 6, alignItems: "end" }}>
                <div><label style={{ fontSize: 9, color: C.sec, display: "block", marginBottom: 2 }}>COMPOSITION</label><select style={inp} value={vg.composition} onChange={e => setVitrage(i, "composition", e.target.value)}>{["4/16/4", "4/12/4", "4/20/4", "44.2/16/4 feuilleté", "VSG feuilleté", "Contrôle solaire", "Autre"].map(c => <option key={c}>{c}</option>)}</select></div>
                <div><label style={{ fontSize: 9, color: C.sec, display: "block", marginBottom: 2 }}>QTÉ</label><input type="number" min={1} style={{ ...inp, color: C.purple, fontWeight: 700 }} value={vg.quantite} onChange={e => setVitrage(i, "quantite", e.target.value)} placeholder="1" /></div>
                <div><label style={{ fontSize: 9, color: C.sec, display: "block", marginBottom: 2 }}>SURFACE TOTALE (m²)</label><input type="number" min={0} step={0.01} style={{ ...inp, color: C.teal, fontWeight: 700 }} value={vg.surface_m2} onChange={e => setVitrage(i, "surface_m2", e.target.value)} placeholder="ex: 3.60" /></div>
                <button onClick={() => delVitrage(i)} disabled={f.vitrages.length === 1} style={{ padding: "6px 10px", background: "none", border: `1px solid ${C.border}`, borderRadius: 4, color: C.sec, cursor: "pointer", fontSize: 11 }}>✕</button>
              </div>
            ))}
            <div style={{ marginTop: 6, fontSize: 10, color: C.muted }}>
              Total : <span className="mono" style={{ color: C.teal, fontWeight: 700 }}>{Math.round(f.vitrages.reduce((s, v) => s + (parseFloat(v.surface_m2) || 0), 0) * 100) / 100} m²</span>
              <span style={{ marginLeft: 12 }}>{f.vitrages.reduce((s, v) => s + (parseInt(v.quantite) || 0), 0)} unité(s)</span>
            </div>
          </>
        )}
      </div>

      <div style={{ marginTop: 10, padding: 12, background: C.bg, borderRadius: 6, border: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 10, color: C.teal, fontWeight: 700, marginBottom: 8 }}>DATES RÉCEPTION MATIÈRES</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {tm?.mat === "ALU" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                <label style={{ fontSize: 10, color: C.cyan }}>Profilés ALU</label>
                <button type="button" onClick={() => set("cmd_alu_passee", !f.cmd_alu_passee)} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, border: `1px solid ${f.cmd_alu_passee ? C.green : C.red}`, background: "none", color: f.cmd_alu_passee ? C.green : C.red, cursor: "pointer", fontWeight: 700 }}>
                  {f.cmd_alu_passee ? "✓ Passée" : "⚠ À passer"}
                </button>
              </div>
              <input type="date" style={{ ...inp, borderColor: C.cyan + "66" }} value={f.date_alu} onChange={e => set("date_alu", e.target.value)} />
            </div>
          )}
          {(tm?.mat === "PVC" || ["coulissant", "glandage"].includes(tm?.famille || "")) && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                <label style={{ fontSize: 10, color: C.blue }}>Profilés PVC</label>
                <button type="button" onClick={() => set("cmd_pvc_passee", !f.cmd_pvc_passee)} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, border: `1px solid ${f.cmd_pvc_passee ? C.green : C.red}`, background: "none", color: f.cmd_pvc_passee ? C.green : C.red, cursor: "pointer", fontWeight: 700 }}>
                  {f.cmd_pvc_passee ? "✓ Passée" : "⚠ À passer"}
                </button>
              </div>
              <input type="date" style={{ ...inp, borderColor: C.blue + "66" }} value={f.date_pvc} onChange={e => set("date_pvc", e.target.value)} />
            </div>
          )}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
              <label style={{ fontSize: 10, color: C.orange }}>Accessoires</label>
              <button type="button" onClick={() => set("cmd_accessoires_passee", !f.cmd_accessoires_passee)} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, border: `1px solid ${f.cmd_accessoires_passee ? C.green : C.red}`, background: "none", color: f.cmd_accessoires_passee ? C.green : C.red, cursor: "pointer", fontWeight: 700 }}>
                {f.cmd_accessoires_passee ? "✓ Passée" : "⚠ À passer"}
              </button>
            </div>
            <input type="date" style={{ ...inp, borderColor: C.orange + "66" }} value={f.date_accessoires} onChange={e => set("date_accessoires", e.target.value)} />
          </div>
        </div>
        {dd && <div style={{ marginTop: 6, fontSize: 11, color: C.sec }}>Démarrage fab : <span style={{ color: C.teal, fontWeight: 600 }} className="mono">{fmtDate(dd)}</span></div>}
      </div>

      <div style={{ marginTop: 10, padding: 12, background: C.bg, borderRadius: 6, border: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 10, color: C.yellow, fontWeight: 700, marginBottom: 8 }}>MATIÈRES OPTIONNELLES</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={{ fontSize: 10, color: C.yellow, display: "block", marginBottom: 3 }}>Panneau porte d&apos;entrée</label><input type="date" style={{ ...inp, borderColor: C.yellow + "66" }} value={f.date_panneau_porte} onChange={e => set("date_panneau_porte", e.target.value)} /></div>
          <div><label style={{ fontSize: 10, color: C.yellow, display: "block", marginBottom: 3 }}>Volet roulant</label><input type="date" style={{ ...inp, borderColor: C.yellow + "66" }} value={f.date_volet_roulant} onChange={e => set("date_volet_roulant", e.target.value)} /></div>
        </div>
        {(f.date_panneau_porte || f.date_volet_roulant) && <div style={{ marginTop: 6, fontSize: 11, color: C.yellow }}>Livraison impossible avant {fmtDate(dlReelle())}</div>}
      </div>

      {t && (
        <div style={{ marginTop: 10, padding: 10, background: C.bg, borderRadius: 5, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 10, color: C.sec, marginBottom: 8 }}>TEMPS DE FABRICATION</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
            {(Object.entries(t.par_poste) as [string, number][]).filter(([, v]) => v > 0).map(([p, v]) => (
              <div key={p} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 9, color: C.sec }}>{p.toUpperCase()}</div>
                <div className="mono" style={{ fontSize: 14, fontWeight: 600, color: C.cyan }}>{hm(v)}</div>
              </div>
            ))}
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, color: C.sec }}>TOTAL</div>
              <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: C.orange }}>{hm(t.tTotal)}</div>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <label style={{ fontSize: 10, color: C.sec, display: "block", marginBottom: 3 }}>LIVRAISON SOUHAITÉE</label>
        <input type="date" style={inp} value={f.date_livraison_souhaitee} onChange={e => set("date_livraison_souhaitee", e.target.value)} />
        {dlReelle() && !f.date_livraison_souhaitee && <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>Auto : {fmtDate(dlReelle())}</div>}
      </div>

      <button onClick={submit} style={{ marginTop: 12, width: "100%", padding: "9px 0", background: "#E65100", border: "none", borderRadius: 5, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", letterSpacing: "0.06em" }}>
        + AJOUTER COMMANDE
      </button>
    </Card>
  );
}
