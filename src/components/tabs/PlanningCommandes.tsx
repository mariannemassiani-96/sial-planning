"use client";
import { useState, useMemo } from "react";
import { C, TYPES_MENUISERIE, hm, CommandeCC, calcCheminCritique } from "@/lib/sial-data";
import { getRoutage } from "@/lib/routage-production";

function localStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function weekId(mondayStr: string): string {
  const d = new Date(mondayStr + "T00:00:00");
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const w1 = new Date(jan4);
  w1.setDate(jan4.getDate() - ((jan4.getDay() || 7) - 1));
  const wn = Math.ceil((d.getTime() - w1.getTime()) / (7 * 86400000)) + 1;
  return `S${String(wn).padStart(2, "0")}`;
}
function getWeekOptions(): Array<{ value: string; label: string }> {
  const opts: Array<{ value: string; label: string }> = [{ value: "", label: "— non planifié —" }];
  const mon = new Date(); const day = mon.getDay(); mon.setDate(mon.getDate() - (day === 0 ? 6 : day - 1));
  for (let i = -2; i < 20; i++) {
    const d = new Date(mon); d.setDate(d.getDate() + i * 7);
    const ms = localStr(d);
    opts.push({ value: ms, label: weekId(ms) });
  }
  return opts;
}

const STATUT_COLORS: Record<string, string> = {
  en_attente: C.muted, en_cours: C.blue, livre: C.green, terminee: C.green, annulee: C.red,
};
const STATUT_LABELS: Record<string, string> = {
  en_attente: "En attente", en_cours: "En cours", livre: "Livré", terminee: "Terminé", annulee: "Annulé",
};

export default function PlanningCommandes({ commandes, onPatch }: {
  commandes: CommandeCC[];
  onPatch: (id: string, updates: Record<string, unknown>) => void;
}) {
  const [search, setSearch] = useState("");
  const [filterStatut, setFilterStatut] = useState("");
  const weekOptions = useMemo(() => getWeekOptions(), []);

  const cmdList = useMemo(() => {
    return commandes
      .filter(cmd => {
        const s = (cmd as any).statut;
        if (filterStatut && s !== filterStatut) return false;
        if (search) {
          const q = search.toLowerCase();
          const client = ((cmd as any).client || "").toLowerCase();
          const ref = ((cmd as any).ref_chantier || "").toLowerCase();
          const num = ((cmd as any).num_commande || "").toLowerCase();
          if (!client.includes(q) && !ref.includes(q) && !num.includes(q)) return false;
        }
        return true;
      })
      .map(cmd => {
        const cc = calcCheminCritique(cmd);
        const tm = (TYPES_MENUISERIE as Record<string, any>)[cmd.type];
        const routage = getRoutage(cmd.type, cmd.quantite, (cmd as any).hsTemps as Record<string, unknown> | null);
        const totalMin = routage.reduce((s, e) => s + e.estimatedMin, 0);
        return { cmd, cc, tm, totalMin };
      })
      .sort((a, b) => {
        const da = (a.cmd as any).date_livraison_souhaitee || "9999";
        const db = (b.cmd as any).date_livraison_souhaitee || "9999";
        return da.localeCompare(db);
      });
  }, [commandes, search, filterStatut]);

  const setSemaineFab = (cmdId: string, week: string) => {
    // Positionne toutes les phases sur la même semaine
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
    // Vendredi de la semaine
    const d = new Date(week + "T00:00:00"); d.setDate(d.getDate() + 4);
    onPatch(cmdId, { date_livraison_souhaitee: localStr(d) });
  };

  const getSemaineFab = (cmd: any): string => {
    return cmd.semaine_coupe || cmd.semaine_montage || cmd.semaine_vitrage || cmd.semaine_logistique || "";
  };

  const getSemaineLivraison = (cmd: any): string => {
    if (!cmd.date_livraison_souhaitee) return "";
    const d = new Date(cmd.date_livraison_souhaitee + "T00:00:00");
    const day = d.getDay(); d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return localStr(d);
  };

  return (
    <div>
      {/* Filtres */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher client, chantier..."
          style={{ padding: "6px 12px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontSize: 12, width: 250 }} />
        <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)}
          style={{ padding: "6px 10px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontSize: 12 }}>
          <option value="">Tous statuts</option>
          {Object.entries(STATUT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <span style={{ fontSize: 11, color: C.sec }}>{cmdList.length} commandes</span>
      </div>

      {/* Tableau */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ padding: "6px 8px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "left", fontSize: 10, color: C.sec }}>CLIENT</th>
              <th style={{ padding: "6px 8px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "left", fontSize: 10, color: C.sec }}>CHANTIER</th>
              <th style={{ padding: "6px 4px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 10, color: C.sec, width: 50 }}>TYPE</th>
              <th style={{ padding: "6px 4px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 10, color: C.sec, width: 30 }}>QTÉ</th>
              <th style={{ padding: "6px 4px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 10, color: C.sec, width: 50 }}>TEMPS</th>
              <th style={{ padding: "6px 4px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 10, color: C.sec, width: 80 }}>STATUT</th>
              <th style={{ padding: "6px 4px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 10, color: C.orange, fontWeight: 700, width: 100 }}>SEM. FAB</th>
              <th style={{ padding: "6px 4px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 10, color: C.green, fontWeight: 700, width: 100 }}>SEM. LIVR.</th>
            </tr>
          </thead>
          <tbody>
            {cmdList.map(({ cmd, cc, tm, totalMin }) => {
              const a = cmd as any;
              const borderColor = cc?.critique ? C.red : cc?.enRetard ? C.orange : C.green;
              const statut = a.statut || "en_attente";
              return (
                <tr key={String(cmd.id)} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "5px 8px", borderLeft: `3px solid ${borderColor}`, border: `1px solid ${C.border}`, fontWeight: 700, fontSize: 12 }}>{a.client}</td>
                  <td style={{ padding: "5px 8px", border: `1px solid ${C.border}`, color: C.sec }}>{a.ref_chantier || "—"}</td>
                  <td style={{ padding: "4px", border: `1px solid ${C.border}`, textAlign: "center", fontSize: 10 }}>{tm?.label || cmd.type}</td>
                  <td style={{ padding: "4px", border: `1px solid ${C.border}`, textAlign: "center", fontWeight: 700 }}>{cmd.quantite}</td>
                  <td style={{ padding: "4px", border: `1px solid ${C.border}`, textAlign: "center" }}>
                    <span className="mono" style={{ fontSize: 10, color: C.muted }}>{totalMin > 0 ? hm(totalMin) : "—"}</span>
                  </td>
                  <td style={{ padding: "4px", border: `1px solid ${C.border}`, textAlign: "center" }}>
                    <span style={{ fontSize: 10, color: STATUT_COLORS[statut] || C.sec, fontWeight: 600 }}>{STATUT_LABELS[statut] || statut}</span>
                  </td>
                  <td style={{ padding: "2px 4px", border: `1px solid ${C.border}` }}>
                    <select value={getSemaineFab(a)} onChange={e => setSemaineFab(String(cmd.id), e.target.value)}
                      style={{ width: "100%", padding: "3px 4px", fontSize: 10, background: getSemaineFab(a) ? C.orange + "15" : C.bg, border: `1px solid ${getSemaineFab(a) ? C.orange + "66" : C.border}`, borderRadius: 3, color: C.text, cursor: "pointer" }}>
                      {weekOptions.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: "2px 4px", border: `1px solid ${C.border}` }}>
                    <select value={getSemaineLivraison(a)} onChange={e => setSemaineLivraison(String(cmd.id), e.target.value)}
                      style={{ width: "100%", padding: "3px 4px", fontSize: 10, background: getSemaineLivraison(a) ? C.green + "15" : C.bg, border: `1px solid ${getSemaineLivraison(a) ? C.green + "66" : C.border}`, borderRadius: 3, color: C.text, cursor: "pointer" }}>
                      {weekOptions.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                    </select>
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
