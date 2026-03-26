"use client";
import { useState, useEffect } from "react";
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
import ResumeCommandes from "@/components/tabs/ResumeCommandes";

export default function HomePage() {
  const { data: session } = useSession();
  const [ong, setOng] = useState("nomenclature");
  const [commandes, setCommandes] = useState<CommandeCC[]>([]);
  const [stocks, setStocks] = useState<Record<string, { actuel: number }>>({});

  useEffect(() => {
    try {
      const c = localStorage.getItem("sial_v8_cmd"); if (c) setCommandes(JSON.parse(c));
      const s = localStorage.getItem("sial_v8_st"); if (s) setStocks(JSON.parse(s));
    } catch {}
  }, []);

  useEffect(() => { try { localStorage.setItem("sial_v8_cmd", JSON.stringify(commandes)); } catch {} }, [commandes]);
  useEffect(() => { try { localStorage.setItem("sial_v8_st", JSON.stringify(stocks)); } catch {} }, [stocks]);

  const ruptures = Object.entries(STOCKS_DEF).filter(([id, st]) => {
    const a = parseFloat(String(stocks[id]?.actuel)) || 0; return a > 0 && a < st.min;
  }).length;
  const retards = commandes.filter(c => calcCheminCritique(c)?.enRetard).length;
  const critiques = commandes.some(c => calcCheminCritique(c)?.critique);

  const nav = [
    { id: "nomenclature", l: "📐 Nomenclature" },
    { id: "simulateur", l: "🎯 Simulateur" },
    { id: "charge", l: "📊 Charge semaine" },
    { id: "stocks", l: `📦 Stocks${ruptures > 0 ? ` ⚠${ruptures}` : ""}`, alert: ruptures > 0 },
    { id: "saisie", l: "➕ Commande" },
    { id: "calendrier", l: "📅 Planning" },
    { id: "resume", l: "📋 Résumé" },
    { id: "crise", l: `🚨 Crise${retards > 0 ? ` ⚠${retards}` : ""}`, alert: critiques },
    { id: "carnet", l: `📂 Carnet (${commandes.length})` },
  ];

  const addCommande = (cmd: CommandeCC) => { setCommandes(p => [...p, cmd]); setOng("carnet"); };
  const delCommande = (id: any) => setCommandes(p => p.filter(x => x.id !== id));
  const updateStock = (id: string, v: { actuel: string }) => setStocks(p => ({ ...p, [id]: { actuel: parseFloat(v.actuel) || 0 } }));

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
            <span style={{ fontSize: 11, color: C.muted, marginLeft: 6 }}>v8.2</span>
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
          <button key={o.id} onClick={() => setOng(o.id)} style={{ padding: "10px 14px", background: "none", border: "none", borderBottom: `2px solid ${ong === o.id ? C.orange : "transparent"}`, color: ong === o.id ? C.text : o.alert ? C.red : C.sec, fontSize: 12, fontWeight: ong === o.id ? 700 : 400, cursor: "pointer", whiteSpace: "nowrap" }}>
            {o.l}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: 20 }}>
        {ong === "nomenclature" && <Nomenclature />}
        {ong === "simulateur" && <Simulateur />}
        {ong === "charge" && <ChargeSemaine commandes={commandes} />}
        {ong === "stocks" && <StocksTampons stocksTampons={stocks} onUpdate={updateStock} />}
        {ong === "saisie" && <SaisieCommande onAjouter={addCommande} />}
        {ong === "calendrier" && <PlanningCalendrier commandes={commandes} />}
        {ong === "resume" && <ResumeCommandes commandes={commandes} />}
        {ong === "crise" && <PlanningCrise commandes={commandes} />}
        {ong === "carnet" && <Carnet commandes={commandes} onDelete={delCommande} />}
      </div>
    </div>
  );
}
