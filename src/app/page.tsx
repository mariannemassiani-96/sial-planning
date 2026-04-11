"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { signOut } from "next-auth/react";
import { C, STOCKS_DEF, calcCheminCritique, CommandeCC } from "@/lib/sial-data";
import { Bdg } from "@/components/ui";
import Nomenclature from "@/components/tabs/Nomenclature";
import Simulateur from "@/components/tabs/Simulateur";
import StocksTampons from "@/components/tabs/StocksTampons";
import SaisieCommande from "@/components/tabs/SaisieCommande";
import PlanningCrise from "@/components/tabs/PlanningCrise";
import Carnet from "@/components/tabs/Carnet";
import PlanningLivraison from "@/components/tabs/PlanningLivraison";
import Dashboard from "@/components/tabs/Dashboard";
import PlanningRH from "@/components/tabs/PlanningRH";
import PlanningIsula from "@/components/tabs/PlanningIsula";
import BesoinVitrages from "@/components/tabs/BesoinVitrages";
import Qualite from "@/components/tabs/Qualite";
import ImportCSV from "@/components/tabs/ImportCSV";
import PointageJour from "@/components/tabs/PointageJour";
import AffichageAtelier from "@/components/tabs/AffichageAtelier";
import PlanningCommandes from "@/components/tabs/PlanningCommandes";
import PlanningAffectations from "@/components/tabs/PlanningAffectations";
import StatsAdmin from "@/components/tabs/StatsAdmin";
import AnalyseProduction from "@/components/tabs/AnalyseProduction";
import CerveauDashboard from "@/components/tabs/CerveauDashboard";
import AdminUsers from "@/components/tabs/AdminUsers";
import GestionCompetences from "@/components/tabs/GestionCompetences";
import ChatAssistant from "@/components/ChatAssistant";

// ── Sub-tab selector ────────────────────────────────────────────────────────
function SubTabs({ tabs, active, onChange }: { tabs: { id: string; l: string }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.border}`, marginBottom: 16 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          padding: "8px 16px", background: "none", border: "none",
          borderBottom: `2px solid ${active === t.id ? C.orange : "transparent"}`,
          color: active === t.id ? C.text : C.sec,
          fontWeight: active === t.id ? 700 : 400, fontSize: 13, cursor: "pointer",
        }}>
          {t.l}
        </button>
      ))}
    </div>
  );
}

export default function HomePage() {
  const { data: session, status } = useSession();

  // Restaurer l'état depuis l'URL hash au chargement
  const getInitial = (key: string, fallback: string) => {
    if (typeof window === "undefined") return fallback;
    try { const p = new URLSearchParams(window.location.hash.slice(1)); return p.get(key) || fallback; } catch { return fallback; }
  };

  const [ong, setOng] = useState(() => getInitial("tab", "planning_fab"));
  const [commandes, setCommandes] = useState<CommandeCC[]>([]);
  const [cmdEdit, setCmdEdit] = useState<CommandeCC | null>(null);
  const [stocks, setStocks] = useState<Record<string, { actuel: number }>>({});
  const [loading, setLoading] = useState(true);

  const [planningSub, setPlanningSub] = useState<"commandes" | "affectations">(() => getInitial("psub", "commandes") as "commandes" | "affectations");
  const [planningWeek, setPlanningWeek] = useState<string>(() => {
    const saved = getInitial("week", "");
    if (saved) return saved;
    const d = new Date(); const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff); d.setHours(0,0,0,0);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  });
  const [dashSub, setDashSub] = useState<"tableau" | "crise">("tableau");
  const [rhSub, setRhSub] = useState<"planning" | "competences">("planning");
  const [isulaSub, setIsulaSub] = useState<"planning" | "besoins">("planning");
  const [refSub, setRefSub] = useState<"nomenclature" | "simulateur">("nomenclature");
  const [statsSub, setStatsSub] = useState<"cerveau" | "analyse" | "stats">("cerveau");

  // Sauvegarder l'état dans l'URL hash pour persister au refresh
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("tab", ong);
    params.set("psub", planningSub);
    params.set("week", planningWeek);
    window.history.replaceState(null, "", `#${params.toString()}`);
  }, [ong, planningSub, planningWeek]);

  const fetchAll = useCallback(async () => {
    try {
      const [cmdsRes, stsRes] = await Promise.all([
        fetch("/api/commandes"),
        fetch("/api/stocks"),
      ]);
      if (cmdsRes.ok) setCommandes(await cmdsRes.json());
      if (stsRes.ok)  setStocks(await stsRes.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (status === "authenticated") fetchAll();
  }, [status, fetchAll]);

  // Rafraîchissement auto toutes les 10s
  useEffect(() => {
    if (status !== "authenticated") return;
    const interval = setInterval(() => {
      fetch("/api/commandes").then(r => r.ok ? r.json() : null).then(data => { if (data) setCommandes(data); }).catch(() => {});
      fetch("/api/stocks").then(r => r.ok ? r.json() : null).then(data => { if (data) setStocks(data); }).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [status]);

  const ruptures = Object.entries(STOCKS_DEF).filter(([id, st]) => {
    const a = parseFloat(String(stocks[id]?.actuel)) || 0; return a > 0 && a < st.min;
  }).length;
  const retards = commandes.filter(c => calcCheminCritique(c)?.enRetard).length;
  const critiques = commandes.some(c => calcCheminCritique(c)?.critique);

  const isAdmin = (session?.user as any)?.role === "ADMIN";

  // ── Navigation — 12 onglets (au lieu de 20) ──────────────────────────────
  const nav = [
    { id: "planning_fab",    l: "📅 Planning" },
    { id: "dashboard",       l: `🏠 Suivi${retards > 0 ? ` ⚠${retards}` : ""}`, alert: critiques },
    { id: "livraison",       l: "🚚 Livraisons" },
    { id: "saisie",          l: "➕ Commande" },
    { id: "carnet",          l: `📂 Commandes (${commandes.length})` },
    { id: "rh",              l: "👥 Équipe" },
    { id: "pointage",        l: "✅ Pointage" },
    { id: "affichage_atelier", l: "📺 Atelier" },
    { id: "isula",           l: "🔷 ISULA" },
    { id: "referentiel",     l: "📐 Référentiel" },
    ...(isAdmin ? [
      { id: "qualite",      l: "✅ Qualité" },
      { id: "stocks",       l: `📦 Stocks${ruptures > 0 ? ` ⚠${ruptures}` : ""}`, alert: ruptures > 0 },
      { id: "import_csv",   l: "📥 Import" },
      { id: "stats_admin",  l: "📊 Stats" },
      { id: "admin",        l: "⚙ Admin" },
    ] : []),
  ];

  const addCommande = async (cmd: CommandeCC) => {
    try {
      const res = await fetch("/api/commandes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cmd),
      });
      if (res.ok) { const saved = await res.json(); setCommandes(p => [saved, ...p]); }
    } catch {}
    setOng("carnet");
  };

  const patchCommande = async (id: string, updates: Record<string, unknown>) => {
    const cmd = commandes.find(x => x.id === id);
    if (!cmd) return;
    try {
      const res = await fetch(`/api/commandes/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...cmd, ...updates }),
      });
      if (res.ok) { const saved = await res.json(); setCommandes(p => p.map(x => x.id === saved.id ? saved : x)); }
    } catch {}
  };

  const delCommande = async (id: any) => {
    setCommandes(p => p.filter(x => x.id !== id));
    try { await fetch(`/api/commandes/${id}`, { method: "DELETE" }); } catch {}
  };

  const editCommande = (cmd: CommandeCC) => { setCmdEdit(cmd); setOng("saisie"); };

  const modifCommande = async (cmd: CommandeCC) => {
    try {
      const res = await fetch(`/api/commandes/${cmd.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cmd),
      });
      if (res.ok) { const saved = await res.json(); setCommandes(p => p.map(x => x.id === saved.id ? saved : x)); }
    } catch {}
    setCmdEdit(null);
    setOng("carnet");
  };

  const updateStock = async (id: string, v: { actuel: string }) => {
    const actuel = parseFloat(v.actuel) || 0;
    setStocks(p => ({ ...p, [id]: { actuel } }));
    try {
      await fetch("/api/stocks", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, actuel }),
      });
    } catch {}
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <div style={{ background: C.s1, borderBottom: `1px solid ${C.border}`, padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>
            <span style={{ color: C.orange }}>SIAL</span>
            <span style={{ color: C.sec, margin: "0 6px", fontWeight: 300 }}>+</span>
            <span style={{ color: C.teal }}>ISULA</span>
            <span style={{ color: C.sec, margin: "0 6px", fontWeight: 300 }}>|</span>
            <span>Planning Industriel</span>
            <span style={{ fontSize: 11, color: C.muted, marginLeft: 6 }}>v9.0</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <Bdg t={`${commandes.length} cmd`} c={C.blue} />
          {ruptures > 0 && <Bdg t={`⚠ ${ruptures} rupture(s)`} c={C.red} />}
          {retards > 0 && <Bdg t={`⚠ ${retards} retard(s)`} c={C.red} />}
          {session?.user && (
            <span style={{ fontSize: 11, color: C.sec, marginLeft: 8 }}>
              {session.user.name}
              <button onClick={() => signOut()} style={{ marginLeft: 8, padding: "2px 8px", background: "none", border: `1px solid ${C.border}`, borderRadius: 3, color: C.sec, cursor: "pointer", fontSize: 10 }}>Déconnexion</button>
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, paddingLeft: 16, background: C.s1, overflowX: "auto" }}>
        {nav.map(o => (
          <button key={o.id} onClick={() => { if (o.id !== "saisie") setCmdEdit(null); setOng(o.id); }} style={{ padding: "10px 14px", background: "none", border: "none", borderBottom: `2px solid ${ong === o.id ? C.orange : "transparent"}`, color: ong === o.id ? C.text : o.alert ? C.red : C.sec, fontSize: 12, fontWeight: ong === o.id ? 700 : 400, cursor: "pointer", whiteSpace: "nowrap" }}>
            {o.l}
          </button>
        ))}
      </div>

      <div style={{ padding: "20px 16px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: C.sec }}>
            <div style={{ fontSize: 24, marginBottom: 10 }}>⏳</div>
            <div>Chargement des données…</div>
          </div>
        ) : (
          <>
            {ong === "planning_fab" && (
              <>
                <SubTabs
                  tabs={[{ id: "commandes", l: "Commandes" }, { id: "affectations", l: "Affectations" }]}
                  active={planningSub}
                  onChange={(id) => setPlanningSub(id as "commandes" | "affectations")}
                />
                {planningSub === "commandes" && <PlanningCommandes commandes={commandes} onPatch={patchCommande} />}
                {planningSub === "affectations" && <PlanningAffectations commandes={commandes} viewWeek={planningWeek} onPatch={patchCommande} onWeekChange={setPlanningWeek} />}
              </>
            )}

            {/* Tableau de bord + Crise fusionnés */}
            {ong === "dashboard" && (
              <>
                <SubTabs
                  tabs={[{ id: "tableau", l: "Tableau de bord" }, { id: "crise", l: `Crise${retards > 0 ? ` (${retards})` : ""}` }]}
                  active={dashSub}
                  onChange={(id) => setDashSub(id as "tableau" | "crise")}
                />
                {dashSub === "tableau" && <Dashboard commandes={commandes} stocks={stocks} onNav={setOng} onRefresh={fetchAll} />}
                {dashSub === "crise" && <PlanningCrise commandes={commandes} />}
              </>
            )}

            {ong === "saisie" && <SaisieCommande key={String(cmdEdit?.id || "new")} onAjouter={addCommande} commande={cmdEdit} onModifier={modifCommande} />}
            {ong === "carnet" && <Carnet commandes={commandes} onDelete={delCommande} onEdit={editCommande} onPatch={patchCommande} />}
            {ong === "livraison" && <PlanningLivraison commandes={commandes} onPatch={patchCommande} onEdit={editCommande} />}

            {/* Équipe SIAL + Compétences fusionnés */}
            {ong === "rh" && (
              <>
                <SubTabs
                  tabs={[{ id: "planning", l: "Planning RH" }, { id: "competences", l: "Compétences" }]}
                  active={rhSub}
                  onChange={(id) => setRhSub(id as "planning" | "competences")}
                />
                {rhSub === "planning" && <PlanningRH commandes={commandes} />}
                {rhSub === "competences" && <GestionCompetences />}
              </>
            )}

            {ong === "pointage" && <PointageJour commandes={commandes} onPatch={patchCommande} />}
            {ong === "affichage_atelier" && <AffichageAtelier commandes={commandes} stocks={stocks} />}

            {/* Planning ISULA + Besoins Vitrages fusionnés */}
            {ong === "isula" && (
              <>
                <SubTabs
                  tabs={[{ id: "planning", l: "Planning ISULA" }, { id: "besoins", l: "Besoins Vitrages" }]}
                  active={isulaSub}
                  onChange={(id) => setIsulaSub(id as "planning" | "besoins")}
                />
                {isulaSub === "planning" && <PlanningIsula commandes={commandes} />}
                {isulaSub === "besoins" && <BesoinVitrages commandes={commandes} />}
              </>
            )}

            {ong === "qualite" && <Qualite />}
            {ong === "stocks" && <StocksTampons stocksTampons={stocks} onUpdate={updateStock} />}

            {/* Nomenclature + Simulateur fusionnés */}
            {ong === "referentiel" && (
              <>
                <SubTabs
                  tabs={[{ id: "nomenclature", l: "Nomenclature" }, { id: "simulateur", l: "Simulateur" }]}
                  active={refSub}
                  onChange={(id) => setRefSub(id as "nomenclature" | "simulateur")}
                />
                {refSub === "nomenclature" && <Nomenclature />}
                {refSub === "simulateur" && <Simulateur />}
              </>
            )}

            {ong === "import_csv" && <ImportCSV onRefresh={fetchAll} />}
            {ong === "stats_admin" && (
              <>
                <SubTabs
                  tabs={[{ id: "cerveau", l: "🧠 Cerveau" }, { id: "analyse", l: "Analyse Production" }, { id: "stats", l: "Statistiques" }]}
                  active={statsSub}
                  onChange={(id) => setStatsSub(id as "cerveau" | "analyse" | "stats")}
                />
                {statsSub === "cerveau" && <CerveauDashboard />}
                {statsSub === "analyse" && <AnalyseProduction />}
                {statsSub === "stats" && <StatsAdmin />}
              </>
            )}

            {ong === "admin" && <AdminUsers />}
          </>
        )}
      </div>
      <ChatAssistant commandes={commandes} />
    </div>
  );
}
