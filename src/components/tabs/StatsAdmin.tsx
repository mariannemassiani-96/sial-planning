"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, ReferenceLine,
} from "recharts";
import { C } from "@/lib/sial-data";

// ── Types ────────────────────────────────────────────────────────────────────

interface PosteStat {
  workPostId: string;
  nbTaches: number;
  ecartMoyenMin: number | null;
  nbDepassements: number;
  nbBlocages: number;
}
interface DetailRow {
  id: string;
  workpostid: string;
  label: string;
  estimatedminutes: number;
  actualminutes: number | null;
  status: string;
  completedat: string | null;
  refchantier: string;
  clientname: string;
}
interface PostesData {
  period: string;
  postes: PosteStat[];
  detailByPost: Record<string, DetailRow[]>;
}

interface NcItem {
  menuiserieType: string;
  severity: string;
  status: string;
  workPostId: string | null;
  nb: number;
}
interface NcTotal { severity: string; status: string; nb: number; }
interface NcData { period: string; nc: NcItem[]; totaux: NcTotal[]; }

interface SpecialItem {
  fabItemId: string;
  label: string;
  specialType: string | null;
  refChantier: string;
  clientName: string;
  estTotal: number | null;
  actualTotal: number | null;
  ecartMin: number | null;
  nbTaches: number;
  nbDone: number;
  nbBlocked: number;
}
interface SpecialSummary {
  estTotal: number;
  actualTotal: number;
  nbSpeciaux: number;
  nbDoneComplete: number;
}
interface SpeciauxData {
  period: string;
  speciaux: SpecialItem[];
  summary: SpecialSummary;
}

interface FluxWeek { label: string; isoKey: string; nbAttente: number; dureeMovH: number | null; }
interface BufferStock {
  type: string; label: string; quantity: number; unit: string;
  min: number | null; cible: number | null; max: number | null; alert: boolean;
}
interface FluxData { fluxChart: FluxWeek[]; stocks: BufferStock[]; enAttente: number; }

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtMin(min: number | null): string {
  if (min === null || min === undefined) return "—";
  const sign = min < 0 ? "-" : min > 0 ? "+" : "";
  const abs = Math.abs(min);
  if (abs < 60) return `${sign}${abs}min`;
  return `${sign}${Math.floor(abs / 60)}h${String(Math.round(abs % 60)).padStart(2, "0")}`;
}

function fmtMinAbs(min: number | null): string {
  if (min === null || min === undefined) return "—";
  if (min < 60) return `${min}min`;
  return `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, "0")}`;
}

function ecartColor(ecart: number | null): string {
  if (ecart === null) return C.sec;
  if (ecart > 30) return C.red;
  if (ecart > 10) return C.yellow;
  if (ecart < -10) return C.teal;
  return C.green;
}

const PERIOD_OPTIONS = [
  { value: "7",   label: "7 derniers jours" },
  { value: "30",  label: "30 derniers jours" },
  { value: "all", label: "Tout l'historique" },
];

const SEV_COLORS: Record<string, string> = { BLOCKING: C.red, MINOR: C.yellow };
const SEV_LABELS: Record<string, string> = { BLOCKING: "Bloquant", MINOR: "Mineur" };
const NC_STATUS_LABELS: Record<string, string> = {
  DETECTED: "Détectée", IN_PROGRESS: "En cours", RESOLVED: "Résolue",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 6, padding: "16px 20px", flex: 1, minWidth: 160 }}>
      <div style={{ fontSize: 11, color: C.sec, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color ?? C.text }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, color: C.orange, marginBottom: 12, borderBottom: `1px solid ${C.border}`, paddingBottom: 6 }}>
      {children}
    </div>
  );
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 10, color: C.sec, width: 28, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function BufferBar({ stock }: { stock: BufferStock }) {
  if (stock.max === null || stock.cible === null || stock.min === null) {
    return <span style={{ fontSize: 11, color: C.sec }}>{stock.quantity} {stock.unit}</span>;
  }
  const pct = Math.min(100, (stock.quantity / stock.max) * 100);
  const minPct = (stock.min / stock.max) * 100;
  const ciblePct = (stock.cible / stock.max) * 100;
  const barColor = stock.quantity < stock.min ? C.red : stock.quantity < stock.cible ? C.yellow : C.green;
  return (
    <div style={{ position: "relative", height: 12, background: C.border, borderRadius: 3, overflow: "visible", marginTop: 4 }}>
      <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 3 }} />
      <div style={{ position: "absolute", top: -2, left: `${minPct}%`, width: 2, height: 16, background: C.red, opacity: 0.7 }} title={`Min: ${stock.min}`} />
      <div style={{ position: "absolute", top: -2, left: `${ciblePct}%`, width: 2, height: 16, background: C.green, opacity: 0.7 }} title={`Cible: ${stock.cible}`} />
    </div>
  );
}

// ── CSV export ────────────────────────────────────────────────────────────────

function exportCSV(filename: string, headers: string[], rows: (string | number | null)[][]) {
  const lines = [headers.join(";"), ...rows.map((r) => r.map((v) => v ?? "").join(";"))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Kaizen analysis ───────────────────────────────────────────────────────────

function generateKaizen(postes: PosteStat[], nc: NcItem[], speciaux: SpecialItem[]): string {
  const lines: string[] = [];
  lines.push("=== ANALYSE KAIZEN / MUDA ANALYSIS ===");
  lines.push(`Générée le ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString("fr-FR")}`);
  lines.push("");

  // Top postes en dépassement
  const sorted = [...postes].sort((a, b) => (b.ecartMoyenMin ?? -999) - (a.ecartMoyenMin ?? -999));
  const topDepassement = sorted.slice(0, 3).filter((p) => (p.ecartMoyenMin ?? 0) > 0);
  if (topDepassement.length > 0) {
    lines.push("── Postes à améliorer (écart temps > 0) ──");
    topDepassement.forEach((p) => {
      lines.push(`• ${p.workPostId} : écart moyen ${fmtMin(p.ecartMoyenMin)}, ${p.nbDepassements} dépassements sur ${p.nbTaches} tâches (${Math.round((p.nbDepassements / p.nbTaches) * 100)}%)`);
    });
    lines.push("");
  }

  // Postes avec blocages fréquents
  const topBlocages = [...postes].filter((p) => p.nbBlocages > 0).sort((a, b) => b.nbBlocages - a.nbBlocages).slice(0, 3);
  if (topBlocages.length > 0) {
    lines.push("── Postes avec le plus de blocages ──");
    topBlocages.forEach((p) => {
      lines.push(`• ${p.workPostId} : ${p.nbBlocages} blocages sur ${p.nbTaches} tâches`);
    });
    lines.push("");
  }

  // NC bloquantes par type menuiserie
  const ncBlocking = nc.filter((n) => n.severity === "BLOCKING");
  if (ncBlocking.length > 0) {
    const byType: Record<string, number> = {};
    ncBlocking.forEach((n) => { byType[n.menuiserieType] = (byType[n.menuiserieType] ?? 0) + n.nb; });
    const sorted2 = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 3);
    lines.push("── Non-conformités bloquantes par type ──");
    sorted2.forEach(([type, nb]) => { lines.push(`• ${type} : ${nb} NC bloquantes`); });
    lines.push("");
  }

  // Spéciaux les plus en dépassement
  const topSpeciaux = [...speciaux]
    .filter((s) => s.ecartMin !== null && s.ecartMin > 0)
    .sort((a, b) => (b.ecartMin ?? 0) - (a.ecartMin ?? 0))
    .slice(0, 3);
  if (topSpeciaux.length > 0) {
    lines.push("── Châssis spéciaux en dépassement ──");
    topSpeciaux.forEach((s) => {
      lines.push(`• ${s.refChantier} / ${s.label} : estimé ${fmtMinAbs(s.estTotal)}, réel ${fmtMinAbs(s.actualTotal)}, écart +${fmtMin(s.ecartMin)}`);
    });
    lines.push("");
  }

  // Recommandations
  lines.push("── Recommandations ──");
  if (topDepassement.length > 0) {
    lines.push(`→ Revoir les gammes de temps sur ${topDepassement.map((p) => p.workPostId).join(", ")}`);
  }
  if (topBlocages.length > 0) {
    lines.push(`→ Analyser les causes de blocage sur ${topBlocages.map((p) => p.workPostId).join(", ")}`);
  }
  const totalNcBlocking = nc.filter((n) => n.severity === "BLOCKING" && n.status !== "RESOLVED").reduce((s, n) => s + n.nb, 0);
  if (totalNcBlocking > 0) {
    lines.push(`→ ${totalNcBlocking} NC bloquantes non résolues — traiter en priorité`);
  }
  lines.push("");
  lines.push("=== FIN ANALYSE ===");
  return lines.join("\n");
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StatsAdmin() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string })?.role === "ADMIN";

  const [period, setPeriod] = useState("30");
  const [postesData, setPostesData] = useState<PostesData | null>(null);
  const [ncData, setNcData] = useState<NcData | null>(null);
  const [speciauxData, setSpeciauxData] = useState<SpeciauxData | null>(null);
  const [fluxData, setFluxData] = useState<FluxData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [drillPost, setDrillPost] = useState<string | null>(null);
  const [kaizenText, setKaizenText] = useState<string | null>(null);

  const fetchAll = useCallback(async (p: string) => {
    setLoading(true);
    setError(null);
    try {
      const [r1, r2, r3, r4] = await Promise.all([
        fetch(`/api/stats/postes?period=${p}`),
        fetch(`/api/stats/nc?period=${p}`),
        fetch(`/api/stats/speciaux?period=${p}`),
        fetch(`/api/stats/flux-inter-ateliers`),
      ]);
      if (!r1.ok || !r2.ok || !r3.ok || !r4.ok) throw new Error("Erreur lors du chargement");
      const [d1, d2, d3, d4] = await Promise.all([r1.json(), r2.json(), r3.json(), r4.json()]);
      setPostesData(d1);
      setNcData(d2);
      setSpeciauxData(d3);
      setFluxData(d4);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (isAdmin) fetchAll(period); }, [isAdmin, period, fetchAll]);

  if (!isAdmin) {
    return (
      <div style={{ padding: 60, textAlign: "center", color: C.sec }}>
        Accès réservé à l'administrateur.
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: "center", color: C.sec }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
        Chargement des statistiques…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: C.red }}>
        {error}
        <br />
        <button onClick={() => fetchAll(period)} style={{ marginTop: 12, padding: "6px 16px", background: C.s2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, cursor: "pointer" }}>
          Réessayer
        </button>
      </div>
    );
  }

  const postes  = postesData?.postes ?? [];
  const nc      = ncData?.nc ?? [];
  const ncTotaux = ncData?.totaux ?? [];
  const speciaux = speciauxData?.speciaux ?? [];
  const summary  = speciauxData?.summary;
  const fluxChart = fluxData?.fluxChart ?? [];
  const stocks    = fluxData?.stocks ?? [];

  // ── Section 1 : Métriques globales ─────────────────────────────────────────
  const totalTaches = postes.reduce((s, p) => s + p.nbTaches, 0);
  const totalDepassements = postes.reduce((s, p) => s + p.nbDepassements, 0);
  const totalBlocages = postes.reduce((s, p) => s + p.nbBlocages, 0);
  const totalNcBlocking = ncTotaux.filter((n) => n.severity === "BLOCKING" && n.status !== "RESOLVED").reduce((s, n) => s + n.nb, 0);
  const tauxDepassement = totalTaches > 0 ? Math.round((totalDepassements / totalTaches) * 100) : 0;

  // ── Section 2 : Chart postes ────────────────────────────────────────────────
  const maxEcart = Math.max(...postes.map((p) => Math.abs(p.ecartMoyenMin ?? 0)), 1);
  const postesChartData = postes.map((p) => ({
    name:         p.workPostId,
    ecart:        p.ecartMoyenMin ?? 0,
    depassements: p.nbDepassements,
    blocages:     p.nbBlocages,
  }));

  // ── Section 3 : NC par type menuiserie ──────────────────────────────────────
  const ncByType: Record<string, { BLOCKING: number; MINOR: number }> = {};
  nc.forEach((n) => {
    if (!ncByType[n.menuiserieType]) ncByType[n.menuiserieType] = { BLOCKING: 0, MINOR: 0 };
    ncByType[n.menuiserieType][n.severity as "BLOCKING" | "MINOR"] += n.nb;
  });
  const ncChartData = Object.entries(ncByType)
    .sort((a, b) => (b[1].BLOCKING + b[1].MINOR) - (a[1].BLOCKING + a[1].MINOR))
    .slice(0, 10)
    .map(([type, v]) => ({ name: type.replace("_", " ").replace("_", " "), ...v }));

  // ── Section 4 : Spéciaux ────────────────────────────────────────────────────
  const speciauxChartData = speciaux
    .filter((s) => s.estTotal !== null)
    .slice(0, 12)
    .map((s) => ({
      name:   `${s.refChantier}`,
      estimé: s.estTotal ?? 0,
      réel:   s.actualTotal ?? 0,
    }));

  return (
    <div style={{ padding: "0 0 40px" }}>
      {/* Header + filtres */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Statistiques Admin</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: C.sec }}>Période :</span>
          {PERIOD_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => { setPeriod(o.value); setDrillPost(null); setKaizenText(null); }}
              style={{
                padding: "4px 10px", fontSize: 11, borderRadius: 4, cursor: "pointer",
                background: period === o.value ? C.orange : C.s2,
                color:      period === o.value ? "#000" : C.sec,
                border:     `1px solid ${period === o.value ? C.orange : C.border}`,
                fontWeight: period === o.value ? 700 : 400,
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Section 1 : Métriques ───────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <MetricCard label="Tâches terminées / bloquées" value={totalTaches} />
        <MetricCard
          label="Taux de dépassement"
          value={`${tauxDepassement}%`}
          sub={`${totalDepassements} tâches > 120% du temps estimé`}
          color={tauxDepassement > 30 ? C.red : tauxDepassement > 15 ? C.yellow : C.green}
        />
        <MetricCard
          label="Blocages enregistrés"
          value={totalBlocages}
          color={totalBlocages > 10 ? C.red : totalBlocages > 3 ? C.yellow : C.text}
        />
        <MetricCard
          label="NC bloquantes ouvertes"
          value={totalNcBlocking}
          color={totalNcBlocking > 0 ? C.red : C.green}
          sub={totalNcBlocking === 0 ? "Aucune NC bloquante" : "À traiter en priorité"}
        />
      </div>

      {/* ── Section 2 : Performance par poste ─────────────────────────────── */}
      <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6, padding: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <SectionTitle>Performance par poste</SectionTitle>
          <button
            onClick={() => {
              exportCSV(
                `stats-postes-${period}.csv`,
                ["Poste","Nb tâches","Écart moyen (min)","Dépassements","Blocages"],
                postes.map((p) => [p.workPostId, p.nbTaches, p.ecartMoyenMin, p.nbDepassements, p.nbBlocages])
              );
            }}
            style={{ fontSize: 10, padding: "3px 10px", background: C.s2, border: `1px solid ${C.border}`, color: C.sec, borderRadius: 3, cursor: "pointer" }}
          >
            ⬇ CSV
          </button>
        </div>

        {postes.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 12, textAlign: "center", padding: 20 }}>Aucune donnée pour la période</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={postesChartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="name" tick={{ fill: C.sec, fontSize: 10 }} />
                <YAxis tick={{ fill: C.sec, fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: C.s2, border: `1px solid ${C.border}`, fontSize: 11 }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any, name: any) => {
                    const n = typeof v === "number" ? v : null;
                    if (name === "ecart") return [fmtMin(n), "Écart moyen"];
                    if (name === "depassements") return [n ?? v, "Dépassements"];
                    return [v, name];
                  }}
                />
                <ReferenceLine y={0} stroke={C.border} />
                <Bar dataKey="ecart" name="Écart moyen (min)" fill={C.orange} radius={[2, 2, 0, 0]} />
                <Bar dataKey="depassements" name="Dépassements" fill={C.red} radius={[2, 2, 0, 0]} />
                <Bar dataKey="blocages" name="Blocages" fill={C.yellow} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            {/* Table */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginTop: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {["Poste","Tâches","Écart moyen","Dépass.","Blocages",""].map((h) => (
                    <th key={h} style={{ padding: "4px 8px", textAlign: "left", color: C.sec, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {postes.map((p) => (
                  <>
                    <tr
                      key={p.workPostId}
                      onClick={() => setDrillPost(drillPost === p.workPostId ? null : p.workPostId)}
                      style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer", background: drillPost === p.workPostId ? C.s2 : "transparent" }}
                    >
                      <td style={{ padding: "5px 8px", fontWeight: 700, color: C.text }}>{p.workPostId}</td>
                      <td style={{ padding: "5px 8px", color: C.sec }}>{p.nbTaches}</td>
                      <td style={{ padding: "5px 8px", color: ecartColor(p.ecartMoyenMin), fontWeight: 600 }}>
                        {fmtMin(p.ecartMoyenMin)}
                      </td>
                      <td style={{ padding: "5px 8px" }}>
                        <MiniBar value={p.nbDepassements} max={p.nbTaches} color={C.red} />
                      </td>
                      <td style={{ padding: "5px 8px" }}>
                        <MiniBar value={p.nbBlocages} max={p.nbTaches} color={C.yellow} />
                      </td>
                      <td style={{ padding: "5px 8px", color: C.muted, fontSize: 10 }}>
                        {drillPost === p.workPostId ? "▲" : "▼"}
                      </td>
                    </tr>
                    {drillPost === p.workPostId && (
                      <tr key={`${p.workPostId}-drill`}>
                        <td colSpan={6} style={{ padding: "0 8px 10px 24px", background: C.s2 }}>
                          <div style={{ fontSize: 10, color: C.sec, marginTop: 6, marginBottom: 4 }}>
                            10 dernières tâches (les plus récentes) :
                          </div>
                          <table style={{ width: "100%", fontSize: 10 }}>
                            <thead>
                              <tr>
                                {["Chantier","Client","Tâche","Estimé","Réel","Écart","Statut"].map((h) => (
                                  <th key={h} style={{ padding: "2px 6px", textAlign: "left", color: C.muted }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {(postesData?.detailByPost[p.workPostId] ?? []).map((row) => {
                                const ecart = row.actualminutes != null ? row.actualminutes - row.estimatedminutes : null;
                                return (
                                  <tr key={row.id} style={{ borderTop: `1px solid ${C.border}` }}>
                                    <td style={{ padding: "2px 6px" }}>{row.refchantier}</td>
                                    <td style={{ padding: "2px 6px", color: C.sec }}>{row.clientname}</td>
                                    <td style={{ padding: "2px 6px" }}>{row.label}</td>
                                    <td style={{ padding: "2px 6px", color: C.sec }}>{fmtMinAbs(row.estimatedminutes)}</td>
                                    <td style={{ padding: "2px 6px" }}>{row.actualminutes != null ? fmtMinAbs(row.actualminutes) : "—"}</td>
                                    <td style={{ padding: "2px 6px", color: ecartColor(ecart), fontWeight: 600 }}>{fmtMin(ecart)}</td>
                                    <td style={{ padding: "2px 6px", color: row.status === "BLOCKED" ? C.red : C.green }}>
                                      {row.status === "DONE" ? "✓" : "⚠"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* ── Section 3 : NC par type menuiserie ─────────────────────────────── */}
      <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6, padding: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <SectionTitle>Non-conformités par type de menuiserie</SectionTitle>
          <button
            onClick={() => {
              exportCSV(
                `stats-nc-${period}.csv`,
                ["Type menuiserie","Sévérité","Statut","Poste","Nb"],
                nc.map((n) => [n.menuiserieType, n.severity, n.status, n.workPostId, n.nb])
              );
            }}
            style={{ fontSize: 10, padding: "3px 10px", background: C.s2, border: `1px solid ${C.border}`, color: C.sec, borderRadius: 3, cursor: "pointer" }}
          >
            ⬇ CSV
          </button>
        </div>

        {/* Totaux sévérité */}
        <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          {Object.entries(SEV_LABELS).map(([sev, label]) => {
            const total = ncTotaux.filter((n) => n.severity === sev).reduce((s, n) => s + n.nb, 0);
            const resolved = ncTotaux.filter((n) => n.severity === sev && n.status === "RESOLVED").reduce((s, n) => s + n.nb, 0);
            return (
              <div key={sev} style={{ background: C.s2, border: `1px solid ${SEV_COLORS[sev]}`, borderRadius: 4, padding: "8px 14px", minWidth: 120 }}>
                <div style={{ fontSize: 10, color: SEV_COLORS[sev], marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{total}</div>
                <div style={{ fontSize: 10, color: C.muted }}>{resolved} résolues</div>
              </div>
            );
          })}
        </div>

        {ncChartData.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 12, textAlign: "center", padding: 20 }}>Aucune NC pour la période</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={ncChartData} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="name" tick={{ fill: C.sec, fontSize: 9 }} angle={-30} textAnchor="end" interval={0} />
              <YAxis tick={{ fill: C.sec, fontSize: 10 }} />
              <Tooltip contentStyle={{ background: C.s2, border: `1px solid ${C.border}`, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10, color: C.sec }} />
              <Bar dataKey="BLOCKING" name="Bloquant" fill={C.red} stackId="nc" radius={[0, 0, 0, 0]} />
              <Bar dataKey="MINOR" name="Mineur" fill={C.yellow} stackId="nc" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {/* Répartition par statut NC */}
        {ncTotaux.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {Object.entries(NC_STATUS_LABELS).map(([st, label]) => {
              const nb = ncTotaux.filter((n) => n.status === st).reduce((s, n) => s + n.nb, 0);
              if (nb === 0) return null;
              return (
                <div key={st} style={{ fontSize: 11, padding: "3px 10px", background: C.s2, border: `1px solid ${C.border}`, borderRadius: 3, color: C.sec }}>
                  {label} : <strong style={{ color: C.text }}>{nb}</strong>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Section 4 : Châssis spéciaux ─────────────────────────────────── */}
      <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6, padding: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <SectionTitle>Châssis spéciaux — temps estimé vs réel</SectionTitle>
          <button
            onClick={() => {
              exportCSV(
                `stats-speciaux-${period}.csv`,
                ["Chantier","Client","Type","Estimé (min)","Réel (min)","Écart (min)","Tâches","Terminées","Bloquées"],
                speciaux.map((s) => [s.refChantier, s.clientName, s.specialType, s.estTotal, s.actualTotal, s.ecartMin, s.nbTaches, s.nbDone, s.nbBlocked])
              );
            }}
            style={{ fontSize: 10, padding: "3px 10px", background: C.s2, border: `1px solid ${C.border}`, color: C.sec, borderRadius: 3, cursor: "pointer" }}
          >
            ⬇ CSV
          </button>
        </div>

        {summary && (
          <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <MetricCard label="Spéciaux enregistrés" value={summary.nbSpeciaux} />
            <MetricCard label="Totalement terminés" value={summary.nbDoneComplete} color={C.green} />
            <MetricCard label="Temps total estimé" value={fmtMinAbs(summary.estTotal)} />
            <MetricCard
              label="Temps total réel"
              value={fmtMinAbs(summary.actualTotal)}
              sub={summary.estTotal > 0 ? `Écart global : ${fmtMin(summary.actualTotal - summary.estTotal)}` : undefined}
              color={summary.actualTotal > summary.estTotal * 1.1 ? C.red : C.text}
            />
          </div>
        )}

        {speciauxChartData.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 12, textAlign: "center", padding: 20 }}>Aucun châssis spécial pour la période</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={speciauxChartData} margin={{ top: 4, right: 8, left: 0, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="name" tick={{ fill: C.sec, fontSize: 9 }} angle={-30} textAnchor="end" interval={0} />
              <YAxis tick={{ fill: C.sec, fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: C.s2, border: `1px solid ${C.border}`, fontSize: 11 }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(v: any, name: any) => [fmtMinAbs(typeof v === "number" ? v : null), name]}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="estimé" fill={C.blue} radius={[2, 2, 0, 0]} />
              <Bar dataKey="réel" fill={C.orange} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {speciaux.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginTop: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["Chantier","Client","Type","Estimé","Réel","Écart","Avancement"].map((h) => (
                  <th key={h} style={{ padding: "4px 8px", textAlign: "left", color: C.sec, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {speciaux.map((s) => {
                const pctDone = s.nbTaches > 0 ? Math.round((s.nbDone / s.nbTaches) * 100) : 0;
                return (
                  <tr key={s.fabItemId} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "5px 8px", fontWeight: 600 }}>{s.refChantier}</td>
                    <td style={{ padding: "5px 8px", color: C.sec }}>{s.clientName}</td>
                    <td style={{ padding: "5px 8px", color: C.teal, fontSize: 10 }}>{s.specialType ?? "—"}</td>
                    <td style={{ padding: "5px 8px" }}>{fmtMinAbs(s.estTotal)}</td>
                    <td style={{ padding: "5px 8px" }}>{fmtMinAbs(s.actualTotal)}</td>
                    <td style={{ padding: "5px 8px", color: ecartColor(s.ecartMin), fontWeight: 600 }}>{fmtMin(s.ecartMin)}</td>
                    <td style={{ padding: "5px 8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 60, height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${pctDone}%`, height: "100%", background: s.nbBlocked > 0 ? C.red : C.green, borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 10, color: C.sec }}>{s.nbDone}/{s.nbTaches}</span>
                        {s.nbBlocked > 0 && <span style={{ fontSize: 10, color: C.red }}>⚠{s.nbBlocked}</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Section 5 : Flux inter-ateliers ──────────────────────────────── */}
      <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6, padding: 16, marginBottom: 20 }}>
        <SectionTitle>Flux inter-ateliers SIAL ↔ ISULA</SectionTitle>

        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <MetricCard
            label="Tâches en attente vitrage (actuellement)"
            value={fluxData?.enAttente ?? 0}
            color={(fluxData?.enAttente ?? 0) > 3 ? C.red : (fluxData?.enAttente ?? 0) > 0 ? C.yellow : C.green}
          />
        </div>

        {fluxChart.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={fluxChart} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="label" tick={{ fill: C.sec, fontSize: 10 }} />
              <YAxis yAxisId="left" tick={{ fill: C.sec, fontSize: 10 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: C.sec, fontSize: 10 }} />
              <Tooltip contentStyle={{ background: C.s2, border: `1px solid ${C.border}`, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line yAxisId="left" type="monotone" dataKey="nbAttente" name="Transferts SIAL→ISULA" stroke={C.blue} strokeWidth={2} dot={{ r: 3 }} />
              <Line yAxisId="right" type="monotone" dataKey="dureeMovH" name="Durée attente moy. (h)" stroke={C.orange} strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ color: C.muted, fontSize: 12, textAlign: "center", padding: 20 }}>Aucun flux inter-ateliers enregistré</div>
        )}

        {/* Stocks tampons */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, color: C.sec, marginBottom: 10 }}>Stocks tampons en temps réel</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {stocks.map((s) => (
              <div key={s.type} style={{ background: C.s2, border: `1px solid ${s.alert ? C.red : C.border}`, borderRadius: 4, padding: "10px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: s.alert ? C.red : C.text }}>{s.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: s.alert ? C.red : C.text }}>{s.quantity} {s.unit}</span>
                </div>
                <BufferBar stock={s} />
                {s.min !== null && s.cible !== null && (
                  <div style={{ fontSize: 9, color: C.muted, marginTop: 4 }}>
                    min {s.min} · cible {s.cible} · max {s.max} {s.unit}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Section 6 : Kaizen ────────────────────────────────────────────── */}
      <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6, padding: 16 }}>
        <SectionTitle>Analyse Kaizen — Muda Analysis</SectionTitle>
        <p style={{ fontSize: 11, color: C.sec, marginBottom: 14 }}>
          Génère une synthèse textuelle des principaux gisements d'amélioration identifiés sur la période sélectionnée.
        </p>
        <button
          onClick={() => setKaizenText(generateKaizen(postes, nc, speciaux))}
          style={{ padding: "8px 20px", background: C.orange, color: "#000", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 700, fontSize: 12, marginBottom: kaizenText ? 12 : 0 }}
        >
          Générer l'analyse Kaizen
        </button>
        {kaizenText && (
          <>
            <pre style={{
              marginTop: 12, padding: 14, background: C.s2, border: `1px solid ${C.border}`,
              borderRadius: 4, fontSize: 11, color: C.text, whiteSpace: "pre-wrap", lineHeight: 1.6,
              maxHeight: 400, overflowY: "auto",
            }}>
              {kaizenText}
            </pre>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                onClick={() => {
                  const blob = new Blob([kaizenText], { type: "text/plain;charset=utf-8;" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a"); a.href = url;
                  a.download = `kaizen-${period}-${new Date().toISOString().slice(0, 10)}.txt`; a.click();
                  URL.revokeObjectURL(url);
                }}
                style={{ padding: "5px 14px", fontSize: 11, background: C.s2, border: `1px solid ${C.border}`, color: C.sec, borderRadius: 3, cursor: "pointer" }}
              >
                ⬇ Télécharger
              </button>
              <button
                onClick={() => setKaizenText(null)}
                style={{ padding: "5px 14px", fontSize: 11, background: C.s2, border: `1px solid ${C.border}`, color: C.sec, borderRadius: 3, cursor: "pointer" }}
              >
                Fermer
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
