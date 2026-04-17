"use client";
import { useState, useMemo } from "react";
import { C, CFAM, CommandeCC, TYPES_MENUISERIE, fmtDate, getWeekNum, calcCheminCritique, ZONES } from "@/lib/sial-data";
import { H, Bdg } from "@/components/ui";

const ZONE_COLORS: Record<string, string> = {
  "Porto-Vecchio":    "#E53935",
  "Ajaccio":          "#FB8C00",
  "Balagne":          "#1E88E5",
  "Bastia Nord":      "#00ACC1",
  "Sur chantier":     "#43A047",
  "Plaine Orientale": "#8E24AA",
  "Continent":        "#6D4C41",
  "SIAL":             "#757575",
  "Autre":            "#546E7A",
};

const TRANSPORTEURS = [
  { id: "nous",    label: "Par nous-memes",        c: "#42A5F5" },
  { id: "setec",   label: "Par Setec",             c: "#FFA726" },
  { id: "express", label: "Transporteur express",  c: "#66BB6A" },
  { id: "poseur",  label: "Par un poseur",         c: "#AB47BC" },
  { id: "depot",   label: "Client au depot",       c: "#26C6DA" },
];

const JOURS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];

function localStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getMondayOf(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - day + (day === 0 ? -6 : 1));
  date.setHours(0, 0, 0, 0);
  return date;
}
function addWeeks(s: string, n: number): string {
  const d = new Date(s + "T12:00:00");
  d.setDate(d.getDate() + n * 7);
  return localStr(d);
}

export default function PlanningChargements({ commandes, onPatch, onEdit }: {
  commandes: CommandeCC[];
  onPatch: (id: string, updates: Record<string, unknown>) => void;
  onEdit?: (cmd: CommandeCC) => void;
}) {
  const today = localStr(new Date());
  const [monday, setMonday] = useState(localStr(getMondayOf(new Date())));
  const [filterTransp, setFilterTransp] = useState("");
  const [filterZone, setFilterZone] = useState("");

  const weekDays = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(monday + "T12:00:00");
      d.setDate(d.getDate() + i);
      return localStr(d);
    });
  }, [monday]);

  // ── Grouper les commandes de la semaine en chargements ──
  // Un chargement = même date + même transporteur + même zone
  interface Chargement {
    date: string;
    transporteur: string;
    zone: string;
    items: Array<{ cmd: any; c: CommandeCC; cc: ReturnType<typeof calcCheminCritique> }>;
  }

  const chargements = useMemo(() => {
    const byKey = new Map<string, Chargement>();
    const order: string[] = [];

    for (const c of commandes) {
      const cmd = c as any;
      const livDate = cmd.date_livraison_souhaitee;
      if (!livDate) continue;
      if (!weekDays.includes(livDate)) continue;
      const statut = cmd.statut;
      if (statut === "annulee") continue;

      const transp = cmd.transporteur || "_aucun";
      const zoneG = cmd.zone || "_aucune";

      if (filterTransp && transp !== filterTransp) continue;
      if (filterZone && zoneG !== filterZone) continue;

      const key = `${livDate}|${transp}|${zoneG}`;
      if (!byKey.has(key)) {
        byKey.set(key, { date: livDate, transporteur: transp, zone: zoneG, items: [] });
        order.push(key);
      }
      const cc = calcCheminCritique(c);
      byKey.get(key)!.items.push({ cmd, c, cc });
    }

    return order.map(k => byKey.get(k)!);
  }, [commandes, weekDays, filterTransp, filterZone]);

  // ── Stats ──
  const stats = useMemo(() => {
    const totalCharg = chargements.length;
    const totalCmds = chargements.reduce((s, ch) => s + ch.items.length, 0);
    const totalPieces = chargements.reduce((s, ch) => s + ch.items.reduce((ss, x) => ss + (x.c.quantite || 0), 0), 0);
    const transpSet = new Set(chargements.filter(ch => ch.transporteur !== "_aucun").map(ch => ch.transporteur));
    const sansTransp = chargements.filter(ch => ch.transporteur === "_aucun").reduce((s, ch) => s + ch.items.length, 0);
    return { totalCharg, totalCmds, totalPieces, nbTransp: transpSet.size, sansTransp };
  }, [chargements]);

  // Grouper par jour
  const byDay = useMemo(() => {
    const map = new Map<string, Chargement[]>();
    for (const d of weekDays) map.set(d, []);
    for (const ch of chargements) {
      map.get(ch.date)?.push(ch);
    }
    return map;
  }, [chargements, weekDays]);

  const btn = { padding: "5px 10px", background: C.s1, border: `1px solid ${C.border}`, borderRadius: 4, color: C.sec, cursor: "pointer", fontSize: 11 };

  return (
    <div>
      <H c={C.orange}>🚚 Chargements de la semaine</H>

      {/* Navigation + filtres */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <button onClick={() => setMonday(m => addWeeks(m, -1))} style={btn}>‹ Sem. préc.</button>
        <button onClick={() => setMonday(localStr(getMondayOf(new Date())))} style={btn}>Cette sem.</button>
        <button onClick={() => setMonday(m => addWeeks(m, 1))} style={btn}>Sem. suiv. ›</button>
        <span style={{ fontSize: 13, color: C.text, marginLeft: 8, fontWeight: 700 }}>
          Semaine {getWeekNum(monday)} — {fmtDate(weekDays[0])} → {fmtDate(weekDays[4])}
        </span>

        <div style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }}>
          <select value={filterTransp} onChange={e => setFilterTransp(e.target.value)} style={{ ...btn, color: filterTransp ? C.blue : C.sec }}>
            <option value="">Tous transporteurs</option>
            {TRANSPORTEURS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            <option value="_aucun">— Non défini —</option>
          </select>
          <select value={filterZone} onChange={e => setFilterZone(e.target.value)} style={{ ...btn, color: filterZone ? C.teal : C.sec }}>
            <option value="">Toutes zones</option>
            {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
            <option value="_aucune">— Non définie —</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginBottom: 14 }}>
        {[
          { label: "Chargements", value: stats.totalCharg, color: C.orange },
          { label: "Commandes", value: stats.totalCmds, color: C.blue },
          { label: "Pièces", value: stats.totalPieces, color: C.teal },
          { label: "Transporteurs", value: stats.nbTransp, color: C.purple },
          { label: "Sans transp.", value: stats.sansTransp, color: stats.sansTransp > 0 ? C.red : C.muted },
        ].map(s => (
          <div key={s.label} style={{ padding: "10px 14px", background: C.s1, borderRadius: 6, border: `1px solid ${C.border}`, borderLeft: `3px solid ${s.color}` }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: "monospace" }}>{s.value}</div>
            <div style={{ fontSize: 10, color: C.muted }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Grille jours */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
        {weekDays.map((day, di) => {
          const dayChargs = byDay.get(day) || [];
          const isToday = day === today;
          return (
            <div key={day} style={{
              background: C.s1,
              border: `1px solid ${isToday ? C.green : C.border}`,
              borderRadius: 8, padding: 8, minHeight: 100,
            }}>
              <div style={{ textAlign: "center", marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 10, color: isToday ? C.green : C.sec, fontWeight: isToday ? 700 : 400 }}>
                  {JOURS_FR[di]}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: isToday ? C.green : C.text }}>
                  {new Date(day + "T12:00:00").getDate()}/{new Date(day + "T12:00:00").getMonth() + 1}
                </div>
                {dayChargs.length > 0 && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.orange, marginTop: 2 }}>
                    {dayChargs.length} chargement{dayChargs.length > 1 ? "s" : ""}
                  </div>
                )}
              </div>

              {dayChargs.length === 0 && (
                <div style={{ fontSize: 10, color: C.muted, textAlign: "center", padding: 20 }}>—</div>
              )}

              {dayChargs.map((ch, ci) => {
                const transp = TRANSPORTEURS.find(t => t.id === ch.transporteur);
                const zoneCol = ZONE_COLORS[ch.zone] || C.muted;
                const transpCol = transp?.c || C.muted;
                const totalPcs = ch.items.reduce((s, x) => s + (x.c.quantite || 0), 0);
                const hasRetard = ch.items.some(x => x.cc?.enRetard);
                const sansTransp = ch.transporteur === "_aucun";
                const sansZone = ch.zone === "_aucune";

                return (
                  <div key={ci} style={{
                    marginBottom: 8, padding: 8, borderRadius: 6,
                    background: C.bg,
                    border: `2px solid ${sansTransp ? C.red : transpCol}66`,
                    borderLeft: `5px solid ${zoneCol}`,
                  }}>
                    {/* Entête chargement */}
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: transpCol }}>
                          🚚 {transp?.label || "❗ Non défini"}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: zoneCol }}>
                          {sansZone ? "❗ Zone?" : ch.zone}
                        </span>
                      </div>
                      <div style={{ fontSize: 9, color: C.sec, display: "flex", gap: 8 }}>
                        <span>{ch.items.length} cmd</span>
                        <span style={{ color: C.teal }}>{totalPcs} pièces</span>
                        {hasRetard && <span style={{ color: C.red, fontWeight: 700 }}>⚠ retard</span>}
                      </div>
                    </div>

                    {/* Commandes */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {ch.items.map((x, ii) => {
                        const tm = TYPES_MENUISERIE[x.c.type];
                        return (
                          <div key={ii}
                            onClick={() => onEdit?.(x.c)}
                            style={{ padding: "3px 5px", background: C.s2, borderRadius: 3, cursor: "pointer" }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {x.c.client}
                            </div>
                            {(x.cmd as any).ref_chantier && (
                              <div style={{ fontSize: 9, color: C.teal, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {(x.cmd as any).ref_chantier}
                              </div>
                            )}
                            <div style={{ fontSize: 8, color: C.sec, display: "flex", gap: 4, alignItems: "center" }}>
                              {tm && <Bdg t={tm.label} c={tm.famille === "hors_standard" ? C.purple : CFAM[tm.famille] || C.blue} sz={8} />}
                              <span>×{x.c.quantite}</span>
                              {x.cc?.enRetard && <span style={{ color: C.red, fontWeight: 700 }}>+{x.cc.retardJours}j</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Actions rapides sur le chargement */}
                    {!sansTransp && !sansZone && (
                      <div style={{ marginTop: 6, display: "flex", gap: 4 }}>
                        <button
                          onClick={() => {
                            if (!confirm(`Marquer les ${ch.items.length} commande(s) du chargement comme livrées ?`)) return;
                            for (const x of ch.items) {
                              onPatch(String(x.c.id), { statut: "livre" });
                            }
                          }}
                          style={{ flex: 1, padding: "4px 0", background: C.green + "22", border: `1px solid ${C.green}44`, borderRadius: 3, color: C.green, fontSize: 9, fontWeight: 700, cursor: "pointer" }}>
                          ✓ Tout livré
                        </button>
                      </div>
                    )}
                    {(sansTransp || sansZone) && (
                      <div style={{ marginTop: 4, fontSize: 9, color: C.red, fontStyle: "italic" }}>
                        {sansTransp && "⚠ Transporteur manquant"}{sansTransp && sansZone && " · "}{sansZone && "⚠ Zone manquante"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
