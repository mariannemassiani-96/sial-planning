// ═══════════════════════════════════════════════════════════════════════
// VUE CHARGE / CAPACITÉ 8 SEMAINES
//
// Niveau intermédiaire entre PDP et Ordonnancement (cf. PIC/PDP/PDC/Ordo).
// Permet à Marianne de voir 2 mois à l'avance les saturations à venir
// et de lisser le carnet en avançant/retardant des commandes.
//
// Heatmap : ligne = poste, colonne = semaine S+0..S+7, cellule = saturation %.
// ═══════════════════════════════════════════════════════════════════════

"use client";
import { useMemo, useState, useEffect } from "react";
import { C, CommandeCC, hm, JOURS_FERIES, specialMultiplier, getWeekNum } from "@/lib/sial-data";
import { getRoutage } from "@/lib/routage-production";
import { postShortLabel, postCapacityMinDay, WORK_POSTS } from "@/lib/work-posts";
import { computeAllOEE, type OEEResult } from "@/lib/oee";
import { H } from "@/components/ui";

const NB_SEMAINES = 8;

function localStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getMondayOfWeek(offset: number): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  d.setHours(0, 0, 0, 0);
  return localStr(d);
}
function joursOuvresInWeek(monday: string): number {
  let count = 0;
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday + "T12:00:00");
    d.setDate(d.getDate() + i);
    if (!JOURS_FERIES[localStr(d)]) count++;
  }
  return count;
}

interface ChargeCell {
  postId: string;
  weekIdx: number;
  charge: number;       // minutes besoin
  capacity: number;     // minutes dispo (capacityMinDay × jours ouvrés)
  saturationPct: number;
}

export default function ChargeCapacite({ commandes }: { commandes: CommandeCC[] }) {
  const [filterPhase, setFilterPhase] = useState<string>("all");
  const [oeeResults, setOeeResults] = useState<OEEResult[]>([]);

  // Charger les métriques cerveau pour calculer l'OEE par poste
  useEffect(() => {
    fetch("/api/cerveau")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const metrics = d?.metrics || [];
        if (Array.isArray(metrics) && metrics.length > 0) {
          setOeeResults(computeAllOEE(metrics));
        }
      })
      .catch(() => {});
  }, []);

  // Semaines à analyser (S+0 à S+7)
  const semaines = useMemo(() => {
    return Array.from({ length: NB_SEMAINES }, (_, i) => {
      const monday = getMondayOfWeek(i);
      return {
        idx: i,
        monday,
        joursOuvres: joursOuvresInWeek(monday),
        numero: getWeekNum(monday),
      };
    });
  }, []);

  // Postes affichables (visibles + au moins 1 charge)
  const allPostIds = WORK_POSTS
    .filter(p => p.visible && (filterPhase === "all" || p.phase === filterPhase))
    .map(p => p.id);

  // Calcul de la charge par (poste × semaine)
  const cells = useMemo(() => {
    const map = new Map<string, ChargeCell>();
    // Index commandes par lundi de phase (semaine_coupe ou montage)
    for (const cmd of commandes) {
      const a = cmd as any;
      if (a.statut === "livre" || a.statut === "annulee" || a.statut === "terminee") continue;

      // Pour chaque phase, trouver à quelle semaine elle est planifiée
      const phasesMonday: Record<string, string> = {
        coupe: a.semaine_coupe,
        montage: a.semaine_montage,
        vitrage: a.semaine_vitrage,
        logistique: a.semaine_logistique,
        isula: a.semaine_isula,
      };

      // Charge par poste depuis le routage
      const lignes = Array.isArray(a.lignes) && a.lignes.length > 0
        ? a.lignes : [{ type: cmd.type, quantite: cmd.quantite }];
      for (const ligne of lignes) {
        const lType = ligne.type || cmd.type;
        if (lType === "intervention_chantier") continue;
        const lQte = parseInt(ligne.quantite) || cmd.quantite || 1;
        const lHs = lType === "hors_standard"
          ? { t_coupe: ligne.hs_t_coupe, t_montage: ligne.hs_t_montage, t_vitrage: ligne.hs_t_vitrage }
          : a.hsTemps;
        const lSf = specialMultiplier(parseFloat(ligne?.largeur_mm) || parseFloat(ligne?.largeur) || 0);
        const routage = getRoutage(lType, lQte, lHs as Record<string, unknown> | null, lSf);
        for (const e of routage) {
          // Trouver la semaine de ce poste
          const phaseMonday = phasesMonday[e.phase];
          if (!phaseMonday) continue;
          const wIdx = semaines.findIndex(s => s.monday === phaseMonday);
          if (wIdx < 0) continue;
          const k = `${e.postId}|${wIdx}`;
          const sem = semaines[wIdx];
          const cap = postCapacityMinDay(e.postId) * sem.joursOuvres;
          if (!map.has(k)) {
            map.set(k, { postId: e.postId, weekIdx: wIdx, charge: 0, capacity: cap, saturationPct: 0 });
          }
          map.get(k)!.charge += e.estimatedMin;
        }
      }
    }
    // Calculer saturation
    for (const cell of Array.from(map.values())) {
      cell.saturationPct = cell.capacity > 0 ? Math.round((cell.charge / cell.capacity) * 100) : 0;
    }
    return map;
  }, [commandes, semaines]);

  // Filtrer les postes qui ont au moins 1 charge cette fenêtre
  const visiblePostIds = useMemo(() => {
    const set = new Set<string>();
    for (const k of Array.from(cells.keys())) set.add(k.split("|")[0]);
    return allPostIds.filter(p => set.has(p));
  }, [cells, allPostIds]);

  const colorForSat = (pct: number): string => {
    if (pct === 0) return C.s2;
    if (pct < 50) return C.green + "33";
    if (pct < 80) return C.yellow + "33";
    if (pct < 100) return C.orange + "44";
    return C.red + "55";
  };
  const textColorForSat = (pct: number): string => {
    if (pct === 0) return C.muted;
    if (pct < 80) return C.text;
    if (pct < 100) return C.orange;
    return C.red;
  };

  return (
    <div>
      <H c={C.purple}>Charge / Capacité — 8 semaines</H>
      <div style={{ fontSize: 11, color: C.sec, marginBottom: 12 }}>
        Pour chaque poste, charge demandée vs capacité hebdo. Permet de voir
        2 mois à l&apos;avance les saturations et de lisser le carnet.
      </div>

      {/* Filtre par phase */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {[
          { id: "all", label: "Tous" },
          { id: "coupe", label: "Coupe" },
          { id: "montage", label: "Montage" },
          { id: "vitrage", label: "Vitrage" },
          { id: "isula", label: "ISULA" },
          { id: "logistique", label: "Logistique" },
        ].map(p => (
          <button key={p.id} onClick={() => setFilterPhase(p.id)}
            style={{
              padding: "4px 12px", fontSize: 11, fontWeight: 700,
              background: filterPhase === p.id ? C.purple + "33" : C.s2,
              border: `1px solid ${filterPhase === p.id ? C.purple : C.border}`,
              borderRadius: 4, color: filterPhase === p.id ? C.purple : C.sec,
              cursor: "pointer",
            }}>
            {p.label}
          </button>
        ))}
      </div>

      {visiblePostIds.length === 0 ? (
        <div style={{ textAlign: "center", padding: 30, color: C.sec, fontSize: 12 }}>
          Aucune charge planifiée sur les 8 prochaines semaines
          {filterPhase !== "all" && ` pour la phase ${filterPhase}`}.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 11, minWidth: "100%" }}>
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, zIndex: 2, background: C.s2, border: `1px solid ${C.border}`, padding: "6px 10px", minWidth: 130, textAlign: "left", fontSize: 10, color: C.sec }}>
                  POSTE
                </th>
                {semaines.map(s => (
                  <th key={s.idx} style={{
                    background: s.idx === 0 ? C.orange + "22" : C.s2, border: `1px solid ${C.border}`,
                    padding: "6px 8px", fontSize: 10, color: s.idx === 0 ? C.orange : C.sec,
                    fontWeight: 700, minWidth: 80, textAlign: "center",
                  }}>
                    <div>S{String(s.numero).padStart(2, "0")}{s.idx === 0 ? " (auj.)" : ""}</div>
                    <div style={{ fontSize: 9, fontWeight: 400, opacity: 0.7 }}>
                      {new Date(s.monday + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}
                      {s.joursOuvres < 5 && ` · ${s.joursOuvres}j`}
                    </div>
                  </th>
                ))}
                <th style={{ background: C.s2, border: `1px solid ${C.border}`, padding: "6px 8px", fontSize: 10, color: C.sec, minWidth: 70 }}>
                  TOTAL
                </th>
              </tr>
            </thead>
            <tbody>
              {visiblePostIds.map(pid => {
                const totalCharge = semaines.reduce((s, sem) => {
                  const c = cells.get(`${pid}|${sem.idx}`);
                  return s + (c?.charge || 0);
                }, 0);
                return (
                  <tr key={pid}>
                    <td style={{ position: "sticky", left: 0, zIndex: 1, background: C.s1, border: `1px solid ${C.border}`, padding: "6px 10px", verticalAlign: "middle" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{pid}</div>
                      <div style={{ fontSize: 9, color: C.sec }}>{postShortLabel(pid)}</div>
                    </td>
                    {semaines.map(sem => {
                      const cell = cells.get(`${pid}|${sem.idx}`);
                      const pct = cell?.saturationPct || 0;
                      return (
                        <td key={sem.idx} style={{
                          border: `1px solid ${C.border}`,
                          background: colorForSat(pct), padding: "6px 4px",
                          textAlign: "center", verticalAlign: "middle", minWidth: 80,
                        }}
                          title={cell
                            ? `${hm(cell.charge)} / ${hm(cell.capacity)}`
                            : "Aucune charge"}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: textColorForSat(pct) }}>
                            {pct > 0 ? `${pct}%` : "—"}
                          </div>
                          {cell && (
                            <div style={{ fontSize: 9, color: C.muted, marginTop: 1 }}>
                              {hm(cell.charge)}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td style={{ background: C.s1, border: `1px solid ${C.border}`, padding: "6px 8px", textAlign: "center" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>
                        {hm(totalCharge)}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {/* Ligne totaux par semaine */}
              <tr>
                <td style={{ position: "sticky", left: 0, background: C.s2, border: `1px solid ${C.border}`, padding: "6px 10px", fontSize: 10, color: C.sec, fontWeight: 700 }}>
                  TOTAL semaine
                </td>
                {semaines.map(sem => {
                  let total = 0;
                  for (const pid of visiblePostIds) {
                    const c = cells.get(`${pid}|${sem.idx}`);
                    total += c?.charge || 0;
                  }
                  return (
                    <td key={sem.idx} style={{ background: C.s2, border: `1px solid ${C.border}`, padding: "6px 4px", textAlign: "center" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>
                        {hm(total)}
                      </span>
                    </td>
                  );
                })}
                <td style={{ background: C.s2, border: `1px solid ${C.border}` }}></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Légende */}
      <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap", fontSize: 10, color: C.sec }}>
        <span>Saturation :</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 14, height: 14, background: C.green + "33", border: `1px solid ${C.border}` }} /> &lt; 50%
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 14, height: 14, background: C.yellow + "33", border: `1px solid ${C.border}` }} /> 50-80%
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 14, height: 14, background: C.orange + "44", border: `1px solid ${C.border}` }} /> 80-100%
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 14, height: 14, background: C.red + "55", border: `1px solid ${C.border}` }} /> &gt; 100% (surcharge)
        </span>
      </div>

      {/* OEE par poste — basé sur les pointages réels (cerveau) */}
      {oeeResults.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <H c={C.teal}>OEE / TRS par poste — basé sur le réel</H>
          <div style={{ fontSize: 11, color: C.sec, marginBottom: 8 }}>
            OEE = Disponibilité × Performance × Qualité (norme AFNOR NF E 60-182).
            Référence world class = 85%. Industrie standard ~60%.
          </div>
          <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%", maxWidth: 800 }}>
            <thead>
              <tr>
                <th style={{ background: C.s2, border: `1px solid ${C.border}`, padding: "6px 10px", textAlign: "left", fontSize: 10, color: C.sec }}>POSTE</th>
                <th style={{ background: C.s2, border: `1px solid ${C.border}`, padding: "6px 8px", fontSize: 10, color: C.sec }}>OEE</th>
                <th style={{ background: C.s2, border: `1px solid ${C.border}`, padding: "6px 8px", fontSize: 10, color: C.sec }}>Dispo</th>
                <th style={{ background: C.s2, border: `1px solid ${C.border}`, padding: "6px 8px", fontSize: 10, color: C.sec }}>Perf</th>
                <th style={{ background: C.s2, border: `1px solid ${C.border}`, padding: "6px 8px", fontSize: 10, color: C.sec }}>Qualité</th>
                <th style={{ background: C.s2, border: `1px solid ${C.border}`, padding: "6px 8px", fontSize: 10, color: C.sec }}>Mesures</th>
              </tr>
            </thead>
            <tbody>
              {oeeResults.map(r => {
                const oeeColor = r.rating === "world_class" ? C.green
                              : r.rating === "good"        ? C.yellow
                              : r.rating === "average"     ? C.orange
                                                            : C.red;
                const ratingLabel = r.rating === "world_class" ? "🏆 World class"
                                  : r.rating === "good"        ? "✓ Bon"
                                  : r.rating === "average"     ? "⚠ Moyen"
                                                                : "🔴 À améliorer";
                return (
                  <tr key={r.poste}>
                    <td style={{ background: C.s1, border: `1px solid ${C.border}`, padding: "6px 10px", verticalAlign: "middle" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{r.poste}</div>
                      <div style={{ fontSize: 9, color: C.sec }}>{postShortLabel(r.poste)}</div>
                    </td>
                    <td style={{ background: oeeColor + "22", border: `1px solid ${C.border}`, padding: "6px 8px", textAlign: "center" }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: oeeColor }}>{r.oee}%</div>
                      <div style={{ fontSize: 9, color: C.muted }}>{ratingLabel}</div>
                    </td>
                    <td style={{ border: `1px solid ${C.border}`, padding: "6px 8px", textAlign: "center", color: C.sec }}>{r.disponibilite}%</td>
                    <td style={{ border: `1px solid ${C.border}`, padding: "6px 8px", textAlign: "center", color: C.sec }}>{r.performance}%</td>
                    <td style={{ border: `1px solid ${C.border}`, padding: "6px 8px", textAlign: "center", color: C.sec }}>{r.qualite}%</td>
                    <td style={{ border: `1px solid ${C.border}`, padding: "6px 8px", textAlign: "center", color: C.muted, fontSize: 10 }}>{r.sampleSize}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
