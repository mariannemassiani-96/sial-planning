"use client";
import { useState, useMemo } from "react";
import { TYPES_MENUISERIE, ZONES, C, CFAM, calcTempsType, calcCheminCritique, dateDemarrage, hm, fmtDate, CommandeCC } from "@/lib/sial-data";
import { H, Bdg, Card } from "@/components/ui";

const ETAPES = [
  { key: "etape_coupe_ok",   label: "Coupe",   c: "#42A5F5" },
  { key: "etape_montage_ok", label: "Montage", c: "#FFA726" },
  { key: "etape_vitrage_ok", label: "Vitrage", c: "#26C6DA", skipIfAucunVitrage: true },
  { key: "etape_palette_ok", label: "Palette", c: "#66BB6A" },
];

const POSTES_FILTRE = [
  { id: "coupe",      label: "Coupe / Soudure",       c: "#42A5F5" },
  { id: "frappes",    label: "Montage Frappes",        c: "#FFA726" },
  { id: "coulissant", label: "Coulissant / Glandage",  c: "#66BB6A" },
  { id: "vitrage",    label: "Vitrage Ouvrants",       c: "#26C6DA" },
  { id: "palette",    label: "Contrôle / Palette",     c: "#4DB6AC" },
];

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
function weekLabel(mon: string): string {
  const fri = addDays(mon, 4);
  const fmt = (s: string) => new Date(s+"T00:00:00").toLocaleDateString("fr-FR",{day:"2-digit",month:"short"});
  return `Sem. ${getWeekNum(mon)} — ${fmt(mon)} → ${fmt(fri)}`;
}

// ── Poste matching ────────────────────────────────────────────────────────────
function hasPoste(c: CommandeCC, posteId: string): boolean {
  const cc = calcCheminCritique(c);
  if (!cc) return false;
  const fam = TYPES_MENUISERIE[c.type]?.famille || "";
  return cc.etapes.some(et => {
    if (et.duree_min === 0 || et.id === "options") return false;
    if (posteId === "coupe")      return et.id === "coupe";
    if (posteId === "frappes")    return et.id === "montage" && fam !== "coulissant" && fam !== "glandage";
    if (posteId === "coulissant") return et.id === "montage" && (fam === "coulissant" || fam === "glandage");
    if (posteId === "vitrage")    return et.id === "vitrage";
    if (posteId === "palette")    return et.id === "palette";
    return false;
  });
}

function hasEtapeInWeek(c: CommandeCC, wMon: string): boolean {
  const cc = calcCheminCritique(c);
  if (!cc) return false;
  const wFri = addDays(wMon, 4);
  return cc.etapes.some(et => et.duree_min > 0 && et.debut <= wFri && et.fin >= wMon);
}

// ── Composant ─────────────────────────────────────────────────────────────────
export default function Carnet({ commandes, onDelete, onEdit, onPatch }: {
  commandes: CommandeCC[];
  onDelete: (id: any) => void;
  onEdit: (cmd: CommandeCC) => void;
  onPatch: (id: string, updates: Record<string, boolean>) => void;
}) {
  const todayMonday = getMondayOf(localStr(new Date()));

  const [search,      setSearch]      = useState("");
  const [filterZone,  setFilterZone]  = useState("");
  const [filterPoste, setFilterPoste] = useState("");
  const [filterWeek,  setFilterWeek]  = useState<string | null>(null);

  const sorted = useMemo(() =>
    [...commandes].sort((a, b) =>
      new Date(a.date_livraison_souhaitee || "").getTime() - new Date(b.date_livraison_souhaitee || "").getTime()
    ), [commandes]);

  const filtered = useMemo(() => sorted.filter(c => {
    const cmd = c as any;
    // Texte libre : client, num_commande, ref_chantier
    if (search) {
      const q = search.toLowerCase();
      const ok = (c.client || "").toLowerCase().includes(q)
        || (cmd.num_commande || "").toLowerCase().includes(q)
        || (cmd.ref_chantier || "").toLowerCase().includes(q);
      if (!ok) return false;
    }
    // Zone / chantier
    if (filterZone && cmd.zone !== filterZone) return false;
    // Poste
    if (filterPoste && !hasPoste(c, filterPoste)) return false;
    // Semaine
    if (filterWeek && !hasEtapeInWeek(c, filterWeek)) return false;
    return true;
  }), [sorted, search, filterZone, filterPoste, filterWeek]);

  const hasFilters = search || filterZone || filterPoste || filterWeek;
  const clearAll = () => { setSearch(""); setFilterZone(""); setFilterPoste(""); setFilterWeek(null); };

  return (
    <div>
      <H c={C.blue}>Carnet de commandes</H>

      {/* ── Barre de recherche & filtres ── */}
      <div style={{ background:C.s1, border:`1px solid ${C.border}`, borderRadius:6, padding:"10px 12px", marginBottom:14 }}>

        {/* Ligne 1 : recherche texte */}
        <div style={{ display:"flex", gap:8, marginBottom:8, alignItems:"center" }}>
          <div style={{ flex:1, position:"relative" }}>
            <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", fontSize:13, color:C.sec, pointerEvents:"none" }}>🔍</span>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher par client, N° commande, chantier…"
              style={{
                width:"100%", boxSizing:"border-box",
                padding:"6px 10px 6px 30px",
                background:C.bg, border:`1px solid ${search?C.blue:C.border}`,
                borderRadius:4, color:C.text, fontSize:12, outline:"none",
              }}
            />
          </div>
          {hasFilters && (
            <button onClick={clearAll} style={{ padding:"5px 12px", background:C.red+"22", border:`1px solid ${C.red}44`, borderRadius:4, color:C.red, fontSize:11, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>
              ✕ Effacer filtres
            </button>
          )}
        </div>

        {/* Ligne 2 : zone + poste + semaine */}
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>

          {/* Zone */}
          <select value={filterZone} onChange={e => setFilterZone(e.target.value)}
            style={{ padding:"5px 10px", background:filterZone?C.teal+"22":C.bg, border:`1px solid ${filterZone?C.teal:C.border}`, borderRadius:4, color:filterZone?C.teal:C.sec, fontSize:11, cursor:"pointer" }}>
            <option value="">Toutes les zones</option>
            {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
          </select>

          {/* Poste */}
          <select value={filterPoste} onChange={e => setFilterPoste(e.target.value)}
            style={{ padding:"5px 10px", background:filterPoste?C.orange+"22":C.bg, border:`1px solid ${filterPoste?C.orange:C.border}`, borderRadius:4, color:filterPoste?C.orange:C.sec, fontSize:11, cursor:"pointer" }}>
            <option value="">Tous les postes</option>
            {POSTES_FILTRE.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>

          {/* Semaine */}
          <div style={{ display:"flex", gap:4, alignItems:"center" }}>
            <button
              onClick={() => setFilterWeek(p => p ? addDays(p, -7) : addDays(todayMonday, -7))}
              style={{ padding:"4px 8px", background:C.bg, border:`1px solid ${C.border}`, borderRadius:4, color:C.sec, cursor:"pointer", fontSize:12 }}>‹</button>
            <span style={{ fontSize:11, color:filterWeek?C.purple:C.sec, fontWeight:filterWeek?700:400, minWidth:200, textAlign:"center",
              padding:"4px 8px", background:filterWeek?C.purple+"22":C.bg, border:`1px solid ${filterWeek?C.purple:C.border}`, borderRadius:4 }}>
              {filterWeek ? weekLabel(filterWeek) : "Toutes les semaines"}
            </span>
            <button
              onClick={() => setFilterWeek(p => p ? addDays(p, 7) : addDays(todayMonday, 7))}
              style={{ padding:"4px 8px", background:C.bg, border:`1px solid ${C.border}`, borderRadius:4, color:C.sec, cursor:"pointer", fontSize:12 }}>›</button>
            {!filterWeek && (
              <button onClick={() => setFilterWeek(todayMonday)}
                style={{ padding:"4px 10px", background:C.purple+"22", border:`1px solid ${C.purple}44`, borderRadius:4, color:C.purple, cursor:"pointer", fontSize:10, fontWeight:700 }}>
                Cette semaine
              </button>
            )}
            {filterWeek && (
              <button onClick={() => setFilterWeek(null)}
                style={{ padding:"4px 8px", background:C.bg, border:`1px solid ${C.border}`, borderRadius:4, color:C.sec, cursor:"pointer", fontSize:10 }}>
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Compteur résultats */}
        <div style={{ marginTop:6, fontSize:10, color:C.sec }}>
          {hasFilters
            ? <><span style={{ color:filtered.length===0?C.red:C.blue, fontWeight:700 }}>{filtered.length}</span> résultat{filtered.length!==1?"s":""} sur {sorted.length} commande{sorted.length!==1?"s":""}</>
            : <>{sorted.length} commande{sorted.length!==1?"s":""}</>
          }
          {filterPoste && <span style={{ marginLeft:8, color:C.orange }}>· Poste : {POSTES_FILTRE.find(p=>p.id===filterPoste)?.label}</span>}
          {filterWeek && <span style={{ marginLeft:8, color:C.purple }}>· {weekLabel(filterWeek)}</span>}
        </div>
      </div>

      {/* ── Liste ── */}
      {filtered.length === 0 && (
        <div style={{ textAlign:"center", padding:40, color:C.sec }}>
          {hasFilters ? "Aucune commande ne correspond aux filtres." : "Aucune commande."}
        </div>
      )}

      {filtered.map(c => {
        const tm = TYPES_MENUISERIE[c.type];
        const t = calcTempsType(c.type, c.quantite, c.hsTemps);
        const cc = calcCheminCritique(c);
        const jr = Math.round((new Date(c.date_livraison_souhaitee || "").getTime() - Date.now()) / 86400000);
        const jc = jr < 7 ? C.red : jr < 21 ? C.orange : C.green;
        const retardColor = cc?.critique ? C.red : cc?.enRetard ? C.orange : C.green;
        const cmd = c as any;

        const etapesApplicables = ETAPES.filter(e => !(e.skipIfAucunVitrage && cmd.aucun_vitrage));
        const toutTermine = etapesApplicables.every(e => !!cmd[e.key]);

        // Highlight active poste if filter is on
        const activePosteMatch = filterPoste && hasPoste(c, filterPoste)
          ? POSTES_FILTRE.find(p => p.id === filterPoste)
          : null;

        return (
          <Card key={String(c.id)} accent={activePosteMatch?.c || (cc?.critique ? C.red : c.priorite === "chantier_bloque" ? C.red : c.priorite === "urgente" ? C.orange : C.border)} style={{ marginBottom: 7 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                  <span className="mono" style={{ fontSize: 11, color: C.orange, fontWeight: 700 }}>{cmd.num_commande || "—"}</span>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{c.client}</span>
                  {cmd.ref_chantier && <Bdg t={cmd.ref_chantier} c={C.teal} />}
                  {cmd.zone && <Bdg t={cmd.zone} c={C.sec} />}
                  {tm && <Bdg t={tm.label} c={tm.famille === "hors_standard" ? C.purple : CFAM[tm.famille] || C.blue} />}
                  {(cmd.date_panneau_porte || cmd.date_volet_roulant) && <Bdg t="+ options" c={C.yellow} />}
                  {toutTermine && <Bdg t="✅ Terminé" c={C.green} />}
                  {activePosteMatch && <Bdg t={`En cours : ${activePosteMatch.label}`} c={activePosteMatch.c} />}
                  {cc?.enRetard
                    ? <Bdg t={cc.critique ? `CRITIQUE +${cc.retardJours}j` : `retard +${cc.retardJours}j`} c={retardColor} />
                    : cc ? <Bdg t={`OK ${Math.abs(cc.retardJours)}j marge`} c={C.green} /> : null}
                </div>
                <div style={{ fontSize: 10, color: C.sec, display: "flex", gap: 10, flexWrap: "wrap" }} className="mono">
                  <span>{c.quantite} pcs</span>
                  {t && <span>{hm(t.tTotal)} fab.</span>}
                  <span>Démarrage:{fmtDate(dateDemarrage(c))}</span>
                  {cc && <span style={{ color: retardColor }}>Au+tôt:{fmtDate(cc.dateLivraisonAuPlusTot)}</span>}
                  {cc?.dateCmdVitrage && <span style={{ color: C.cyan }}>ISULA:{fmtDate(cc.dateCmdVitrage)}</span>}
                  {cmd.aucun_vitrage && <span style={{ color: C.orange }}>Sans vitrage</span>}
                  {cmd.vitrages?.length > 0 && !cmd.aucun_vitrage && <span style={{ color: C.teal }}>{Math.round(cmd.vitrages.reduce((s: number, v: any) => s + (parseFloat(v.surface_m2) || 0), 0) * 100) / 100}m² vit.</span>}
                </div>
                {(cmd.cmd_alu_necessaire || cmd.cmd_pvc_necessaire || cmd.cmd_accessoires_necessaire || cmd.cmd_panneau_necessaire || cmd.cmd_volet_necessaire) && (
                  <div style={{ fontSize: 9, display: "flex", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                    {cmd.cmd_alu_necessaire && <span style={{ color: cmd.cmd_alu_passee ? C.green : C.red }}>{cmd.cmd_alu_passee ? "✓" : "⚠"} ALU{cmd.date_alu ? " "+fmtDate(cmd.date_alu) : ""}</span>}
                    {cmd.cmd_pvc_necessaire && <span style={{ color: cmd.cmd_pvc_passee ? C.green : C.red }}>{cmd.cmd_pvc_passee ? "✓" : "⚠"} PVC{cmd.date_pvc ? " "+fmtDate(cmd.date_pvc) : ""}</span>}
                    {cmd.cmd_accessoires_necessaire && <span style={{ color: cmd.cmd_accessoires_passee ? C.green : C.red }}>{cmd.cmd_accessoires_passee ? "✓" : "⚠"} Access.{cmd.date_accessoires ? " "+fmtDate(cmd.date_accessoires) : ""}</span>}
                    {cmd.cmd_panneau_necessaire && <span style={{ color: cmd.cmd_panneau_passee ? C.green : C.red }}>{cmd.cmd_panneau_passee ? "✓" : "⚠"} Panneau{cmd.date_panneau_porte ? " "+fmtDate(cmd.date_panneau_porte) : ""}</span>}
                    {cmd.cmd_volet_necessaire && <span style={{ color: cmd.cmd_volet_passee ? C.green : C.red }}>{cmd.cmd_volet_passee ? "✓" : "⚠"} Volet{cmd.date_volet_roulant ? " "+fmtDate(cmd.date_volet_roulant) : ""}</span>}
                  </div>
                )}

                {/* Suivi étapes */}
                <div style={{ marginTop: 7, display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 9, color: C.sec, fontWeight: 700, marginRight: 2 }}>ÉTAPES :</span>
                  {etapesApplicables.map(({ key, label, c: col }) => {
                    const done = !!cmd[key];
                    return (
                      <button key={key}
                        onClick={() => onPatch(String(c.id), { [key]: !done })}
                        title={done ? `Décocher "${label}"` : `Marquer "${label}" comme terminé`}
                        style={{
                          padding: "2px 9px", background: done ? col+"33" : C.s2,
                          border: `1px solid ${done ? col : C.border}`,
                          borderRadius: 4, fontSize: 10, color: done ? col : C.muted,
                          cursor: "pointer", fontWeight: done ? 700 : 400, transition: "all 0.15s",
                        }}>
                        {done ? "✓ " : ""}{label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ textAlign: "right", marginRight: 10 }}>
                <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: jc }}>J{jr >= 0 ? `-${jr}` : `+${Math.abs(jr)}`}</div>
                <div style={{ fontSize: 9, color: C.sec }}>{fmtDate(c.date_livraison_souhaitee)}</div>
              </div>
              <button onClick={() => onEdit(c)} style={{ background: "none", border: `1px solid ${C.blue}`, borderRadius: 3, color: C.blue, cursor: "pointer", padding: "3px 7px", fontSize: 11, marginRight: 4 }}>✎</button>
              <button onClick={() => { if (window.confirm(`Supprimer ${cmd.num_commande || c.client} ?`)) onDelete(c.id); }} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 3, color: C.sec, cursor: "pointer", padding: "3px 7px", fontSize: 11 }}>✕</button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
