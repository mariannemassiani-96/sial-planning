"use client";
import { useState } from "react";
import { TYPES_MENUISERIE, ZONES, C, hm, fmtDate, calcTempsType, calcCheminCritique, dateDemarrage } from "@/lib/sial-data";
import { H, Card } from "@/components/ui";

const inp = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "7px 11px", color: C.text, fontSize: 13, width: "100%", outline: "none" };

const emptyLigne = { type: "ob1_pvc", quantite: 1, coloris: "blanc", hs_nb_profils: "", hs_t_coupe: "", hs_t_montage: "", hs_t_vitrage: "", hs_op_montage: "jp", hs_op_vitrage: "quentin", hs_notes: "" };
const emptyVitrage = { composition: "4/16/4", quantite: "1", surface_m2: "", fournisseur: "isula", cmd_passee: false, date_reception: "" };
const FOURNISSEURS_VITRAGE = [
  { id: "isula",  label: "ISULA VITRAGE" },
  { id: "sigma",  label: "SIGMA" },
  { id: "emaver", label: "EMAVER" },
  { id: "gps",    label: "GPS" },
  { id: "autre",  label: "Autre" },
];
const TYPES_COMMANDE = [
  { id: "chantier_pro", label: "Chantier PRO" },
  { id: "chantier_par", label: "Chantier PAR" },
  { id: "sav",          label: "SAV" },
  { id: "diffus",       label: "DIFFUS" },
];

const empty = {
  num_commande: "", client: "", ref_chantier: "",
  zone: ZONES[0], priorite: "normale", type_commande: "", atelier: "SIAL", montant_ht: "",
  semaine_theorique: "", semaine_atteignable: "",
  date_alu: "", date_pvc: "", date_accessoires: "",
  date_panneau_porte: "", date_volet_roulant: "",
  date_livraison_souhaitee: "",
  aucun_vitrage: false,
  cmd_alu_passee: false, cmd_pvc_passee: false, cmd_accessoires_passee: false,
  cmd_panneau_passee: false, cmd_volet_passee: false,
  cmd_alu_necessaire: false, cmd_pvc_necessaire: false, cmd_accessoires_necessaire: false,
  cmd_panneau_necessaire: false, cmd_volet_necessaire: false,
  lignes: [{ ...emptyLigne }],
  vitrages: [{ ...emptyVitrage }],
};

type FormType = typeof empty;

function cmdToForm(cmd: any): FormType {
  const lignes = cmd.lignes?.length > 0 ? cmd.lignes : [];
  const vitrages = cmd.vitrages?.length > 0
    ? cmd.vitrages.map((v: any) => ({ composition: v.composition || "4/16/4", quantite: String(v.quantite || "1"), surface_m2: v.surface_m2 || "", fournisseur: v.fournisseur || "isula", cmd_passee: v.cmd_passee || false, date_reception: v.date_reception || "" }))
    : [];
  return {
    num_commande: cmd.num_commande || "", client: cmd.client || "", ref_chantier: cmd.ref_chantier || "",
    zone: cmd.zone || ZONES[0], priorite: cmd.priorite || "normale", type_commande: cmd.type_commande || "", atelier: cmd.atelier || "SIAL", montant_ht: cmd.montant_ht != null ? String(cmd.montant_ht) : "",
    semaine_theorique: cmd.semaine_theorique || "", semaine_atteignable: cmd.semaine_atteignable || "",
    date_alu: cmd.date_alu || "", date_pvc: cmd.date_pvc || "", date_accessoires: cmd.date_accessoires || "",
    date_panneau_porte: cmd.date_panneau_porte || "", date_volet_roulant: cmd.date_volet_roulant || "",
    date_livraison_souhaitee: cmd.date_livraison_souhaitee || "",
    aucun_vitrage: cmd.aucun_vitrage || false,
    cmd_alu_passee: cmd.cmd_alu_passee || false, cmd_pvc_passee: cmd.cmd_pvc_passee || false, cmd_accessoires_passee: cmd.cmd_accessoires_passee || false,
    cmd_panneau_passee: cmd.cmd_panneau_passee || false, cmd_volet_passee: cmd.cmd_volet_passee || false,
    cmd_alu_necessaire: cmd.cmd_alu_necessaire || false, cmd_pvc_necessaire: cmd.cmd_pvc_necessaire || false,
    cmd_accessoires_necessaire: cmd.cmd_accessoires_necessaire || false,
    cmd_panneau_necessaire: cmd.cmd_panneau_necessaire || false, cmd_volet_necessaire: cmd.cmd_volet_necessaire || false,
    lignes, vitrages,
  };
}

// ── Parseur Pro F2 ────────────────────────────────────────────────────────────
type ProF2Result = {
  numCommande: string;
  clientName: string;
  compositions: Array<{ code: string; desc: string; quantite: number; surface_m2: number }>;
};

function parseProF2(raw: string): ProF2Result | null {
  // Normalise : si pas de tabs, convertir les espaces multiples
  const text = raw.includes("\t") ? raw : raw.replace(/ {3,}/g, "\t");
  const lines = text.split("\n");

  // Chercher n° commande et client dans l'entête
  let numCommande = "";
  let clientName = "";
  for (const line of lines) {
    const m = line.match(/(O_\d{4}-\d{4})\s*[-–]\s*([A-ZÉÈÊÀÂÙÛÔÎÏÜ][A-ZÉÈÊÀÂÙÛÔÎÏÜ\s\-]+)/i);
    if (m) {
      numCommande = m[1];
      clientName = m[2].trim().replace(/\s+[A-Z]\s*$/, "").trim(); // enlever suffixe "A" ou "B"
      break;
    }
  }

  // Trouver la section (VITRAGES)
  let inVitrages = false;
  const groups: Record<string, { code: string; desc: string; quantite: number; surface_m2: number }> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.includes("(VITRAGES)")) { inVitrages = true; continue; }
    if (!inVitrages) continue;
    if (trimmed.startsWith("Totaux")) break;
    if (!trimmed) continue;

    const cols = trimmed.split("\t").map(c => c.trim());
    if (cols.length < 9) continue;

    const code = cols[0];
    // Ignorer les lignes d'entête : Code, Description, lignes vides, multi-ligne header
    if (!code || code === "Code" || code === "(* Surface facturable)" || !/^[\d]|^SP/.test(code)) continue;

    const desc = cols[2] || code;
    // Surface : "* 0,50  m²" ou "0,52  m²" → valeur par pièce
    const surfStr = (cols[7] || "").replace(/\*/g, "").replace(/m²/gi, "").replace(",", ".").trim();
    const surfParPiece = parseFloat(surfStr) || 0;
    const qte = parseInt(cols[8]) || 0;
    if (qte === 0) continue;

    if (!groups[code]) groups[code] = { code, desc, quantite: 0, surface_m2: 0 };
    groups[code].quantite += qte;
    groups[code].surface_m2 = Math.round((groups[code].surface_m2 + surfParPiece * qte) * 100) / 100;
  }

  const compositions = Object.values(groups);
  if (compositions.length === 0) return null;
  return { numCommande, clientName, compositions };
}

export default function SaisieCommande({ onAjouter, commande, onModifier }: { onAjouter: (cmd: any) => void; commande?: any; onModifier?: (cmd: any) => void }) {
  const [f, setF] = useState<FormType>(commande ? cmdToForm(commande) : empty);
  const set = (k: keyof FormType, v: any) => setF(p => ({ ...p, [k]: v }));
  const setLigne = (i: number, k: string, v: any) => setF(p => { const l = [...p.lignes]; l[i] = { ...l[i], [k]: v }; return { ...p, lignes: l }; });
  const addLigne = () => setF(p => ({ ...p, lignes: [...p.lignes, { ...emptyLigne }] }));
  const delLigne = (i: number) => setF(p => ({ ...p, lignes: p.lignes.filter((_, j) => j !== i) }));
  const setVitrage = (i: number, k: string, v: any) => setF(p => { const v2 = [...p.vitrages]; v2[i] = { ...v2[i], [k]: v }; return { ...p, vitrages: v2 }; });
  const addVitrage = () => setF(p => ({ ...p, vitrages: [...p.vitrages, { ...emptyVitrage }] }));
  const delVitrage = (i: number) => setF(p => ({ ...p, vitrages: p.vitrages.filter((_, j) => j !== i) }));

  // Import Pro F2
  const [showF2, setShowF2] = useState(false);
  const [pasteF2, setPasteF2] = useState("");
  const [previewF2, setPreviewF2] = useState<ProF2Result | null>(null);
  const [errF2, setErrF2] = useState("");
  const parseAndPreview = () => {
    setErrF2("");
    const result = parseProF2(pasteF2);
    if (!result) { setErrF2("Aucune donnée vitrage trouvée — vérifiez que le texte contient bien la section (VITRAGES)."); setPreviewF2(null); }
    else setPreviewF2(result);
  };
  const applyF2 = () => {
    if (!previewF2) return;
    const newVitrages = previewF2.compositions.map(c => ({
      ...emptyVitrage,
      composition: c.desc || c.code,
      quantite: String(c.quantite),
      surface_m2: String(c.surface_m2),
      fournisseur: "isula",
    }));
    setF(p => ({ ...p, vitrages: newVitrages }));
    setShowF2(false);
    setPasteF2("");
    setPreviewF2(null);
  };

  const premiereLigne = f.lignes?.[0] || emptyLigne;
  const dd = dateDemarrage({ date_alu: f.date_alu, date_pvc: f.date_pvc, date_accessoires: f.date_accessoires });
  const isHS = premiereLigne.type === "hors_standard";
  const isInterv = premiereLigne.type === "intervention_chantier";
  const hsTemps = (isHS || isInterv) ? { nb_profils: premiereLigne.hs_nb_profils, t_coupe: premiereLigne.hs_t_coupe, t_montage: premiereLigne.hs_t_montage, t_vitrage: premiereLigne.hs_t_vitrage, operateur_montage: premiereLigne.hs_op_montage || "jp", operateur_vitrage: premiereLigne.hs_op_vitrage || "quentin", notes: premiereLigne.hs_notes } : null;
  const qteTotale = f.lignes.reduce((s, l) => s + (parseInt(String(l.quantite)) || 0), 0);
  const dlAuto = () => {
    if (!dd || f.lignes.length === 0) return "";
    const cc = calcCheminCritique({ type: premiereLigne.type, quantite: qteTotale, hsTemps, date_alu: f.date_alu, date_pvc: f.date_pvc, date_accessoires: f.date_accessoires, date_panneau_porte: f.date_panneau_porte, date_volet_roulant: f.date_volet_roulant });
    return cc?.dateLivraisonAuPlusTot || "";
  };
  const dlReelle = dlAuto;
  const t = f.lignes.length > 0 ? calcTempsType(premiereLigne.type, qteTotale, hsTemps) : null;

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
      <optgroup label="── SAV / Intervention"><option value="intervention_chantier">Intervention Chantier</option></optgroup>
    </select>
  );

  const submit = () => {
    if (!f.client || !f.num_commande) return;
    const premType = f.lignes[0]?.type || null;
    const premHS = f.lignes[0]?.type === "hors_standard" ? { nb_profils: f.lignes[0].hs_nb_profils, t_coupe: f.lignes[0].hs_t_coupe, t_montage: f.lignes[0].hs_t_montage, t_vitrage: f.lignes[0].hs_t_vitrage, operateur_montage: f.lignes[0].hs_op_montage || "jp", operateur_vitrage: f.lignes[0].hs_op_vitrage || "quentin" } : null;
    const result = { ...f, id: commande?.id || Date.now(), type: premType, quantite: qteTotale, hsTemps: premHS, date_livraison_souhaitee: f.date_livraison_souhaitee || dlReelle() || dlAuto() };
    if (commande && onModifier) { onModifier(result); } else { onAjouter(result); }
    setF(empty);
  };

  return (
    <Card>
      <H c={commande ? C.blue : C.orange}>{commande ? `Modifier — ${commande.num_commande || commande.client}` : "Nouvelle commande"}</H>
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
          <div><label style={{ fontSize: 10, color: C.sec, display: "block", marginBottom: 3 }}>TYPE COMMANDE</label><select style={inp} value={f.type_commande} onChange={e => set("type_commande", e.target.value)}><option value="">— Sélectionner —</option>{TYPES_COMMANDE.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
          <div><label style={{ fontSize: 10, color: C.orange, display: "block", marginBottom: 3 }}>ATELIER</label><select style={{ ...inp, borderColor: C.orange+"66" }} value={f.atelier} onChange={e => set("atelier", e.target.value)}><option value="SIAL">SIAL</option><option value="ISULA VITRAGE">ISULA VITRAGE</option></select></div>
          <div><label style={{ fontSize: 10, color: C.sec, display: "block", marginBottom: 3 }}>PRIORITÉ</label><select style={inp} value={f.priorite} onChange={e => set("priorite", e.target.value)}><option value="normale">Normale</option><option value="urgente">Urgente</option><option value="chantier_bloque">Chantier bloqué</option></select></div>
          <div><label style={{ fontSize: 10, color: C.green, display: "block", marginBottom: 3 }}>MONTANT HT (€)</label><input type="number" min={0} step={0.01} style={{ ...inp, borderColor: C.green+"66" }} value={f.montant_ht} onChange={e => set("montant_ht", e.target.value)} placeholder="ex: 12500.00" /></div>
          <div><label style={{ fontSize: 10, color: C.blue, display: "block", marginBottom: 3 }}>SEM. THÉORIQUE</label><input style={{ ...inp, borderColor: C.blue + "66" }} value={f.semaine_theorique} onChange={e => set("semaine_theorique", e.target.value)} placeholder="ex: S18-2026" /></div>
          <div><label style={{ fontSize: 10, color: C.green, display: "block", marginBottom: 3 }}>SEM. ATTEIGNABLE</label><input style={{ ...inp, borderColor: C.green + "66" }} value={f.semaine_atteignable} onChange={e => set("semaine_atteignable", e.target.value)} placeholder="ex: S20-2026" /></div>
        </div>
      </div>

      <div style={{ padding: 10, background: C.bg, borderRadius: 5, border: `1px solid ${C.border}`, marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: C.purple, fontWeight: 700 }}>MENUISERIES</div>
          <button onClick={addLigne} style={{ padding: "3px 10px", background: C.purple + "33", border: `1px solid ${C.purple}`, borderRadius: 4, color: C.purple, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>+ Ajouter ligne</button>
        </div>
        {f.lignes.length === 0 && (
          <div style={{ fontSize: 11, color: C.muted, padding: "8px 0", fontStyle: "italic" }}>Aucune menuiserie à fabriquer — accessoire / intervention SAV uniquement.</div>
        )}
        {f.lignes.map((lg, i) => {
          const tmLg = TYPES_MENUISERIE[lg.type];
          const isHSLg = lg.type === "hors_standard";
          const isIntervLg = lg.type === "intervention_chantier";
          const OPERATEURS = [{ id: "jp", l: "Jean-Pierre" }, { id: "michel", l: "Michel" }, { id: "jf", l: "Jean-François" }, { id: "quentin", l: "Quentin" }, { id: "bruno", l: "Bruno" }, { id: "alain", l: "Alain" }];
          return (
            <div key={i} style={{ marginBottom: 8, padding: 8, background: C.s1, borderRadius: 4, border: `1px solid ${isIntervLg ? C.orange + "66" : C.border}` }}>
              <div style={{ display: "grid", gridTemplateColumns: isIntervLg ? "2fr auto" : "2fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
                <div><label style={{ fontSize: 9, color: isIntervLg ? C.orange : C.sec, display: "block", marginBottom: 2 }}>TYPE</label>{selectType(lg.type, v => setLigne(i, "type", v))}</div>
                {!isIntervLg && <div><label style={{ fontSize: 9, color: C.sec, display: "block", marginBottom: 2 }}>QTÉ</label><input type="number" min={1} style={inp} value={lg.quantite} onChange={e => setLigne(i, "quantite", Math.max(1, parseInt(e.target.value) || 1))} /></div>}
                {!isIntervLg && <div>
                  <label style={{ fontSize: 9, color: C.sec, display: "block", marginBottom: 2 }}>COLORIS</label>
                  <input list="coloris-list" style={inp} value={lg.coloris} onChange={e => setLigne(i, "coloris", e.target.value)} placeholder="ex: Blanc, RAL 7016…" />
                  <datalist id="coloris-list">
                    <option value="Blanc" /><option value="Blanc laqué" /><option value="Bois" /><option value="Gris anthracite" /><option value="Noir" /><option value="Aluminium" /><option value="Sable" /><option value="RAL 7016" /><option value="RAL 9005" /><option value="RAL 9010" /><option value="Bicolore" />
                  </datalist>
                </div>}
                <button onClick={() => delLigne(i)} style={{ padding: "6px 10px", background: "none", border: `1px solid ${C.border}`, borderRadius: 4, color: C.sec, cursor: "pointer", fontSize: 11 }}>✕</button>
              </div>
              {tmLg && !isHSLg && !isIntervLg && <div style={{ marginTop: 4, fontSize: 9, color: C.muted }} className="mono">{tmLg.profils_total} profils · {tmLg.dormant} dorm. · {tmLg.ouvrants} ouv.</div>}
              {isHSLg && (
                <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6 }}>
                  {[{ l: "Nb profils", k: "hs_nb_profils" }, { l: "Coupe total (min)", k: "hs_t_coupe" }, { l: "Montage total (min)", k: "hs_t_montage" }, { l: "Vitrage total (min)", k: "hs_t_vitrage" }].map(x => (
                    <div key={x.k}><label style={{ fontSize: 8, color: C.purple, display: "block", marginBottom: 2 }}>{x.l}</label><input type="number" min={0} style={{ ...inp, fontSize: 11, padding: "4px 6px" }} value={(lg as any)[x.k] || ""} onChange={e => setLigne(i, x.k, e.target.value)} /></div>
                  ))}
                  <div><label style={{ fontSize: 8, color: C.purple, display: "block", marginBottom: 2 }}>Op. vitrage</label><select style={{ ...inp, fontSize: 11, padding: "4px 6px" }} value={lg.hs_op_vitrage || "quentin"} onChange={e => setLigne(i, "hs_op_vitrage", e.target.value)}>{[{ id: "quentin", l: "Quentin" }, { id: "michel", l: "Michel" }, { id: "jf", l: "Jean-François" }, { id: "jp", l: "Jean-Pierre" }, { id: "bruno", l: "Bruno" }].map(o => <option key={o.id} value={o.id}>{o.l}</option>)}</select></div>
                </div>
              )}
              {isIntervLg && (
                <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 6 }}>
                  <div>
                    <label style={{ fontSize: 8, color: C.orange, display: "block", marginBottom: 2 }}>TEMPS INTERVENTION (min)</label>
                    <input type="number" min={0} style={{ ...inp, fontSize: 11, padding: "4px 6px", borderColor: C.orange + "66", color: C.orange, fontWeight: 700 }} value={lg.hs_t_montage || ""} onChange={e => setLigne(i, "hs_t_montage", e.target.value)} placeholder="ex: 120" />
                  </div>
                  <div>
                    <label style={{ fontSize: 8, color: C.orange, display: "block", marginBottom: 2 }}>OPÉRATEUR</label>
                    <select style={{ ...inp, fontSize: 11, padding: "4px 6px" }} value={lg.hs_op_montage || "jp"} onChange={e => setLigne(i, "hs_op_montage", e.target.value)}>
                      {OPERATEURS.map(o => <option key={o.id} value={o.id}>{o.l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 8, color: C.orange, display: "block", marginBottom: 2 }}>NOTES / DESCRIPTION</label>
                    <input style={{ ...inp, fontSize: 11, padding: "4px 6px" }} value={lg.hs_notes || ""} onChange={e => setLigne(i, "hs_notes", e.target.value)} placeholder="ex: Remplacement poignée, réglage…" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ padding: 10, background: C.bg, borderRadius: 5, border: `1px solid ${C.border}`, marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 10, color: C.teal, fontWeight: 700 }}>VITRAGES ISOLANTS (m²)</div>
            <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 10, color: f.aucun_vitrage ? C.orange : C.sec }}>
              <input type="checkbox" checked={f.aucun_vitrage} onChange={e => set("aucun_vitrage", e.target.checked)} />
              Aucun vitrage
            </label>
            {!f.aucun_vitrage && (
              <button type="button" onClick={() => { setShowF2(p => !p); setPreviewF2(null); setErrF2(""); }}
                style={{ padding: "2px 9px", background: showF2 ? C.cyan+"33" : "none", border: `1px solid ${showF2 ? C.cyan : C.border}`, borderRadius: 4, color: showF2 ? C.cyan : C.sec, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                📥 Import Pro F2
              </button>
            )}
          </div>
          {!f.aucun_vitrage && <button onClick={addVitrage} style={{ padding: "3px 10px", background: C.teal + "33", border: `1px solid ${C.teal}`, borderRadius: 4, color: C.teal, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>+ Composition</button>}
        </div>
        {/* ── Panneau Import Pro F2 ── */}
        {showF2 && !f.aucun_vitrage && (
          <div style={{ marginBottom: 10, padding: 10, background: C.s2, border: `1px solid ${C.cyan}44`, borderRadius: 5 }}>
            <div style={{ fontSize: 10, color: C.cyan, fontWeight: 700, marginBottom: 6 }}>IMPORT DEPUIS PRO F2</div>
            <div style={{ fontSize: 10, color: C.sec, marginBottom: 6 }}>
              Dans Pro F2 : ouvrir la commande → sélectionner tout le contenu (Ctrl+A) → copier (Ctrl+C) → coller ci-dessous.
            </div>
            <textarea
              value={pasteF2} onChange={e => { setPasteF2(e.target.value); setPreviewF2(null); setErrF2(""); }}
              placeholder="Collez ici le contenu copié depuis l'export Pro F2…"
              style={{ width: "100%", boxSizing: "border-box", minHeight: 90, padding: "6px 8px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontSize: 11, resize: "vertical", outline: "none" }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
              <button type="button" onClick={parseAndPreview} disabled={!pasteF2.trim()}
                style={{ padding: "4px 14px", background: C.cyan+"33", border: `1px solid ${C.cyan}`, borderRadius: 4, color: C.cyan, fontSize: 11, fontWeight: 700, cursor: pasteF2.trim() ? "pointer" : "default", opacity: pasteF2.trim() ? 1 : 0.4 }}>
                Analyser
              </button>
              {errF2 && <span style={{ fontSize: 10, color: C.red }}>{errF2}</span>}
            </div>
            {previewF2 && (
              <div style={{ marginTop: 8 }}>
                {previewF2.numCommande && (
                  <div style={{ fontSize: 10, color: C.sec, marginBottom: 6 }}>
                    Commande détectée : <span style={{ color: C.orange, fontWeight: 700 }}>{previewF2.numCommande}</span>
                    {previewF2.clientName && <span> — {previewF2.clientName}</span>}
                  </div>
                )}
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                  <thead>
                    <tr style={{ color: C.sec }}>
                      <th style={{ textAlign: "left", padding: "3px 6px", borderBottom: `1px solid ${C.border}` }}>Composition</th>
                      <th style={{ textAlign: "center", padding: "3px 6px", borderBottom: `1px solid ${C.border}` }}>Qté</th>
                      <th style={{ textAlign: "right", padding: "3px 6px", borderBottom: `1px solid ${C.border}` }}>Surface facturable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewF2.compositions.map((c, i) => (
                      <tr key={i} style={{ color: C.text }}>
                        <td style={{ padding: "3px 6px", fontFamily: "monospace" }}>{c.desc}</td>
                        <td style={{ padding: "3px 6px", textAlign: "center", color: C.purple, fontWeight: 700 }}>{c.quantite}</td>
                        <td style={{ padding: "3px 6px", textAlign: "right", color: C.teal, fontWeight: 700 }}>{c.surface_m2.toFixed(2)} m²</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: `1px solid ${C.border}`, color: C.sec }}>
                      <td style={{ padding: "4px 6px", fontWeight: 700 }}>TOTAL</td>
                      <td style={{ padding: "4px 6px", textAlign: "center", color: C.purple, fontWeight: 700 }}>{previewF2.compositions.reduce((s, c) => s + c.quantite, 0)}</td>
                      <td style={{ padding: "4px 6px", textAlign: "right", color: C.teal, fontWeight: 700 }}>{previewF2.compositions.reduce((s, c) => s + c.surface_m2, 0).toFixed(2)} m²</td>
                    </tr>
                  </tbody>
                </table>
                <button type="button" onClick={applyF2}
                  style={{ marginTop: 8, width: "100%", padding: "6px 0", background: C.cyan, border: "none", borderRadius: 4, color: "#000", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  ✓ Appliquer ces {previewF2.compositions.length} composition{previewF2.compositions.length > 1 ? "s" : ""} aux vitrages
                </button>
              </div>
            )}
          </div>
        )}

        {f.aucun_vitrage ? (
          <div style={{ fontSize: 11, color: C.orange, padding: "6px 0" }}>Sans vitrage isolant — fourni ou non applicable.</div>
        ) : (
          <>
            {f.vitrages.length === 0 && (
              <div style={{ fontSize: 11, color: C.muted, padding: "8px 0", fontStyle: "italic" }}>Aucun vitrage isolant — cliquer "+ Composition" pour en ajouter.</div>
            )}
            {f.vitrages.map((vg, i) => {
              const isExterieur = (vg as any).fournisseur && (vg as any).fournisseur !== "isula";
              const cmdPassee = (vg as any).cmd_passee || false;
              const fournisseurColor = isExterieur ? C.yellow : C.teal;
              return (
                <div key={i} style={{ marginBottom: 8, padding: 8, background: C.s1, borderRadius: 4, border: `1px solid ${isExterieur ? C.yellow + "55" : C.border}` }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 0.6fr 1fr 1.2fr auto", gap: 8, alignItems: "end" }}>
                    <div>
                  <label style={{ fontSize: 9, color: C.sec, display: "block", marginBottom: 2 }}>COMPOSITION</label>
                  <input list="compo-datalist" style={inp} value={vg.composition} onChange={e => setVitrage(i, "composition", e.target.value)} placeholder="ex: 4/16/4 ou code Pro F2…" />
                  <datalist id="compo-datalist">
                    {["4/16/4", "4/12/4", "4/20/4", "44.2/16/4 feuilleté", "VSG feuilleté", "Contrôle solaire", "Autre"].map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
                    <div><label style={{ fontSize: 9, color: C.sec, display: "block", marginBottom: 2 }}>QTÉ</label><input type="number" min={1} style={{ ...inp, color: C.purple, fontWeight: 700 }} value={vg.quantite} onChange={e => setVitrage(i, "quantite", e.target.value)} placeholder="1" /></div>
                    <div><label style={{ fontSize: 9, color: C.sec, display: "block", marginBottom: 2 }}>SURFACE TOTALE (m²)</label><input type="number" min={0} step={0.01} style={{ ...inp, color: C.teal, fontWeight: 700 }} value={vg.surface_m2} onChange={e => setVitrage(i, "surface_m2", e.target.value)} placeholder="ex: 3.60" /></div>
                    <div>
                      <label style={{ fontSize: 9, color: fournisseurColor, display: "block", marginBottom: 2 }}>FOURNISSEUR</label>
                      <select style={{ ...inp, borderColor: fournisseurColor + "66", color: fournisseurColor, fontWeight: 700 }} value={(vg as any).fournisseur || "isula"} onChange={e => setVitrage(i, "fournisseur", e.target.value)}>
                        {FOURNISSEURS_VITRAGE.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                      </select>
                    </div>
                    <button onClick={() => delVitrage(i)} style={{ padding: "6px 10px", background: "none", border: `1px solid ${C.border}`, borderRadius: 4, color: C.sec, cursor: "pointer", fontSize: 11 }}>✕</button>
                  </div>
                  {isExterieur && (
                    <div style={{ marginTop: 6, display: "flex", gap: 10, alignItems: "center" }}>
                      <button type="button" onClick={() => setVitrage(i, "cmd_passee", !cmdPassee)}
                        style={{ fontSize: 10, padding: "3px 10px", borderRadius: 3, border: `1px solid ${cmdPassee ? C.green : C.red}`, background: "none", color: cmdPassee ? C.green : C.red, cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" }}>
                        {cmdPassee ? "✓ Commandé" : "À commander"}
                      </button>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 9, color: C.sec, display: "block", marginBottom: 2 }}>DATE RÉCEPTION PRÉVUE</label>
                        <input type="date" style={{ ...inp, fontSize: 11, padding: "4px 8px", borderColor: C.yellow + "66" }} value={(vg as any).date_reception || ""} onChange={e => setVitrage(i, "date_reception", e.target.value)} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {f.vitrages.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 10, color: C.muted }}>
                Total : <span className="mono" style={{ color: C.teal, fontWeight: 700 }}>{Math.round(f.vitrages.reduce((s, v) => s + (parseFloat(v.surface_m2) || 0), 0) * 100) / 100} m²</span>
                <span style={{ marginLeft: 12 }}>{f.vitrages.reduce((s, v) => s + (parseInt(v.quantite) || 0), 0)} unité(s)</span>
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ marginTop: 10, padding: 12, background: C.bg, borderRadius: 6, border: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 10, color: C.teal, fontWeight: 700, marginBottom: 10 }}>ACHATS MATIÈRES</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            { id: "alu",         label: "Profilés ALU",      color: C.cyan,   necKey: "cmd_alu_necessaire",         passeeKey: "cmd_alu_passee",         dateKey: "date_alu" },
            { id: "pvc",         label: "Profilés PVC",      color: C.blue,   necKey: "cmd_pvc_necessaire",         passeeKey: "cmd_pvc_passee",         dateKey: "date_pvc" },
            { id: "accessoires", label: "Accessoires",       color: C.orange, necKey: "cmd_accessoires_necessaire", passeeKey: "cmd_accessoires_passee", dateKey: "date_accessoires" },
            { id: "panneau",     label: "Panneau porte",     color: C.yellow, necKey: "cmd_panneau_necessaire",     passeeKey: "cmd_panneau_passee",     dateKey: "date_panneau_porte" },
            { id: "volet",       label: "Volet roulant",     color: C.purple, necKey: "cmd_volet_necessaire",       passeeKey: "cmd_volet_passee",       dateKey: "date_volet_roulant" },
          ].map(({ id, label, color, necKey, passeeKey, dateKey }) => {
            const nec   = (f as any)[necKey]   as boolean;
            const pass  = (f as any)[passeeKey] as boolean;
            const date  = (f as any)[dateKey]  as string;
            return (
              <div key={id} style={{ padding: "8px 10px", background: C.s1, borderRadius: 5, border: `1px solid ${nec ? color + "99" : C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: nec ? 6 : 0 }}>
                  <span style={{ fontSize: 10, color: nec ? color : C.muted, fontWeight: 600 }}>{label}</span>
                  <button type="button" onClick={() => set(necKey as keyof FormType, !nec)} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 3, border: `1px solid ${nec ? color : C.border}`, background: nec ? color + "22" : "none", color: nec ? color : C.sec, cursor: "pointer", fontWeight: 700 }}>
                    {nec ? "✓ Nécessaire" : "Non requis"}
                  </button>
                </div>
                {nec && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="date" style={{ ...inp, flex: 1, fontSize: 11, padding: "4px 6px", borderColor: color + "66" }} value={date} onChange={e => set(dateKey as keyof FormType, e.target.value)} />
                    <button type="button" onClick={() => set(passeeKey as keyof FormType, !pass)} style={{ fontSize: 9, padding: "4px 8px", borderRadius: 3, border: `1px solid ${pass ? C.green : C.red}`, background: "none", color: pass ? C.green : C.red, cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" }}>
                      {pass ? "✓ Commandé" : "À commander"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {dd && <div style={{ marginTop: 8, fontSize: 11, color: C.sec }}>Démarrage fab estimé : <span style={{ color: C.teal, fontWeight: 600 }} className="mono">{fmtDate(dd)}</span></div>}
      </div>

      {t && f.type_commande !== "sav" && f.type_commande !== "diffus" && (
        <div style={{ marginTop: 10, padding: 10, background: C.bg, borderRadius: 5, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 10, color: C.sec, marginBottom: 8 }}>TEMPS DE FABRICATION{isHS ? " (totaux saisis)" : ` (calculés · ${qteTotale} pièce${qteTotale > 1 ? "s" : ""})`}</div>
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

      <button onClick={submit} style={{ marginTop: 12, width: "100%", padding: "9px 0", background: commande ? C.blue : "#E65100", border: "none", borderRadius: 5, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", letterSpacing: "0.06em" }}>
        {commande ? "✓ ENREGISTRER LES MODIFICATIONS" : "+ AJOUTER COMMANDE"}
      </button>
    </Card>
  );
}
