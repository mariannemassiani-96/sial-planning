"use client";
import { useState, useEffect, useMemo } from "react";
import { C, EQUIPE, hm } from "@/lib/sial-data";

function localStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getMonday(d: Date): Date {
  const day = d.getDay(); d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

interface DayPointage {
  date: string;
  entries: Record<string, { pct: number; realMin: number; realOps: string[]; status: string; raison: string }>;
  imprevu: Array<{ label: string; realMin: number; ops: string[] }>;
}

export default function AnalyseProduction() {
  const [periode, setPeriode] = useState<"semaine" | "mois">("semaine");
  const [data, setData] = useState<DayPointage[]>([]);
  const [loading, setLoading] = useState(true);

  // Calculer la plage de dates
  const { from, to } = useMemo(() => {
    const now = new Date();
    if (periode === "semaine") {
      const mon = getMonday(new Date(now));
      const ven = new Date(mon); ven.setDate(mon.getDate() + 4);
      return { from: localStr(mon), to: localStr(ven) };
    }
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: localStr(first), to: localStr(last) };
  }, [periode]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/analyse?from=${from}&to=${to}`)
      .then(r => r.ok ? r.json() : { days: [] })
      .then(d => {
        const days: DayPointage[] = (d.days || []).map((day: any) => ({
          date: day.date,
          entries: day.data?.entries || day.data || {},
          imprevu: day.data?.imprevu || [],
        }));
        setData(days);
        setLoading(false);
      })
      .catch(() => { setData([]); setLoading(false); });
  }, [from, to]);

  // Agrégations
  const stats = useMemo(() => {
    // Par opérateur : heures pointées, heures théoriques
    const opStats: Record<string, { pointed: number; theorique: number; tasks: number; days: Set<string> }> = {};
    // Par raison de blocage
    const raisonStats: Record<string, number> = {};
    // Par poste : estimé vs réel
    const posteStats: Record<string, { count: number; totalReal: number }> = {};

    for (const day of data) {
      // const dayDate = new Date(day.date + "T00:00:00");

      for (const [key, entry] of Object.entries(day.entries)) {
        if (!entry) continue;
        const postId = key.split("|")[0];

        // Raisons
        if (entry.raison) raisonStats[entry.raison] = (raisonStats[entry.raison] || 0) + 1;

        // Par poste
        if (entry.realMin > 0) {
          if (!posteStats[postId]) posteStats[postId] = { count: 0, totalReal: 0 };
          posteStats[postId].count++;
          posteStats[postId].totalReal += entry.realMin;
        }

        // Par opérateur
        const ops = entry.realOps?.length > 0 ? entry.realOps : [];
        const perOp = ops.length > 0 && entry.realMin > 0 ? Math.round(entry.realMin / ops.length) : 0;
        for (const op of ops) {
          if (!opStats[op]) {
            const eq = EQUIPE.find(e => e.nom === op);
            opStats[op] = { pointed: 0, theorique: 0, tasks: 0, days: new Set() };
            // On calculera le théorique par jour unique
            void eq;
          }
          opStats[op].pointed += perOp;
          opStats[op].tasks++;
          opStats[op].days.add(day.date);
        }
      }
    }

    // Calculer théorique par opérateur (basé sur les jours où il a pointé)
    for (const [opName, stat] of Object.entries(opStats)) {
      const eq = EQUIPE.find(e => e.nom === opName);
      stat.days.forEach(dayStr => {
        const isVen = new Date(dayStr + "T00:00:00").getDay() === 5;
        const maxDay = isVen
          ? (eq?.h === 39 ? 420 : eq?.h === 36 ? 240 : eq?.h === 35 ? 420 : 450)
          : (eq?.h === 39 ? 480 : eq?.h === 36 ? 480 : eq?.h === 35 ? 420 : 450);
        stat.theorique += maxDay;
      });
    }

    return { opStats, raisonStats, posteStats };
  }, [data]);

  const RAISON_LABELS: Record<string, string> = {
    manque_temps: "⏰ Manque de temps", manque_accessoire: "🔩 Manque accessoire",
    manque_profil: "📦 Manque profilé", manque_vitrage: "🪟 Manque vitrage",
    manque_dossier: "📋 Manque dossier", manque_info: "❓ Manque info",
    panne_machine: "⚙ Panne machine", probleme_qualite: "⚠ Problème qualité",
    absence: "👤 Absence", priorite_changee: "🔄 Priorité changée", autre: "📝 Autre",
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <span style={{ fontSize: 16, fontWeight: 800 }}>Analyse Production</span>
        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          {(["semaine", "mois"] as const).map(p => (
            <button key={p} onClick={() => setPeriode(p)} style={{
              padding: "5px 14px", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
              background: periode === p ? C.orange + "33" : C.s2, color: periode === p ? C.orange : C.sec,
            }}>{p === "semaine" ? "Cette semaine" : "Ce mois"}</button>
          ))}
        </div>
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 40, color: C.sec }}>Chargement...</div> : (
        <>
          {/* Productivité par opérateur */}
          <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6, padding: "12px 14px", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Productivité par opérateur</div>
            {Object.keys(stats.opStats).length === 0 ? (
              <div style={{ color: C.muted, fontSize: 12 }}>Aucun pointage sur la période {from} → {to}</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ padding: "6px 8px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "left" }}>Opérateur</th>
                    <th style={{ padding: "6px 8px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center" }}>Jours</th>
                    <th style={{ padding: "6px 8px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center" }}>Tâches</th>
                    <th style={{ padding: "6px 8px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center" }}>Heures pointées</th>
                    <th style={{ padding: "6px 8px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center" }}>Heures théoriques</th>
                    <th style={{ padding: "6px 8px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center" }}>Taux</th>
                    <th style={{ padding: "6px 8px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center" }}>Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(stats.opStats).sort((a, b) => b[1].pointed - a[1].pointed).map(([op, s]) => {
                    const pct = s.theorique > 0 ? Math.round(s.pointed / s.theorique * 100) : 0;
                    const ecart = s.pointed - s.theorique;
                    const col = pct > 100 ? C.red : pct >= 70 ? C.green : C.orange;
                    return (
                      <tr key={op}>
                        <td style={{ padding: "5px 8px", border: `1px solid ${C.border}`, fontWeight: 700 }}>{op}</td>
                        <td style={{ padding: "5px 8px", border: `1px solid ${C.border}`, textAlign: "center" }}>{s.days.size}</td>
                        <td style={{ padding: "5px 8px", border: `1px solid ${C.border}`, textAlign: "center" }}>{s.tasks}</td>
                        <td style={{ padding: "5px 8px", border: `1px solid ${C.border}`, textAlign: "center" }} className="mono">{hm(s.pointed)}</td>
                        <td style={{ padding: "5px 8px", border: `1px solid ${C.border}`, textAlign: "center" }} className="mono">{hm(s.theorique)}</td>
                        <td style={{ padding: "5px 8px", border: `1px solid ${C.border}`, textAlign: "center", fontWeight: 700, color: col }}>{pct}%</td>
                        <td style={{ padding: "5px 8px", border: `1px solid ${C.border}`, textAlign: "center", color: ecart > 0 ? C.red : ecart < -60 ? C.orange : C.sec }}>
                          {ecart > 0 ? `+${hm(ecart)} HS` : ecart < 0 ? `${hm(Math.abs(ecart))} non justifié` : "="}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Raisons de blocage */}
          <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
            <div style={{ flex: 1, background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6, padding: "12px 14px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Top raisons de blocage</div>
              {Object.keys(stats.raisonStats).length === 0 ? (
                <div style={{ color: C.muted, fontSize: 12 }}>Aucun blocage enregistré</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {Object.entries(stats.raisonStats).sort((a, b) => b[1] - a[1]).map(([raison, count]) => (
                    <div key={raison} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, fontSize: 11 }}>{RAISON_LABELS[raison] || raison}</div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: C.orange }}>{count}</div>
                      <div style={{ width: 100, height: 6, background: C.s2, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(count * 20, 100)}%`, height: "100%", background: C.orange, borderRadius: 3 }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Temps moyen par poste */}
            <div style={{ flex: 1, background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6, padding: "12px 14px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Temps moyen réel par poste</div>
              {Object.keys(stats.posteStats).length === 0 ? (
                <div style={{ color: C.muted, fontSize: 12 }}>Aucune donnée</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {Object.entries(stats.posteStats).sort((a, b) => b[1].totalReal - a[1].totalReal).map(([poste, s]) => (
                    <div key={poste} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 700, color: C.blue, width: 30 }}>{poste}</span>
                      <span style={{ flex: 1, fontSize: 11, color: C.sec }}>{s.count} tâches</span>
                      <span className="mono" style={{ fontWeight: 700, color: C.text }}>{hm(Math.round(s.totalReal / s.count))}</span>
                      <span style={{ fontSize: 9, color: C.muted }}>moy/tâche</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
