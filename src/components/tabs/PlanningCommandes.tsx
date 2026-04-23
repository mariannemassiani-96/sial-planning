"use client";
import { useState, useMemo } from "react";
import { C, CommandeCC, calcCheminCritique, getWeekNum } from "@/lib/sial-data";

function localStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function weekId(mondayStr: string): string {
  return `S${String(getWeekNum(mondayStr)).padStart(2, "0")}`;
}
function getWeekOptions(): Array<{ value: string; label: string }> {
  const opts: Array<{ value: string; label: string }> = [{ value: "", label: "— non planifié —" }];
  const mon = new Date(); const day = mon.getDay(); mon.setDate(mon.getDate() - (day === 0 ? 6 : day - 1));
  for (let i = -2; i < 20; i++) {
    const d = new Date(mon); d.setDate(d.getDate() + i * 7);
    const ms = localStr(d);
    const fmt = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
    opts.push({ value: ms, label: `${weekId(ms)} (${fmt})` });
  }
  return opts;
}

const STATUT_COLORS: Record<string, string> = {
  en_attente: C.muted, en_cours: C.blue, livre: C.green, terminee: C.green, annulee: C.red,
};
const STATUT_LABELS: Record<string, string> = {
  en_attente: "En attente", en_cours: "En cours", livre: "Livré", terminee: "Terminé", annulee: "Annulé",
};
const ZONES = ["SIAL", "Porto-Vecchio", "Balagne", "Ajaccio", "Plaine Orientale", "Continent", "Sur chantier", "Autre"];
const TRANSPORTEURS: Record<string, string> = {
  nous: "Nous", setec: "Setec", express: "Express", poseur: "Poseur", depot: "Depot",
};

type SortKey = "livraison" | "fab" | "client" | "statut" | "retard";

export default function PlanningCommandes({ commandes, onPatch }: {
  commandes: CommandeCC[];
  onPatch: (id: string, updates: Record<string, unknown>) => void;
}) {
  const [search, setSearch] = useState("");
  const [filterStatut, setFilterStatut] = useState("");
  const [filterWeekFab, setFilterWeekFab] = useState("");
  const [filterWeekLiv, setFilterWeekLiv] = useState("");
  const [filterZone, setFilterZone] = useState("");
  const [filterTransporteur, setFilterTransporteur] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("livraison");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const weekOptions = useMemo(() => getWeekOptions(), []);

  const hasFilters = search || filterStatut || filterWeekFab || filterWeekLiv || filterZone || filterTransporteur;
  const clearAll = () => { setSearch(""); setFilterStatut(""); setFilterWeekFab(""); setFilterWeekLiv(""); setFilterZone(""); setFilterTransporteur(""); };

  const getSemaineFab = (cmd: any): string => {
    return cmd.semaine_coupe || cmd.semaine_montage || cmd.semaine_vitrage || cmd.semaine_logistique || "";
  };
  const getSemaineLivraison = (cmd: any): string => {
    if (!cmd.date_livraison_souhaitee) return "";
    const d = new Date(cmd.date_livraison_souhaitee + "T12:00:00");
    const day = d.getDay(); d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return localStr(d);
  };

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(key); setSortDir("asc"); }
  };
  const sortIcon = (key: SortKey) => sortBy === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  const cmdList = useMemo(() => {
    return commandes
      .filter(cmd => {
        const a = cmd as any;
        if (filterStatut && a.statut !== filterStatut) return false;
        if (filterZone && (a.zone || "") !== filterZone) return false;
        if (filterTransporteur && (a.transporteur || "") !== filterTransporteur) return false;
        if (filterWeekFab) {
          const sf = getSemaineFab(a);
          if (sf !== filterWeekFab) return false;
        }
        if (filterWeekLiv) {
          const sl = getSemaineLivraison(a);
          if (sl !== filterWeekLiv) return false;
        }
        if (search) {
          const q = search.toLowerCase();
          const ok = (a.client || "").toLowerCase().includes(q)
            || (a.ref_chantier || "").toLowerCase().includes(q)
            || (a.num_commande || "").toLowerCase().includes(q);
          if (!ok) return false;
        }
        return true;
      })
      .map(cmd => {
        const cc = calcCheminCritique(cmd);
        return { cmd, cc };
      })
      .sort((a, b) => {
        const dir = sortDir === "asc" ? 1 : -1;
        switch (sortBy) {
          case "livraison": {
            const da = (a.cmd as any).date_livraison_souhaitee || "9999";
            const db = (b.cmd as any).date_livraison_souhaitee || "9999";
            return da.localeCompare(db) * dir;
          }
          case "fab": {
            const fa = getSemaineFab(a.cmd as any) || "9999";
            const fb = getSemaineFab(b.cmd as any) || "9999";
            return fa.localeCompare(fb) * dir;
          }
          case "client":
            return ((a.cmd as any).client || "").localeCompare((b.cmd as any).client || "", "fr") * dir;
          case "statut":
            return ((a.cmd as any).statut || "").localeCompare((b.cmd as any).statut || "") * dir;
          case "retard": {
            const ra = a.cc?.retardJours ?? -999;
            const rb = b.cc?.retardJours ?? -999;
            return (rb - ra) * dir;
          }
          default: return 0;
        }
      });
  }, [commandes, search, filterStatut, filterWeekFab, filterWeekLiv, filterZone, filterTransporteur, sortBy, sortDir]);

  const setSemaineFab = (cmdId: string, week: string) => {
    onPatch(cmdId, {
      semaine_coupe: week || null,
      semaine_montage: week || null,
      semaine_vitrage: week || null,
      semaine_logistique: week || null,
      semaine_isula: week || null,
    });
  };

  const setSemaineLivraison = (cmdId: string, week: string) => {
    if (!week) { onPatch(cmdId, { date_livraison_souhaitee: null }); return; }
    const d = new Date(week + "T12:00:00"); d.setDate(d.getDate() + 4);
    onPatch(cmdId, { date_livraison_souhaitee: localStr(d) });
  };

  const sel = { padding: "5px 8px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontSize: 11, cursor: "pointer" };
  const selActive = (active: boolean, color: string) => ({
    ...sel,
    background: active ? color + "18" : C.bg,
    border: `1px solid ${active ? color + "66" : C.border}`,
    color: active ? color : C.sec,
    fontWeight: active ? 700 : 400 as any,
  });

  const thSort = (label: string, key: SortKey, color: string) => (
    <th onClick={() => toggleSort(key)}
      style={{ padding: "6px 4px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 10,
        color, fontWeight: 700, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
      {label}{sortIcon(key)}
    </th>
  );

  return (
    <div>
      {/* ── Filtres ── */}
      <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 12px", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher client, chantier, N°..."
            style={{ padding: "6px 12px", background: C.bg, border: `1px solid ${search ? C.blue : C.border}`, borderRadius: 4, color: C.text, fontSize: 12, flex: 1, minWidth: 180 }} />
          {hasFilters && (
            <button onClick={clearAll} style={{ padding: "5px 10px", background: C.red + "22", border: `1px solid ${C.red}44`, borderRadius: 4, color: C.red, fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
              ✕ Effacer
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} style={selActive(!!filterStatut, C.blue)}>
            <option value="">Tous statuts</option>
            {Object.entries(STATUT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select value={filterWeekFab} onChange={e => setFilterWeekFab(e.target.value)} style={selActive(!!filterWeekFab, C.orange)}>
            <option value="">Toutes sem. fab</option>
            {weekOptions.filter(w => w.value).map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
          </select>
          <select value={filterWeekLiv} onChange={e => setFilterWeekLiv(e.target.value)} style={selActive(!!filterWeekLiv, C.green)}>
            <option value="">Toutes sem. liv</option>
            {weekOptions.filter(w => w.value).map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
          </select>
          <select value={filterZone} onChange={e => setFilterZone(e.target.value)} style={selActive(!!filterZone, C.teal)}>
            <option value="">Toutes zones</option>
            {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
          <select value={filterTransporteur} onChange={e => setFilterTransporteur(e.target.value)} style={selActive(!!filterTransporteur, C.cyan)}>
            <option value="">Tous transporteurs</option>
            {Object.entries(TRANSPORTEURS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <span style={{ fontSize: 10, color: C.sec, marginLeft: 4 }}>{cmdList.length}/{commandes.length} cmd</span>
        </div>
      </div>

      {/* ── Tableau ── */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr>
              {thSort("SEM. LIVR.", "livraison", C.green)}
              {thSort("CLIENT", "client", C.sec)}
              <th style={{ padding: "6px 8px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "left", fontSize: 10, color: C.sec }}>CHANTIER</th>
              {thSort("STATUT", "statut", C.sec)}
              {thSort("SEM. FAB", "fab", C.orange)}
              {thSort("RETARD", "retard", C.red)}
              <th style={{ padding: "6px 4px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 10, color: C.sec, width: 70 }}>TRANSP.</th>
              <th style={{ padding: "6px 4px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 10, color: C.muted, width: 40 }}>FAB</th>
              <th style={{ padding: "6px 4px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 10, color: C.muted, width: 40 }}>VIT.</th>
            </tr>
          </thead>
          <tbody>
            {cmdList.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 30, textAlign: "center", color: C.muted, border: `1px solid ${C.border}` }}>
                {hasFilters ? "Aucune commande ne correspond aux filtres." : "Aucune commande."}
              </td></tr>
            )}
            {cmdList.map(({ cmd, cc }) => {
              const a = cmd as any;
              const borderColor = cc?.critique ? C.red : cc?.enRetard ? C.orange : C.green;
              const statut = a.statut || "en_attente";
              const retard = cc?.retardJours ?? 0;
              return (
                <tr key={String(cmd.id)} style={{ borderBottom: `1px solid ${C.border}`, opacity: a.aucune_menuiserie && a.aucun_vitrage ? 0.5 : 1 }}>
                  <td style={{ padding: "2px 4px", border: `1px solid ${C.border}` }}>
                    <select value={getSemaineLivraison(a)} onChange={e => setSemaineLivraison(String(cmd.id), e.target.value)}
                      style={{ width: "100%", padding: "3px 4px", fontSize: 10, background: getSemaineLivraison(a) ? C.green + "15" : C.bg, border: `1px solid ${getSemaineLivraison(a) ? C.green + "66" : C.border}`, borderRadius: 3, color: C.text, cursor: "pointer" }}>
                      {weekOptions.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: "5px 8px", borderLeft: `3px solid ${borderColor}`, border: `1px solid ${C.border}`, fontWeight: 700, fontSize: 12 }}>
                    {a.client}
                    {a.nb_livraisons > 1 && <span style={{ fontSize: 9, marginLeft: 6, padding: "1px 5px", background: "#AB47BC22", border: "1px solid #AB47BC66", borderRadius: 3, color: "#AB47BC", fontWeight: 700 }}>en {a.nb_livraisons}x</span>}
                  </td>
                  <td style={{ padding: "5px 8px", border: `1px solid ${C.border}`, color: C.sec }}>{a.ref_chantier || "—"}</td>
                  <td style={{ padding: "4px", border: `1px solid ${C.border}`, textAlign: "center" }}>
                    <select value={statut} onChange={e => onPatch(String(cmd.id), { statut: e.target.value })}
                      style={{ padding: "2px 4px", fontSize: 10, background: "transparent", border: `1px solid ${STATUT_COLORS[statut] || C.border}`, borderRadius: 3, color: STATUT_COLORS[statut] || C.sec, cursor: "pointer", fontWeight: 600 }}>
                      {Object.entries(STATUT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: "2px 4px", border: `1px solid ${C.border}` }}>
                    <select value={getSemaineFab(a)} onChange={e => setSemaineFab(String(cmd.id), e.target.value)}
                      style={{ width: "100%", padding: "3px 4px", fontSize: 10, background: getSemaineFab(a) ? C.orange + "15" : C.bg, border: `1px solid ${getSemaineFab(a) ? C.orange + "66" : C.border}`, borderRadius: 3, color: C.text, cursor: "pointer" }}>
                      {weekOptions.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: "4px", border: `1px solid ${C.border}`, textAlign: "center" }}>
                    {retard !== 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: retard > 0 ? C.red : C.green }}>
                        {retard > 0 ? `+${retard}j` : `${retard}j`}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "2px 4px", border: `1px solid ${C.border}`, textAlign: "center" }}>
                    <select value={a.transporteur || ""} onChange={e => onPatch(String(cmd.id), { transporteur: e.target.value || null })}
                      style={{ padding: "2px 4px", fontSize: 9, background: "transparent", border: `1px solid ${a.transporteur ? C.cyan + "66" : C.border}`, borderRadius: 3, color: a.transporteur ? C.cyan : C.muted, cursor: "pointer" }}>
                      <option value="">—</option>
                      {Object.entries(TRANSPORTEURS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: "2px 4px", border: `1px solid ${C.border}`, textAlign: "center" }}>
                    <input type="checkbox" checked={!!a.aucune_menuiserie} onChange={e => onPatch(String(cmd.id), { aucune_menuiserie: e.target.checked })}
                      style={{ cursor: "pointer" }} title="Pas de fabrication" />
                  </td>
                  <td style={{ padding: "2px 4px", border: `1px solid ${C.border}`, textAlign: "center" }}>
                    <input type="checkbox" checked={!!a.aucun_vitrage} onChange={e => onPatch(String(cmd.id), { aucun_vitrage: e.target.checked })}
                      style={{ cursor: "pointer" }} title="Pas de vitrage" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
