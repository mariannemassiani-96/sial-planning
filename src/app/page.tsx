"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { signOut } from "next-auth/react";
import { C, TYPES_MENUISERIE, STOCKS_DEF, calcCheminCritique, CommandeCC } from "@/lib/sial-data";
import { Bdg } from "@/components/ui";
import Nomenclature from "@/components/tabs/Nomenclature";
import Simulateur from "@/components/tabs/Simulateur";
import ChargeSemaine from "@/components/tabs/ChargeSemaine";
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
import PlanningFabrication from "@/components/tabs/PlanningFabrication";
import AvancementDashboard from "@/components/tabs/AvancementDashboard";
import AffichageAtelier from "@/components/tabs/AffichageAtelier";

export default function HomePage() {
  const { data: session, status } = useSession();
  const [ong, setOng] = useState("dashboard");
  const [commandes, setCommandes] = useState<CommandeCC[]>([]);
  const [cmdEdit, setCmdEdit] = useState<CommandeCC | null>(null);
  const [stocks, setStocks] = useState<Record<string, { actuel: number }>>({});
  const [loading, setLoading] = useState(true);

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

  const ruptures = Object.entries(STOCKS_DEF).filter(([id, st]) => {
    const a = parseFloat(String(stocks[id]?.actuel)) || 0; return a > 0 && a < st.min;
  }).length;
  const retards = commandes.filter(c => calcCheminCritique(c)?.enRetard).length;
  const critiques = commandes.some(c => calcCheminCritique(c)?.critique);

  const isAdmin = (session?.user as any)?.role === "ADMIN";

  const nav = [
    { id: "dashboard",    l: "🏠 Tableau de bord",        alert: critiques },
    { id: "livraison",    l: "🚚 Livraisons" },
    { id: "saisie",       l: "➕ Commande" },
    { id: "carnet",       l: `📂 Carnet (${commandes.length})` },
    { id: "crise",        l: `🚨 Crise${retards > 0 ? ` ⚠${retards}` : ""}`, alert: critiques },
    { id: "charge",       l: "📊 Charge SIAL" },
    { id: "rh",           l: "👥 Équipe SIAL" },
    { id: "fabrication",    l: "🏭 Planning" },
    { id: "avancement",     l: "📋 Avancement" },
    { id: "atelier",        l: "📺 Affichage Atelier" },
    { id: "isula",           l: "🔷 Planning ISULA VITRAGE" },
    { id: "besoins_vitrages", l: "🔢 Besoins Vitrages" },
    { id: "charge_isula",    l: "📊 Charge ISULA VITRAGE" },
    { id: "equipe_isula", l: "👥 Équipe ISULA VITRAGE" },
    ...(isAdmin ? [
      { id: "qualite",      l: "✅ Qualité" },
      { id: "stocks",       l: `📦 Stocks${ruptures > 0 ? ` ⚠${ruptures}` : ""}`, alert: ruptures > 0 },
      { id: "nomenclature", l: "📐 Nomenclature" },
      { id: "simulateur",   l: "🎯 Simulateur" },
      { id: "import_csv",   l: "📥 Import CSV" },
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
            <span style={{ fontSize: 11, color: C.muted, marginLeft: 6 }}>v8.3</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <Bdg t={`${Object.keys(TYPES_MENUISERIE).length} types menuiserie`} c={C.teal} />
          <Bdg t={`${commandes.length} cmd`} c={C.blue} />
          {ruptures > 0 && <Bdg t={`⚠ ${ruptures} rupture(s)`} c={C.red} />}
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

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: 20 }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: C.sec }}>
            <div style={{ fontSize: 24, marginBottom: 10 }}>⏳</div>
            <div>Chargement des données…</div>
          </div>
        ) : (
          <>
            {ong === "dashboard" && <Dashboard commandes={commandes} stocks={stocks} onNav={setOng} onRefresh={fetchAll} />}
            {ong === "saisie" && <SaisieCommande key={String(cmdEdit?.id || "new")} onAjouter={addCommande} commande={cmdEdit} onModifier={modifCommande} />}
            {ong === "carnet" && <Carnet commandes={commandes} onDelete={delCommande} onEdit={editCommande} onPatch={patchCommande} />}
            {ong === "crise" && <PlanningCrise commandes={commandes} />}
            {ong === "livraison" && <PlanningLivraison commandes={commandes} onPatch={patchCommande} onEdit={editCommande} />}
            {ong === "charge" && <ChargeSemaine commandes={commandes} />}
            {ong === "rh" && <PlanningRH commandes={commandes} />}
            {ong === "fabrication" && <PlanningFabrication commandes={commandes} onEdit={editCommande} />}
            {ong === "avancement" && <AvancementDashboard commandes={commandes} />}
            {ong === "atelier" && <AffichageAtelier commandes={commandes} stocks={stocks} />}
            {ong === "isula" && <PlanningIsula commandes={commandes} />}
            {ong === "besoins_vitrages" && <BesoinVitrages commandes={commandes} />}
            {ong === "charge_isula" && <div style={{ padding: 40, color: C.sec, textAlign: "center" }}>📊 Charge ISULA VITRAGE — à venir</div>}
            {ong === "equipe_isula" && <div style={{ padding: 40, color: C.sec, textAlign: "center" }}>👥 Équipe ISULA VITRAGE — à venir</div>}
            {ong === "qualite" && <Qualite />}
            {ong === "stocks" && <StocksTampons stocksTampons={stocks} onUpdate={updateStock} />}
            {ong === "nomenclature" && <Nomenclature />}
            {ong === "simulateur" && <Simulateur />}
            {ong === "import_csv" && <ImportCSV onRefresh={fetchAll} />}
          </>
        )}
      </div>
    </div>
  );
}
