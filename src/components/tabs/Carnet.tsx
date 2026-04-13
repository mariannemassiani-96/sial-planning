"use client";
import { useState, useMemo, useEffect, useCallback } from "react";
import { TYPES_MENUISERIE, ZONES, C, CFAM, calcTempsType, calcCheminCritique, dateDemarrage, hm, fmtDate, CommandeCC, getWeekNum as getWeekNumUtil } from "@/lib/sial-data";
import { H, Bdg, Card } from "@/components/ui";

// ── Commentaires ──────────────────────────────────────────────────────────────
type Commentaire = { id: string; auteur: string; texte: string; createdAt: string };

function CommentairesPanel({ commandeId }: { commandeId: string }) {
  const [items, setItems]   = useState<Commentaire[]>([]);
  const [texte, setTexte]   = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/commandes/${commandeId}/commentaires`);
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }, [commandeId]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!texte.trim() || saving) return;
    setSaving(true);
    const res = await fetch(`/api/commandes/${commandeId}/commentaires`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texte }),
    });
    if (res.ok) { const saved = await res.json(); setItems(p => [...p, saved]); setTexte(""); }
    setSaving(false);
  };

  const fmtTs = (s: string) => new Date(s).toLocaleString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });

  return (
    <div style={{ borderTop:`1px solid ${C.border}`, marginTop:8, paddingTop:8 }}>
      {loading ? (
        <div style={{ fontSize:10, color:C.sec }}>Chargement…</div>
      ) : (
        <>
          {items.length === 0 && <div style={{ fontSize:10, color:C.muted, marginBottom:6 }}>Aucun commentaire.</div>}
          {items.map(item => (
            <div key={item.id} style={{ marginBottom:6, background:C.s2, borderRadius:4, padding:"5px 8px" }}>
              <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:2 }}>
                <span style={{ fontSize:10, fontWeight:700, color:C.teal }}>{item.auteur}</span>
                <span style={{ fontSize:9, color:C.muted }}>{fmtTs(item.createdAt)}</span>
              </div>
              <div style={{ fontSize:11, color:C.text, whiteSpace:"pre-wrap" }}>{item.texte}</div>
            </div>
          ))}
          <div style={{ display:"flex", gap:6, marginTop:4 }}>
            <input
              value={texte} onChange={e => setTexte(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
              placeholder="Ajouter un commentaire… (Entrée pour envoyer)"
              style={{ flex:1, padding:"5px 8px", background:C.bg, border:`1px solid ${C.border}`, borderRadius:4, color:C.text, fontSize:11, outline:"none" }}
            />
            <button onClick={submit} disabled={saving || !texte.trim()}
              style={{ padding:"5px 12px", background:C.blue, border:"none", borderRadius:4, color:"#fff", fontSize:11, fontWeight:700, cursor:texte.trim()?"pointer":"default", opacity:texte.trim()?1:0.4 }}>
              Envoyer
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const STATUTS = [
  { id: "en_attente",            label: "En attente de validation", c: "#9E9E9E" },
  { id: "appro",                 label: "Commande APPRO",           c: "#FF9800" },
  { id: "fab",                   label: "Commande FAB",             c: "#2196F3" },
  { id: "fabrique",              label: "Fabriqué",                 c: "#00BCD4" },
  { id: "livre",                 label: "Livré",                    c: "#4CAF50" },
  { id: "livraison_partielle",   label: "Livraison Partielle",      c: "#8BC34A" },
  { id: "facture",               label: "Facturé",                  c: "#9C27B0" },
  { id: "facturation_partielle", label: "Facturation Partielle",    c: "#E91E63" },
];

const TYPES_COMMANDE = [
  { id: "chantier_pro", label: "Chantier PRO", c: "#1565C0" },
  { id: "chantier_par", label: "Chantier PAR", c: "#2E7D32" },
  { id: "sav",          label: "SAV",          c: "#E65100" },
  { id: "diffus",       label: "DIFFUS",       c: "#6A1B9A" },
];

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
const getWeekNum = getWeekNumUtil;
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
  onPatch: (id: string, updates: Record<string, unknown>) => void;
}) {
  const todayMonday = getMondayOf(localStr(new Date()));

  const [search,           setSearch]           = useState("");
  const [filterZone,       setFilterZone]       = useState("");
  const [filterAtelier,    setFilterAtelier]    = useState("");
  const [filterPoste,      setFilterPoste]      = useState("");
  const [filterStatut,     setFilterStatut]     = useState("");
  const [filterTypeCmd,    setFilterTypeCmd]    = useState("");
  const [filterWeekFab,    setFilterWeekFab]    = useState<string | null>(null);
  const [filterWeekLiv,    setFilterWeekLiv]    = useState<string | null>(null);
  const [openComments,     setOpenComments]     = useState<string | null>(null);
  const [sortBy,           setSortBy]           = useState<"livraison" | "client">("livraison");

  // ── Filtres favoris (localStorage par utilisateur) ──────────────────────
  interface SavedFilter {
    name: string;
    search: string;
    zone: string;
    atelier: string;
    poste: string;
    statut: string;
    typeCmd: string;
    weekFab: string | null;
    weekLiv: string | null;
  }
  const FAVS_KEY = "sial_filter_favs";
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>(() => {
    if (typeof window === "undefined") return [];
    try { const s = localStorage.getItem(FAVS_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [showSaveName, setShowSaveName] = useState(false);
  const [saveName, setSaveName] = useState("");

  const persistFilters = (filters: SavedFilter[]) => {
    setSavedFilters(filters);
    try { localStorage.setItem(FAVS_KEY, JSON.stringify(filters)); } catch {}
  };

  const saveCurrentFilter = () => {
    if (!saveName.trim()) return;
    const newFilter: SavedFilter = {
      name: saveName.trim(),
      search, zone: filterZone, atelier: filterAtelier, poste: filterPoste,
      statut: filterStatut, typeCmd: filterTypeCmd,
      weekFab: filterWeekFab, weekLiv: filterWeekLiv,
    };
    persistFilters([...savedFilters.filter(f => f.name !== newFilter.name), newFilter]);
    setSaveName("");
    setShowSaveName(false);
  };

  const loadFilter = (f: SavedFilter) => {
    setSearch(f.search); setFilterZone(f.zone); setFilterAtelier(f.atelier);
    setFilterPoste(f.poste); setFilterStatut(f.statut); setFilterTypeCmd(f.typeCmd);
    setFilterWeekFab(f.weekFab); setFilterWeekLiv(f.weekLiv);
  };

  const deleteFilter = (name: string) => {
    persistFilters(savedFilters.filter(f => f.name !== name));
  };

  const sorted = useMemo(() => {
    const arr = [...commandes];
    if (sortBy === "client") {
      arr.sort((a, b) => (a.client || "").localeCompare(b.client || "", "fr", { sensitivity: "base" }));
    } else {
      arr.sort((a, b) =>
        new Date(a.date_livraison_souhaitee || "9999-12-31").getTime() -
        new Date(b.date_livraison_souhaitee || "9999-12-31").getTime()
      );
    }
    return arr;
  }, [commandes, sortBy]);

  const filtered = useMemo(() => sorted.filter(c => {
    const cmd = c as any;
    if (search) {
      const q = search.toLowerCase();
      const ok = (c.client || "").toLowerCase().includes(q)
        || (cmd.num_commande || "").toLowerCase().includes(q)
        || (cmd.ref_chantier || "").toLowerCase().includes(q);
      if (!ok) return false;
    }
    if (filterZone    && cmd.zone          !== filterZone)    return false;
    if (filterAtelier && (cmd.atelier||"SIAL") !== filterAtelier) return false;
    if (filterStatut  && cmd.statut        !== filterStatut)  return false;
    if (filterTypeCmd && cmd.type_commande !== filterTypeCmd) return false;
    if (filterPoste   && !hasPoste(c, filterPoste))           return false;
    if (filterWeekFab && !hasEtapeInWeek(c, filterWeekFab))   return false;
    if (filterWeekLiv && cmd.date_livraison_souhaitee) {
      if (getMondayOf(cmd.date_livraison_souhaitee) !== filterWeekLiv) return false;
    } else if (filterWeekLiv) return false;
    return true;
  }), [sorted, search, filterZone, filterAtelier, filterStatut, filterTypeCmd, filterPoste, filterWeekFab, filterWeekLiv]);

  const hasFilters = search || filterZone || filterAtelier || filterStatut || filterTypeCmd || filterPoste || filterWeekFab || filterWeekLiv;
  const clearAll = () => { setSearch(""); setFilterZone(""); setFilterAtelier(""); setFilterStatut(""); setFilterTypeCmd(""); setFilterPoste(""); setFilterWeekFab(null); setFilterWeekLiv(null); };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(commandes, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `commandes-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
  };

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
          <button onClick={exportJson} style={{ padding:"5px 12px", background:C.teal+"22", border:`1px solid ${C.teal}44`, borderRadius:4, color:C.teal, fontSize:11, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>
            Export
          </button>
          {/* Sauvegarder le filtre actuel */}
          {hasFilters && (
            showSaveName ? (
              <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                <input value={saveName} onChange={e => setSaveName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveCurrentFilter(); }}
                  placeholder="Nom du filtre"
                  autoFocus
                  style={{ padding:"4px 8px", background:C.bg, border:`1px solid ${C.orange}`, borderRadius:4, color:C.text, fontSize:11, width:120, outline:"none" }} />
                <button onClick={saveCurrentFilter} style={{ padding:"4px 8px", background:C.orange, border:"none", borderRadius:4, color:"#000", fontSize:10, fontWeight:700, cursor:"pointer" }}>OK</button>
                <button onClick={() => setShowSaveName(false)} style={{ padding:"4px 6px", background:"none", border:`1px solid ${C.border}`, borderRadius:4, color:C.sec, fontSize:10, cursor:"pointer" }}>×</button>
              </div>
            ) : (
              <button onClick={() => setShowSaveName(true)} style={{ padding:"5px 10px", background:C.orange+"22", border:`1px solid ${C.orange}44`, borderRadius:4, color:C.orange, fontSize:11, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>
                ★ Sauver filtre
              </button>
            )
          )}
        </div>

        {/* Filtres favoris */}
        {savedFilters.length > 0 && (
          <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:8, alignItems:"center" }}>
            <span style={{ fontSize:9, color:C.muted, fontWeight:700, marginRight:4 }}>FAVORIS</span>
            {savedFilters.map(f => (
              <div key={f.name} style={{ display:"flex", alignItems:"center", gap:0 }}>
                <button onClick={() => loadFilter(f)}
                  style={{ padding:"4px 10px", background:C.orange+"18", border:`1px solid ${C.orange}44`, borderRadius:"4px 0 0 4px", color:C.orange, fontSize:10, fontWeight:600, cursor:"pointer" }}>
                  ★ {f.name}
                </button>
                <button onClick={() => deleteFilter(f.name)}
                  style={{ padding:"4px 6px", background:C.bg, border:`1px solid ${C.border}`, borderLeft:"none", borderRadius:"0 4px 4px 0", color:C.muted, fontSize:9, cursor:"pointer" }}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Ligne 2 : zone + statut + type commande + poste */}
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:8 }}>
          <select value={filterAtelier} onChange={e => setFilterAtelier(e.target.value)}
            style={{ padding:"5px 10px", background:filterAtelier?C.orange+"22":C.bg, border:`1px solid ${filterAtelier?C.orange:C.border}`, borderRadius:4, color:filterAtelier?C.orange:C.sec, fontSize:11, cursor:"pointer", fontWeight:700 }}>
            <option value="">SIAL + ISULA</option>
            <option value="SIAL">SIAL uniquement</option>
            <option value="ISULA VITRAGE">ISULA VITRAGE uniquement</option>
          </select>

          <select value={filterZone} onChange={e => setFilterZone(e.target.value)}
            style={{ padding:"5px 10px", background:filterZone?C.teal+"22":C.bg, border:`1px solid ${filterZone?C.teal:C.border}`, borderRadius:4, color:filterZone?C.teal:C.sec, fontSize:11, cursor:"pointer" }}>
            <option value="">Toutes les zones</option>
            {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
          </select>

          <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)}
            style={{ padding:"5px 10px", background:filterStatut?C.blue+"22":C.bg, border:`1px solid ${filterStatut?C.blue:C.border}`, borderRadius:4, color:filterStatut?(STATUTS.find(s=>s.id===filterStatut)?.c||C.blue):C.sec, fontSize:11, cursor:"pointer" }}>
            <option value="">Tous les statuts</option>
            {STATUTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>

          <select value={filterTypeCmd} onChange={e => setFilterTypeCmd(e.target.value)}
            style={{ padding:"5px 10px", background:filterTypeCmd?C.purple+"22":C.bg, border:`1px solid ${filterTypeCmd?C.purple:C.border}`, borderRadius:4, color:filterTypeCmd?C.purple:C.sec, fontSize:11, cursor:"pointer" }}>
            <option value="">Tous les types</option>
            {TYPES_COMMANDE.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>

          <select value={filterPoste} onChange={e => setFilterPoste(e.target.value)}
            style={{ padding:"5px 10px", background:filterPoste?C.orange+"22":C.bg, border:`1px solid ${filterPoste?C.orange:C.border}`, borderRadius:4, color:filterPoste?C.orange:C.sec, fontSize:11, cursor:"pointer" }}>
            <option value="">Tous les postes</option>
            {POSTES_FILTRE.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>

        {/* Ligne 3 : semaine fab + semaine livraison */}
        <div style={{ display:"flex", gap:16, flexWrap:"wrap", alignItems:"center" }}>
          {/* Semaine fabrication */}
          <div style={{ display:"flex", gap:4, alignItems:"center" }}>
            <span style={{ fontSize:10, color:C.sec, fontWeight:700, marginRight:2 }}>FAB</span>
            <button onClick={() => setFilterWeekFab(p => p ? addDays(p,-7) : addDays(todayMonday,-7))}
              style={{ padding:"3px 7px", background:C.bg, border:`1px solid ${C.border}`, borderRadius:4, color:C.sec, cursor:"pointer", fontSize:11 }}>‹</button>
            <span style={{ fontSize:10, color:filterWeekFab?C.purple:C.sec, fontWeight:filterWeekFab?700:400, minWidth:170, textAlign:"center",
              padding:"3px 8px", background:filterWeekFab?C.purple+"22":C.bg, border:`1px solid ${filterWeekFab?C.purple:C.border}`, borderRadius:4 }}>
              {filterWeekFab ? weekLabel(filterWeekFab) : "Toutes semaines"}
            </span>
            <button onClick={() => setFilterWeekFab(p => p ? addDays(p,7) : addDays(todayMonday,7))}
              style={{ padding:"3px 7px", background:C.bg, border:`1px solid ${C.border}`, borderRadius:4, color:C.sec, cursor:"pointer", fontSize:11 }}>›</button>
            {!filterWeekFab
              ? <button onClick={() => setFilterWeekFab(todayMonday)} style={{ padding:"3px 8px", background:C.purple+"22", border:`1px solid ${C.purple}44`, borderRadius:4, color:C.purple, cursor:"pointer", fontSize:10, fontWeight:700 }}>Cette sem.</button>
              : <button onClick={() => setFilterWeekFab(null)} style={{ padding:"3px 7px", background:C.bg, border:`1px solid ${C.border}`, borderRadius:4, color:C.sec, cursor:"pointer", fontSize:10 }}>✕</button>
            }
          </div>

          {/* Semaine livraison */}
          <div style={{ display:"flex", gap:4, alignItems:"center" }}>
            <span style={{ fontSize:10, color:C.sec, fontWeight:700, marginRight:2 }}>LIV</span>
            <button onClick={() => setFilterWeekLiv(p => p ? addDays(p,-7) : addDays(todayMonday,-7))}
              style={{ padding:"3px 7px", background:C.bg, border:`1px solid ${C.border}`, borderRadius:4, color:C.sec, cursor:"pointer", fontSize:11 }}>‹</button>
            <span style={{ fontSize:10, color:filterWeekLiv?C.green:C.sec, fontWeight:filterWeekLiv?700:400, minWidth:170, textAlign:"center",
              padding:"3px 8px", background:filterWeekLiv?C.green+"22":C.bg, border:`1px solid ${filterWeekLiv?C.green:C.border}`, borderRadius:4 }}>
              {filterWeekLiv ? weekLabel(filterWeekLiv) : "Toutes semaines"}
            </span>
            <button onClick={() => setFilterWeekLiv(p => p ? addDays(p,7) : addDays(todayMonday,7))}
              style={{ padding:"3px 7px", background:C.bg, border:`1px solid ${C.border}`, borderRadius:4, color:C.sec, cursor:"pointer", fontSize:11 }}>›</button>
            {!filterWeekLiv
              ? <button onClick={() => setFilterWeekLiv(todayMonday)} style={{ padding:"3px 8px", background:C.green+"22", border:`1px solid ${C.green}44`, borderRadius:4, color:C.green, cursor:"pointer", fontSize:10, fontWeight:700 }}>Cette sem.</button>
              : <button onClick={() => setFilterWeekLiv(null)} style={{ padding:"3px 7px", background:C.bg, border:`1px solid ${C.border}`, borderRadius:4, color:C.sec, cursor:"pointer", fontSize:10 }}>✕</button>
            }
          </div>
        </div>

        {/* Compteur résultats + tri */}
        <div style={{ marginTop:6, display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
          <div style={{ fontSize:10, color:C.sec }}>
            {hasFilters
              ? <><span style={{ color:filtered.length===0?C.red:C.blue, fontWeight:700 }}>{filtered.length}</span> résultat{filtered.length!==1?"s":""} sur {sorted.length} commande{sorted.length!==1?"s":""}</>
              : <>{sorted.length} commande{sorted.length!==1?"s":""}</>
            }
          </div>
          <div style={{ display:"flex", gap:4, alignItems:"center" }}>
            <span style={{ fontSize:10, color:C.sec, fontWeight:700 }}>Trier :</span>
            <button onClick={() => setSortBy("livraison")}
              style={{ padding:"2px 10px", borderRadius:4, fontSize:10, fontWeight:700, cursor:"pointer", border:`1px solid ${sortBy==="livraison"?C.green:C.border}`, background:sortBy==="livraison"?C.green+"22":"none", color:sortBy==="livraison"?C.green:C.sec }}>
              📅 Livraison
            </button>
            <button onClick={() => setSortBy("client")}
              style={{ padding:"2px 10px", borderRadius:4, fontSize:10, fontWeight:700, cursor:"pointer", border:`1px solid ${sortBy==="client"?C.blue:C.border}`, background:sortBy==="client"?C.blue+"22":"none", color:sortBy==="client"?C.blue:C.sec }}>
              🔤 Client A→Z
            </button>
          </div>
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
                {/* Client + Chantier en évidence */}
                <div style={{ marginBottom: 2 }}>
                  <span style={{ fontSize: 17, fontWeight: 800, color: C.text, letterSpacing: "-0.01em" }}>{c.client || "—"}</span>
                  {cmd.ref_chantier && (
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.teal, marginLeft: 10 }}>{cmd.ref_chantier}</span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: C.sec, marginBottom: 5 }} className="mono">
                  {cmd.num_commande || "—"}
                  {cmd.zone && <span style={{ marginLeft: 8 }}>· {cmd.zone}</span>}
                </div>
                {/* Badges */}
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                  {cmd.type_commande && (() => { const tc = TYPES_COMMANDE.find(t=>t.id===cmd.type_commande); return tc ? <Bdg t={tc.label} c={tc.c} /> : null; })()}
                  {tm && <Bdg t={tm.label} c={tm.famille === "hors_standard" || tm.famille === "intervention" ? C.purple : CFAM[tm.famille] || C.blue} />}
                  {(cmd.date_panneau_porte || cmd.date_volet_roulant) && <Bdg t="+ options" c={C.yellow} />}
                  {toutTermine && <Bdg t="✅ Terminé" c={C.green} />}
                  {activePosteMatch && <Bdg t={`En cours : ${activePosteMatch.label}`} c={activePosteMatch.c} />}
                  {cc?.enRetard
                    ? <Bdg t={cc.critique ? `CRITIQUE +${cc.retardJours}j` : `retard +${cc.retardJours}j`} c={retardColor} />
                    : cc ? <Bdg t={`OK ${Math.abs(cc.retardJours)}j marge`} c={C.green} /> : null}
                </div>
                {/* Postes du routage */}
                {t && (
                  <div style={{ display: "flex", gap: 2, flexWrap: "wrap", marginTop: 3 }}>
                    {Object.entries(t.par_poste).filter(([, v]) => v > 0).map(([poste]) => {
                      const PC: Record<string, string> = { coupe: "#42A5F5", frappes: "#FFA726", coulissant: "#FFA726", vitrage_ov: "#26C6DA" };
                      return (
                        <span key={poste} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: (PC[poste] ?? "#888") + "22", color: PC[poste] ?? "#888", fontWeight: 700 }}>
                          {poste}
                        </span>
                      );
                    })}
                  </div>
                )}
                {/* Semaines fab + livraison */}
                <div style={{ fontSize: 10, display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
                  {(() => {
                    const dd = dateDemarrage(c);
                    if (dd) {
                      const mon = getMondayOf(dd);
                      return <span style={{ padding: "1px 6px", borderRadius: 3, background: C.purple + "18", border: `1px solid ${C.purple}44`, color: C.purple, fontWeight: 700 }}>Fab S{getWeekNum(mon)}</span>;
                    }
                    return null;
                  })()}
                  {cmd.date_livraison_souhaitee && (
                    <span style={{ padding: "1px 6px", borderRadius: 3, background: C.green + "18", border: `1px solid ${C.green}44`, color: C.green, fontWeight: 700 }}>Liv S{getWeekNum(cmd.date_livraison_souhaitee)}</span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: C.sec, display: "flex", gap: 10, flexWrap: "wrap" }} className="mono">
                  <span>{c.quantite} pcs</span>
                  {t && <span>{hm(t.tTotal)} fab.</span>}
                  <span>Dem:{fmtDate(dateDemarrage(c))}</span>
                  {cmd.date_livraison_souhaitee && <span>Liv:{fmtDate(cmd.date_livraison_souhaitee)}</span>}
                  {cc && <span style={{ color: retardColor }}>Au+tot:{fmtDate(cc.dateLivraisonAuPlusTot)}</span>}
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
                {/* Acompte & Reliquats */}
                {(cmd.acompte_recu || cmd.reliquat_alu || cmd.reliquat_pvc || cmd.reliquat_accessoires) && (
                  <div style={{ fontSize: 9, display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
                    {cmd.acompte_recu && (
                      <span style={{ padding: "1px 6px", background: C.yellow+"22", border: `1px solid ${C.yellow}55`, borderRadius: 3, color: C.yellow, fontWeight: 700 }}>
                        Acompte{cmd.acompte_montant ? ` ${Number(cmd.acompte_montant).toLocaleString("fr-FR")}€` : ""}
                        {cmd.acompte_date ? ` — ${fmtDate(cmd.acompte_date)}` : ""}
                      </span>
                    )}
                    {cmd.reliquat_alu && (
                      <span style={{ padding: "1px 6px", background: C.cyan+"18", border: `1px solid ${C.cyan}44`, borderRadius: 3, color: C.cyan }}>
                        Reliquat ALU{cmd.reliquat_alu_date ? ` ${fmtDate(cmd.reliquat_alu_date)}` : ""}
                      </span>
                    )}
                    {cmd.reliquat_pvc && (
                      <span style={{ padding: "1px 6px", background: C.blue+"18", border: `1px solid ${C.blue}44`, borderRadius: 3, color: C.blue }}>
                        Reliquat PVC{cmd.reliquat_pvc_date ? ` ${fmtDate(cmd.reliquat_pvc_date)}` : ""}
                      </span>
                    )}
                    {cmd.reliquat_accessoires && (
                      <span style={{ padding: "1px 6px", background: C.orange+"18", border: `1px solid ${C.orange}44`, borderRadius: 3, color: C.orange }}>
                        Reliquat Access.{cmd.reliquat_accessoires_date ? ` ${fmtDate(cmd.reliquat_accessoires_date)}` : ""}
                      </span>
                    )}
                  </div>
                )}

                {/* Statut + Type commande */}
                <div style={{ marginTop: 7, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {(() => {
                    const st = STATUTS.find(s => s.id === (cmd.statut || "en_attente")) || STATUTS[0];
                    return (
                      <select value={cmd.statut || "en_attente"} onChange={e => onPatch(String(c.id), { statut: e.target.value })}
                        style={{ padding:"2px 8px", background:st.c+"22", border:`1px solid ${st.c}66`, borderRadius:4, color:st.c, fontSize:10, fontWeight:700, cursor:"pointer" }}>
                        {STATUTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    );
                  })()}
                  <select value={cmd.type_commande || ""} onChange={e => onPatch(String(c.id), { type_commande: e.target.value || null })}
                    style={{ padding:"2px 8px", background:C.bg, border:`1px solid ${C.border}`, borderRadius:4, color:cmd.type_commande?(TYPES_COMMANDE.find(t=>t.id===cmd.type_commande)?.c||C.sec):C.muted, fontSize:10, cursor:"pointer" }}>
                    <option value="">Type…</option>
                    {TYPES_COMMANDE.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>

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
            <button
              onClick={() => setOpenComments(p => p === String(c.id) ? null : String(c.id))}
              style={{ marginTop:6, background:"none", border:`1px solid ${openComments===String(c.id)?C.yellow:C.border}`, borderRadius:4, color:openComments===String(c.id)?C.yellow:C.muted, fontSize:10, cursor:"pointer", padding:"2px 10px" }}>
              💬 Commentaires
            </button>
            {openComments === String(c.id) && <CommentairesPanel commandeId={String(c.id)} />}
          </Card>
        );
      })}
    </div>
  );
}
