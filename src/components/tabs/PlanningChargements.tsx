"use client";
import { useState, useMemo, useEffect } from "react";
import { C, CFAM, CommandeCC, TYPES_MENUISERIE, fmtDate, getWeekNum, calcCheminCritique, ZONES } from "@/lib/sial-data";
import { H, Bdg } from "@/components/ui";

const ZONE_COLORS: Record<string, string> = {
  "SIAL":             "#EC407A", // Rose
  "Porto-Vecchio":    "#FB8C00", // Orange
  "Ajaccio":          "#1E88E5", // Bleu
  "Bastia":           "#E53935", // Rouge
  "Balagne":          "#FDD835", // Jaune
  "Plaine Orientale": "#8E24AA", // Violet
  "Continent":        "#43A047", // Vert
  "Sur chantier":     "#6D4C41", // Marron
  "Autre":            "#546E7A", // Gris bleuté
};

function getZoneColor(zone: string | null | undefined, fallback = "#888"): string {
  if (!zone) return fallback;
  if (ZONE_COLORS[zone]) return ZONE_COLORS[zone];
  const norm = zone.trim().toLowerCase();
  for (const [k, v] of Object.entries(ZONE_COLORS)) {
    if (k.toLowerCase() === norm) return v;
  }
  return fallback;
}

const TRANSPORTEURS = [
  { id: "nous",    label: "Par nous-memes",        c: "#42A5F5" },
  { id: "setec",   label: "Par Setec",             c: "#FFA726" },
  { id: "express", label: "Transporteur express",  c: "#66BB6A" },
  { id: "poseur",  label: "Par un poseur",         c: "#AB47BC" },
  { id: "depot",   label: "Client au depot",       c: "#26C6DA" },
];

const JOURS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

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
  const [monday, setMonday] = useState(() => {
    const def = localStr(getMondayOf(new Date()));
    if (typeof window === "undefined") return def;
    try { return localStorage.getItem("sial_chargements_monday") || def; } catch { return def; }
  });
  useEffect(() => { try { localStorage.setItem("sial_chargements_monday", monday); } catch {} }, [monday]);

  const [filterZone, setFilterZone] = useState("");
  const [horizonWeeks, setHorizonWeeks] = useState(4); // combien de semaines à afficher

  const horizonDays = useMemo(() => {
    const days: string[] = [];
    for (let w = 0; w < horizonWeeks; w++) {
      for (let i = 0; i < 5; i++) {
        const d = new Date(monday + "T12:00:00");
        d.setDate(d.getDate() + w * 7 + i);
        days.push(localStr(d));
      }
    }
    return days;
  }, [monday, horizonWeeks]);

  interface Chargement {
    date: string;
    transporteur: string;
    zone: string;
    items: Array<{ cmd: any; c: CommandeCC; cc: ReturnType<typeof calcCheminCritique> }>;
  }

  // ── Construire les chargements sur l'horizon ──
  const chargements = useMemo(() => {
    const byKey = new Map<string, Chargement>();
    for (const c of commandes) {
      const cmd = c as any;
      const livDate = cmd.date_livraison_souhaitee;
      if (!livDate) continue;
      if (!horizonDays.includes(livDate)) continue;
      const statut = cmd.statut;
      if (statut === "annulee") continue;

      const transp = cmd.transporteur || "_aucun";
      const zoneG = cmd.zone || "_aucune";

      if (filterZone && zoneG !== filterZone) continue;

      const key = `${transp}|${livDate}|${zoneG}`;
      if (!byKey.has(key)) {
        byKey.set(key, { date: livDate, transporteur: transp, zone: zoneG, items: [] });
      }
      const cc = calcCheminCritique(c);
      byKey.get(key)!.items.push({ cmd, c, cc });
    }
    return Array.from(byKey.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [commandes, horizonDays, filterZone]);

  // ── Grouper par transporteur ──
  const byTransporteur = useMemo(() => {
    const map = new Map<string, Chargement[]>();
    const allTransp = ["nous", "setec", "express", "poseur", "depot", "_aucun"];
    for (const t of allTransp) map.set(t, []);
    for (const ch of chargements) {
      const arr = map.get(ch.transporteur) || [];
      arr.push(ch);
      map.set(ch.transporteur, arr);
    }
    return allTransp.map(t => ({ id: t, chargements: map.get(t) || [] })).filter(x => x.chargements.length > 0);
  }, [chargements]);

  // ── Stats ──
  const stats = useMemo(() => {
    const totalCharg = chargements.length;
    const totalCmds = chargements.reduce((s, ch) => s + ch.items.length, 0);
    const totalPieces = chargements.reduce((s, ch) => s + ch.items.reduce((ss, x) => ss + (x.c.quantite || 0), 0), 0);
    const sansTransp = chargements.filter(ch => ch.transporteur === "_aucun").length;
    const aPlanifier = chargements.filter(ch => ch.transporteur !== "_aucun" && ch.transporteur !== "depot" && ch.transporteur !== "nous").length;
    return { totalCharg, totalCmds, totalPieces, sansTransp, aPlanifier };
  }, [chargements]);

  const btn = { padding: "5px 10px", background: C.s1, border: `1px solid ${C.border}`, borderRadius: 4, color: C.sec, cursor: "pointer", fontSize: 11 };

  const dateLabel = (d: string) => {
    const dt = new Date(d + "T12:00:00");
    const dow = dt.getDay();
    return `${JOURS_FR[dow === 0 ? 6 : dow - 1]} ${dt.getDate()}/${dt.getMonth() + 1}`;
  };

  return (
    <div>
      <H c={C.orange}>📦 Chargements par transporteur</H>

      {/* Navigation + filtres */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <button onClick={() => setMonday(m => addWeeks(m, -1))} style={btn}>‹ Semaine préc.</button>
        <button onClick={() => setMonday(localStr(getMondayOf(new Date())))} style={btn}>Cette sem.</button>
        <button onClick={() => setMonday(m => addWeeks(m, 1))} style={btn}>Semaine suiv. ›</button>
        <span style={{ fontSize: 12, color: C.text, fontWeight: 700, marginLeft: 4 }}>
          À partir de S{getWeekNum(monday)} ({fmtDate(monday)})
        </span>

        <div style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: C.sec }}>Horizon :</span>
          {[2, 4, 8].map(w => (
            <button key={w} onClick={() => setHorizonWeeks(w)}
              style={{ ...btn, background: horizonWeeks === w ? C.orange + "22" : C.s1, border: `1px solid ${horizonWeeks === w ? C.orange : C.border}`, color: horizonWeeks === w ? C.orange : C.sec, fontWeight: horizonWeeks === w ? 700 : 400 }}>
              {w} sem.
            </button>
          ))}
          <select value={filterZone} onChange={e => setFilterZone(e.target.value)} style={{ ...btn, color: filterZone ? C.teal : C.sec }}>
            <option value="">Toutes zones</option>
            {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
            <option value="_aucune">— Non définie —</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6, marginBottom: 14 }}>
        {[
          { label: "Chargements", value: stats.totalCharg, color: C.orange },
          { label: "Commandes", value: stats.totalCmds, color: C.blue },
          { label: "Pièces", value: stats.totalPieces, color: C.teal },
          { label: "À planifier", value: stats.aPlanifier, color: C.yellow },
          { label: "Sans transp.", value: stats.sansTransp, color: stats.sansTransp > 0 ? C.red : C.muted },
        ].map(s => (
          <div key={s.label} style={{ padding: "8px 12px", background: C.s1, borderRadius: 6, border: `1px solid ${C.border}`, borderLeft: `3px solid ${s.color}` }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color, fontFamily: "monospace" }}>{s.value}</div>
            <div style={{ fontSize: 9, color: C.muted }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Liste par transporteur */}
      {byTransporteur.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: C.muted, fontSize: 12 }}>
          Aucun chargement sur les {horizonWeeks} prochaines semaines
        </div>
      )}

      {byTransporteur.map(grp => {
        const transp = TRANSPORTEURS.find(t => t.id === grp.id);
        const transpCol = transp?.c || C.muted;
        const transpLabel = transp?.label || "❗ Transporteur non défini";
        const totalCmds = grp.chargements.reduce((s, ch) => s + ch.items.length, 0);
        const totalPieces = grp.chargements.reduce((s, ch) => s + ch.items.reduce((ss, x) => ss + (x.c.quantite || 0), 0), 0);

        return (
          <div key={grp.id} style={{ marginBottom: 16, borderRadius: 8, overflow: "hidden", border: `1px solid ${transpCol}44` }}>
            {/* Entête transporteur */}
            <div style={{ padding: "10px 14px", background: transpCol + "22", borderBottom: `1px solid ${transpCol}66`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 800, color: transpCol }}>🚚 {transpLabel}</span>
                <span style={{ fontSize: 10, color: C.sec, marginLeft: 12 }}>
                  {grp.chargements.length} date{grp.chargements.length > 1 ? "s" : ""} à fixer · {totalCmds} cmd · {totalPieces} pièces
                </span>
              </div>
            </div>

            {/* Liste des chargements/dates */}
            <div style={{ background: C.s1 }}>
              {grp.chargements.map((ch, ci) => {
                const zoneCol = getZoneColor(ch.zone, C.muted);
                const totalPcs = ch.items.reduce((s, x) => s + (x.c.quantite || 0), 0);
                const hasRetard = ch.items.some(x => x.cc?.enRetard);
                const sansZone = ch.zone === "_aucune";

                return (
                  <div key={ci} style={{
                    padding: "10px 14px",
                    borderBottom: ci < grp.chargements.length - 1 ? `1px solid ${C.border}` : "none",
                    borderLeft: `4px solid ${zoneCol}`,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                          {dateLabel(ch.date)}
                        </span>
                        <span style={{ fontSize: 10, color: C.sec, fontFamily: "monospace" }}>
                          S{getWeekNum(ch.date)}
                        </span>
                        <span style={{
                          padding: "2px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                          background: zoneCol + "22", color: zoneCol, border: `1px solid ${zoneCol}66`,
                        }}>
                          {sansZone ? "⚠ Zone ?" : ch.zone}
                        </span>
                        <span style={{ fontSize: 10, color: C.sec }}>
                          · {ch.items.length} cmd · {totalPcs} pièces
                        </span>
                        {hasRetard && (
                          <span style={{ fontSize: 10, color: C.red, fontWeight: 700 }}>⚠ retard</span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          onClick={() => {
                            const newDate = prompt(`Nouvelle date de livraison (YYYY-MM-DD) pour ce chargement :`, ch.date);
                            if (!newDate || newDate === ch.date) return;
                            for (const x of ch.items) {
                              onPatch(String(x.c.id), { date_livraison_souhaitee: newDate });
                            }
                          }}
                          style={{ padding: "4px 10px", background: C.blue + "22", border: `1px solid ${C.blue}`, borderRadius: 4, color: C.blue, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                          Décaler
                        </button>
                        <button
                          onClick={() => {
                            if (!confirm(`Marquer les ${ch.items.length} commande(s) comme livrées ?`)) return;
                            for (const x of ch.items) {
                              onPatch(String(x.c.id), { statut: "livre" });
                            }
                          }}
                          style={{ padding: "4px 10px", background: C.green, border: "none", borderRadius: 4, color: "#000", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                          ✓ Tout livré
                        </button>
                      </div>
                    </div>

                    {/* Liste des commandes du chargement */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 6 }}>
                      {ch.items.map((x, ii) => {
                        const tm = TYPES_MENUISERIE[x.c.type];
                        return (
                          <div key={ii}
                            onClick={() => onEdit?.(x.c)}
                            style={{ padding: "6px 10px", background: C.bg, borderRadius: 4, cursor: "pointer", border: `1px solid ${C.border}` }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{x.c.client}</span>
                              {x.cc?.enRetard && (
                                <span style={{ fontSize: 9, color: C.red, fontWeight: 700 }}>+{x.cc.retardJours}j</span>
                              )}
                            </div>
                            {(x.cmd as any).ref_chantier && (
                              <div style={{ fontSize: 10, color: C.teal, marginTop: 1 }}>{(x.cmd as any).ref_chantier}</div>
                            )}
                            <div style={{ fontSize: 9, color: C.sec, marginTop: 2, display: "flex", gap: 6, alignItems: "center" }}>
                              {tm && <Bdg t={tm.label} c={tm.famille === "hors_standard" ? C.purple : CFAM[tm.famille] || C.blue} sz={9} />}
                              <span>×{x.c.quantite}</span>
                              {(x.cmd as any).num_commande && <span style={{ fontFamily: "monospace", color: C.muted }}>{(x.cmd as any).num_commande}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
