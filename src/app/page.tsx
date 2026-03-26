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
import PlanningCalendrier from "@/components/tabs/PlanningCalendrier";
import PlanningLivraison from "@/components/tabs/PlanningLivraison";
import Dashboard from "@/components/tabs/Dashboard";

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

  const nav = [
    { id: "dashboard", l: "🏠 Tableau de bord", alert: critiques },
    { id: "saisie", l: "➕ Commande" },
    { id: "carnet", l: `📂 Carnet (${commandes.length})` },
    { id: "crise", l: `🚨 Crise${retards > 0 ? ` ⚠${retards}` : ""}`, alert: critiques },
    { id: "calendrier", l: "📅 Planning" },
    { id: "livraison", l: "🚚 Livraisons" },
    { id: "charge", l: "📊 Charge" },
    { id: "stocks", l: `📦 Stocks${ruptures > 0 ? ` ⚠${ruptures}` : ""}`, alert: ruptures > 0 },
    { id: "nomenclature", l: "📐 Nomenclature" },
    { id: "simulateur", l: "🎯 Simulateur" },
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
            {ong === "carnet" && <Carnet commandes={commandes} onDelete={delCommande} onEdit={editCommande} />}
            {ong === "crise" && <PlanningCrise commandes={commandes} />}
            {ong === "calendrier" && <PlanningCalendrier commandes={commandes} />}
            {ong === "livraison" && <PlanningLivraison commandes={commandes} />}
            {ong === "charge" && <ChargeSemaine commandes={commandes} />}
            {ong === "stocks" && <StocksTampons stocksTampons={stocks} onUpdate={updateStock} />}
            {ong === "nomenclature" && <Nomenclature />}
            {ong === "simulateur" && <Simulateur />}
          </>
        )}
      </div>
    </div>
  );
}
