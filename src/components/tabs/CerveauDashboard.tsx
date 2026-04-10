"use client";
import { useState, useEffect } from "react";
import { C, hm } from "@/lib/sial-data";

const RAISON_LABELS: Record<string, string> = {
  manque_temps: "⏰ Manque de temps", manque_accessoire: "🔩 Manque accessoire",
  manque_profil: "📦 Manque profilé", manque_vitrage: "🪟 Manque vitrage",
  manque_dossier: "📋 Manque dossier", manque_info: "❓ Manque info",
  panne_machine: "⚙ Panne machine", probleme_qualite: "⚠ Problème qualité",
  absence: "👤 Absence", priorite_changee: "🔄 Priorité changée", autre: "📝 Autre",
};

const SEVERITY_COLORS = { info: C.blue, warning: C.orange, critical: C.red };

export default function CerveauDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/cerveau")
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: C.sec }}>Chargement du cerveau...</div>;
  if (!data) return <div style={{ textAlign: "center", padding: 40, color: C.sec }}>Aucune donnée disponible. Commencez à pointer pour alimenter le cerveau.</div>;

  const { stats, tempsAppris, operateurs, alertes } = data;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>🧠 Cerveau</div>
        <div style={{ fontSize: 11, color: C.sec, flex: 1 }}>
          {stats.nbPointages} jours · {stats.nbEntries} tâches · {stats.totalHeuresPointees ? hm(stats.totalHeuresPointees) + " pointées" : ""}
          {stats.lastUpdate && ` · MàJ ${new Date(stats.lastUpdate).toLocaleDateString("fr-FR")} ${new Date(stats.lastUpdate).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`}
        </div>
        <button onClick={() => {
          fetch("/api/cerveau/learn").then(() => window.location.reload());
        }} style={{ padding: "6px 14px", background: C.orange, border: "none", borderRadius: 4, color: "#000", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
          Lancer l&apos;apprentissage
        </button>
      </div>

      {(data as any)?.message && (
        <div style={{ padding: "10px 14px", background: C.blue + "12", border: `1px solid ${C.blue}44`, borderRadius: 6, marginBottom: 16, fontSize: 12, color: C.blue }}>
          {(data as any).message}
        </div>
      )}

      {/* Alertes proactives */}
      {alertes.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Alertes et recommandations</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {alertes.map((a: any, i: number) => (
              <div key={i} style={{ padding: "8px 12px", background: SEVERITY_COLORS[a.severity as keyof typeof SEVERITY_COLORS] + "12", border: `1px solid ${SEVERITY_COLORS[a.severity as keyof typeof SEVERITY_COLORS]}44`, borderRadius: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: SEVERITY_COLORS[a.severity as keyof typeof SEVERITY_COLORS] }}>{a.message}</div>
                <div style={{ fontSize: 11, color: C.sec, marginTop: 2 }}>{a.details}</div>
                <div style={{ fontSize: 11, color: C.green, marginTop: 2 }}>💡 {a.suggestion}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        {/* Temps appris par poste */}
        <div style={{ flex: 1, minWidth: 300, background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6, padding: "12px 14px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Temps réels appris par poste</div>
          {tempsAppris.length === 0 ? <div style={{ color: C.muted }}>Pas assez de données</div> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ padding: "4px 6px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "left" }}>Poste</th>
                  <th style={{ padding: "4px 6px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center" }}>Échantillons</th>
                  <th style={{ padding: "4px 6px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center" }}>Moyenne</th>
                  <th style={{ padding: "4px 6px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center" }}>Min-Max</th>
                  <th style={{ padding: "4px 6px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center" }}>Tendance</th>
                </tr>
              </thead>
              <tbody>
                {tempsAppris.map((t: any) => (
                  <tr key={t.postId}>
                    <td style={{ padding: "4px 6px", border: `1px solid ${C.border}`, fontWeight: 700, color: C.blue }}>{t.postId}</td>
                    <td style={{ padding: "4px 6px", border: `1px solid ${C.border}`, textAlign: "center" }}>{t.nbSamples}</td>
                    <td style={{ padding: "4px 6px", border: `1px solid ${C.border}`, textAlign: "center" }} className="mono">{hm(t.moyenneMin)}</td>
                    <td style={{ padding: "4px 6px", border: `1px solid ${C.border}`, textAlign: "center", fontSize: 10, color: C.muted }}>{hm(t.minMin)} — {hm(t.maxMin)}</td>
                    <td style={{ padding: "4px 6px", border: `1px solid ${C.border}`, textAlign: "center", color: t.tendance === "amelioration" ? C.green : t.tendance === "degradation" ? C.red : C.sec }}>
                      {t.tendance === "amelioration" ? "📈 Mieux" : t.tendance === "degradation" ? "📉 Pire" : "➡ Stable"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Profil opérateurs */}
        <div style={{ flex: 1, minWidth: 300, background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6, padding: "12px 14px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Profil opérateurs (appris)</div>
          {operateurs.length === 0 ? <div style={{ color: C.muted }}>Pas assez de données</div> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ padding: "4px 6px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "left" }}>Opérateur</th>
                  <th style={{ padding: "4px 6px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center" }}>Fiabilité</th>
                  <th style={{ padding: "4px 6px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center" }}>Taux fin.</th>
                  <th style={{ padding: "4px 6px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center" }}>H/jour</th>
                  <th style={{ padding: "4px 6px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "left" }}>Postes préférés</th>
                </tr>
              </thead>
              <tbody>
                {operateurs.sort((a: any, b: any) => b.fiabilite - a.fiabilite).map((op: any) => (
                  <tr key={op.nom}>
                    <td style={{ padding: "4px 6px", border: `1px solid ${C.border}`, fontWeight: 700 }}>{op.nom}</td>
                    <td style={{ padding: "4px 6px", border: `1px solid ${C.border}`, textAlign: "center", fontWeight: 700, color: op.fiabilite >= 80 ? C.green : op.fiabilite >= 50 ? C.orange : C.red }}>{op.fiabilite}%</td>
                    <td style={{ padding: "4px 6px", border: `1px solid ${C.border}`, textAlign: "center" }}>{op.tauxCompletion}%</td>
                    <td style={{ padding: "4px 6px", border: `1px solid ${C.border}`, textAlign: "center" }} className="mono">{hm(op.heuresMoyJour)}</td>
                    <td style={{ padding: "4px 6px", border: `1px solid ${C.border}`, fontSize: 10, color: C.sec }}>{op.postesPrefs.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
