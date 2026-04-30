"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { signOut } from "next-auth/react";
import { C, STOCKS_DEF, calcCheminCritique, CommandeCC } from "@/lib/sial-data";
import { useIsMobile } from "@/lib/useIsMobile";
import { Bdg } from "@/components/ui";
import Nomenclature from "@/components/tabs/Nomenclature";
import Simulateur from "@/components/tabs/Simulateur";
import StocksTampons from "@/components/tabs/StocksTampons";
import SaisieCommande from "@/components/tabs/SaisieCommande";
import PlanningCrise from "@/components/tabs/PlanningCrise";
import Carnet from "@/components/tabs/Carnet";
import PlanningLivraison from "@/components/tabs/PlanningLivraison";
import PlanningChargements from "@/components/tabs/PlanningChargements";
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
import Aujourdhui from "@/components/tabs/Aujourdhui";
import StatsAdmin from "@/components/tabs/StatsAdmin";
import ChargeCapacite from "@/components/tabs/ChargeCapacite";
import Chauffeurs from "@/components/tabs/Chauffeurs";
import AdminUsers from "@/components/tabs/AdminUsers";
import GestionCompetences from "@/components/tabs/GestionCompetences";
import TutoAJ from "@/components/TutoAJ";
import AssistantIA from "@/components/AssistantIA";

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

  // Lire localStorage synchrone avant useState (pour éviter mismatch hydratation)
  const initNav = (() => {
    if (typeof window === "undefined") return {} as { tab?: string; psub?: string; week?: string };
    try {
      const raw = localStorage.getItem("sial_nav");
      return raw ? (JSON.parse(raw) as { tab?: string; psub?: string; week?: string }) : {};
    } catch { return {} as { tab?: string; psub?: string; week?: string }; }
  })();

  const defaultWeek = (() => {
    const d = new Date(); const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff); d.setHours(0,0,0,0);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  })();


  const [ong, setOng] = useState(initNav.tab || "aujourdhui");
  const [commandes, setCommandes] = useState<CommandeCC[]>([]);
  const [cmdEdit, setCmdEdit] = useState<CommandeCC | null>(null);
  const [editReturnTab, setEditReturnTab] = useState<string>("carnet");
  const [stocks, setStocks] = useState<Record<string, { actuel: number }>>({});
  const [loading, setLoading] = useState(true);
  const [carnetFilters, setCarnetFilters] = useState<Record<string, unknown>>({});

  const [planningSub, setPlanningSub] = useState<"commandes" | "affectations">((initNav.psub as "commandes" | "affectations") || "commandes");
  const [planningWeek, setPlanningWeek] = useState(initNav.week || defaultWeek);
  const [dashSub, setDashSub] = useState<"tableau" | "crise">("tableau");
  const [rhSub, setRhSub] = useState<"planning" | "competences">("planning");
  const [isulaSub, setIsulaSub] = useState<"planning" | "besoins">("planning");
  const [refSub, setRefSub] = useState<"nomenclature" | "simulateur">("nomenclature");
  const [_statsSub, _setStatsSub] = useState<"cerveau" | "analyse" | "stats">("cerveau");

  // Sauvegarder l'état dans localStorage pour persister au refresh
  useEffect(() => {
    try {
      localStorage.setItem("sial_nav", JSON.stringify({ tab: ong, psub: planningSub, week: planningWeek }));
    } catch {}
  }, [ong, planningSub, planningWeek]);

  const [apiError, setApiError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [cmdsRes, stsRes] = await Promise.all([
        fetch("/api/commandes"),
        fetch("/api/stocks"),
      ]);
      if (cmdsRes.ok) {
        setCommandes(await cmdsRes.json());
        setApiError(null);
      } else {
        const err = await cmdsRes.json().catch(() => ({}));
        setApiError(`Commandes: ${err.error || cmdsRes.status}`);
      }
      if (stsRes.ok) setStocks(await stsRes.json());
    } catch (e: unknown) {
      setApiError(`Erreur réseau: ${e instanceof Error ? e.message : "inconnue"}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (status === "authenticated") fetchAll();
  }, [status, fetchAll]);

  // Rafraîchissement auto des commandes (120s)
  useEffect(() => {
    if (status !== "authenticated") return;
    const interval = setInterval(() => {
      fetch("/api/commandes").then(r => r.ok ? r.json() : null).then(data => { if (data) setCommandes(data); }).catch(() => {});
    }, 120000);
    return () => clearInterval(interval);
  }, [status]);

  const ruptures = Object.entries(STOCKS_DEF).filter(([id, st]) => {
    const a = parseFloat(String(stocks[id]?.actuel)) || 0; return a > 0 && a < st.min;
  }).length;
  const retards = commandes.filter(c => calcCheminCritique(c)?.enRetard).length;
  const critiques = commandes.some(c => calcCheminCritique(c)?.critique);

  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const mobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // ── Permissions utilisateur ────────────────────────────────────────────────
  const [userPerms, setUserPerms] = useState<{ tabs?: string[]; droits?: string[] } | null>(null);
  const [permsLoaded, setPermsLoaded] = useState(false);
  useEffect(() => {
    if (isAdmin) { setPermsLoaded(true); return; }
    if (status === "authenticated") {
      fetch("/api/admin/users/me").then(r => r.ok ? r.json() : null).then(d => {
        if (d?.permissions) setUserPerms(d.permissions);
        setPermsLoaded(true);
      }).catch(() => setPermsLoaded(true));
    }
  }, [isAdmin, status]);

  const canSeeTab = (tabId: string) => {
    if (isAdmin) return true;
    if (!permsLoaded) return false;
    if (!userPerms?.tabs) return true;
    return userPerms.tabs.includes(tabId);
  };

  // ── Navigation — 2 niveaux : 7 groupes + sous-onglets ────────────────────
  // Refonte UX : passage de 18 onglets plats → 7 groupes thématiques.
  // Le rendu reste basé sur `ong` (id de sous-onglet) pour rétro-compat.
  interface NavTab { id: string; l: string; alert?: boolean }
  interface NavGroup { id: string; l: string; tabs: NavTab[] }

  const NAV_GROUPS: NavGroup[] = [
    {
      id: "g_aujourdhui", l: `🌅 Aujourd'hui${retards > 0 ? ` ⚠${retards}` : ""}`,
      tabs: [{ id: "aujourdhui", l: "Aujourd'hui", alert: critiques }],
    },
    {
      id: "g_planning", l: "📅 Planning",
      tabs: [
        { id: "planning_fab", l: "Hebdo (commandes & affectations)" },
        { id: "charge",       l: "Charge 8 sem." },
        { id: "dashboard",    l: `Suivi & crise${retards > 0 ? ` (${retards})` : ""}` },
      ],
    },
    {
      id: "g_commandes", l: `📂 Commandes (${commandes.length})`,
      tabs: [
        { id: "carnet", l: "Carnet" },
        { id: "saisie", l: "➕ Nouvelle" },
      ],
    },
    {
      id: "g_logistique", l: "🚚 Logistique",
      tabs: [
        { id: "livraison",   l: "Livraisons" },
        { id: "chargements", l: "Chargements" },
        { id: "chauffeurs",  l: "Chauffeurs" },
      ],
    },
    {
      id: "g_equipe", l: "👥 Équipe",
      tabs: [
        { id: "rh",       l: "Planning RH & Compétences" },
        { id: "pointage", l: "Pointage rétro" },
      ],
    },
    {
      id: "g_atelier", l: "🏭 Atelier",
      tabs: [
        { id: "affichage_atelier", l: "Affichage TV" },
        { id: "isula",             l: "ISULA & vitrages" },
        { id: "qualite",           l: "Qualité" },
        { id: "stocks",            l: `Stocks${ruptures > 0 ? ` ⚠${ruptures}` : ""}`, alert: ruptures > 0 },
      ],
    },
    {
      id: "g_reglages", l: "⚙ Réglages",
      tabs: [
        { id: "referentiel", l: "Référentiel" },
        { id: "stats_admin", l: "Stats" },
        { id: "import_csv",  l: "Import CSV" },
        ...(isAdmin ? [{ id: "admin_users", l: "Utilisateurs" }] : []),
      ],
    },
  ];

  // Filtrer par permissions : un groupe est visible s'il a au moins 1 tab visible.
  const filteredGroups = NAV_GROUPS
    .map(g => ({ ...g, tabs: g.tabs.filter(t => t.id === "admin_users" || canSeeTab(t.id)) }))
    .filter(g => g.tabs.length > 0);

  // Trouver le groupe actif depuis `ong` courant
  const currentGroup = filteredGroups.find(g => g.tabs.some(t => t.id === ong)) ?? filteredGroups[0];

  // (drag-and-drop personnalisé des onglets supprimé avec la refonte en 7 groupes :
  // l'ordre canonique métier est désormais imposé pour la cohérence d'équipe)

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

  const editCommande = (cmd: CommandeCC) => { setEditReturnTab(ong); setCmdEdit(cmd); setOng("saisie"); };

  const modifCommande = async (cmd: CommandeCC) => {
    try {
      const res = await fetch(`/api/commandes/${cmd.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cmd),
      });
      if (res.ok) {
        const saved = await res.json();
        setCommandes(p => p.map(x => x.id === saved.id ? saved : x));
        setApiError(null);
        setCmdEdit(null);
        setOng(editReturnTab || "carnet");
      } else {
        const err = await res.json().catch(() => ({}));
        setApiError(`Modification échouée: ${err.error || res.status}`);
      }
    } catch (e: unknown) {
      setApiError(`Erreur réseau: ${e instanceof Error ? e.message : "inconnue"}`);
    }
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

  // ── Mobile bottom nav : groupes prioritaires + bouton "Plus" ──
  // 4 groupes en bottom + Plus pour les autres. Aujourd'hui/Planning/
  // Commandes/Atelier sont les plus utilisés au quotidien.
  const mobileMainGroupIds = ["g_aujourdhui", "g_planning", "g_commandes", "g_atelier"];
  const mobileMainGroups = filteredGroups.filter(g => mobileMainGroupIds.includes(g.id));
  const mobileMoreGroups = filteredGroups.filter(g => !mobileMainGroupIds.includes(g.id));

  // Icônes courtes pour la bottom nav mobile (extraits depuis le label du groupe)
  const groupShortLabel = (g: NavGroup): string => {
    // Premier emoji + premier mot
    const m = g.l.match(/^(\S+)\s+(\S+)/);
    return m ? m[2].replace(/[^\wÀ-ÿ]/g, "") : g.l;
  };
  const groupIcon = (g: NavGroup): string => {
    const m = g.l.match(/^(\S+)/);
    return m ? m[1] : "•";
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, paddingBottom: mobile ? 64 : 0 }}>

      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <div style={{
        background: C.s1, borderBottom: `1px solid ${C.border}`,
        padding: mobile ? "8px 12px" : "12px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ fontSize: mobile ? 13 : 16, fontWeight: 800 }}>
          <span style={{ color: C.orange }}>SIAL</span>
          <span style={{ color: C.sec, margin: "0 4px", fontWeight: 300 }}>+</span>
          <span style={{ color: C.teal }}>ISULA</span>
          {!mobile && (
            <>
              <span style={{ color: C.sec, margin: "0 6px", fontWeight: 300 }}>|</span>
              <span>Planning Industriel</span>
              <span style={{ fontSize: 11, color: C.muted, marginLeft: 6 }}>v9.0</span>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: mobile ? 4 : 6, flexWrap: "wrap", alignItems: "center" }}>
          {!mobile && <Bdg t={`${commandes.length} cmd`} c={C.blue} />}
          {ruptures > 0 && <Bdg t={`⚠${ruptures}`} c={C.red} />}
          {retards > 0 && <Bdg t={`⚠${retards}`} c={C.red} />}
          {session?.user && (
            <span style={{ fontSize: mobile ? 10 : 11, color: C.sec, marginLeft: mobile ? 4 : 8 }}>
              {mobile ? (session.user.name?.split(" ")[0] ?? "") : session.user.name}
              <button onClick={() => signOut()} style={{ marginLeft: 6, padding: "2px 6px", background: "none", border: `1px solid ${C.border}`, borderRadius: 3, color: C.sec, cursor: "pointer", fontSize: 10 }}>
                {mobile ? "×" : "Déconnexion"}
              </button>
            </span>
          )}
        </div>
      </div>

      {/* ══ DESKTOP NAV (2 niveaux : groupes + sous-onglets) ═══════════════ */}
      {!mobile && (
        <>
          {/* Niveau 1 : groupes thématiques */}
          <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, paddingLeft: 16, background: C.s1, overflowX: "auto" }}>
            {filteredGroups.map(g => {
              const isActive = currentGroup?.id === g.id;
              const hasAlert = g.tabs.some(t => t.alert);
              return (
                <button key={g.id}
                  onClick={() => {
                    if (!g.tabs[0]) return;
                    if (g.tabs[0].id !== "saisie") setCmdEdit(null);
                    setOng(g.tabs[0].id);
                  }}
                  style={{
                    padding: "10px 18px", background: isActive ? C.orange + "11" : "none",
                    border: "none",
                    borderBottom: `3px solid ${isActive ? C.orange : "transparent"}`,
                    color: isActive ? C.text : hasAlert ? C.red : C.sec,
                    fontSize: 13, fontWeight: isActive ? 800 : 600, cursor: "pointer", whiteSpace: "nowrap",
                  }}>
                  {g.l}
                </button>
              );
            })}
          </div>
          {/* Niveau 2 : sous-onglets du groupe actif (caché si 1 seul) */}
          {currentGroup && currentGroup.tabs.length > 1 && (
            <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, paddingLeft: 24, background: C.bg, overflowX: "auto" }}>
              {currentGroup.tabs.map(t => {
                const isActive = ong === t.id;
                return (
                  <button key={t.id}
                    onClick={() => {
                      if (t.id !== "saisie") setCmdEdit(null);
                      setOng(t.id);
                    }}
                    style={{
                      padding: "8px 14px", background: "none",
                      border: "none",
                      borderBottom: `2px solid ${isActive ? C.orange : "transparent"}`,
                      color: isActive ? C.orange : t.alert ? C.red : C.muted,
                      fontSize: 11, fontWeight: isActive ? 700 : 500, cursor: "pointer", whiteSpace: "nowrap",
                    }}>
                    {t.l}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ══ CONTENU ════════════════════════════════════════════════════════ */}
      <div style={{ padding: mobile ? "12px 8px" : "20px 16px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: C.sec }}>
            <div style={{ fontSize: 24, marginBottom: 10 }}>⏳</div>
            <div>Chargement des données…</div>
          </div>
        ) : (
          <>
            {apiError && (
              <div style={{ marginBottom: 12, padding: "10px 14px", background: "#EF535022", border: `1px solid ${C.red}44`, borderRadius: 8, fontSize: 12, color: C.red }}>
                <b>Erreur API :</b> {apiError}
                <button onClick={fetchAll} style={{ marginLeft: 12, padding: "4px 10px", background: C.red, border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 11 }}>Recharger</button>
              </div>
            )}
            {ong === "aujourdhui" && <Aujourdhui commandes={commandes} stocks={stocks} onNav={setOng} />}
            {/* Planning hebdo : Commandes + Affectations en sous-onglets internes
                conservés (gros composant unique avec son onglet interne). */}
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
            {ong === "charge" && <ChargeCapacite commandes={commandes} />}
            {/* Suivi : Dashboard + Crise en sous-onglets internes */}
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

            {/* 📂 Commandes */}
            {ong === "carnet" && <Carnet commandes={commandes} onDelete={delCommande} onEdit={editCommande} onPatch={patchCommande} savedFiltersState={carnetFilters} onFiltersChange={setCarnetFilters} />}
            {ong === "saisie" && <SaisieCommande key={String(cmdEdit?.id || "new")} onAjouter={addCommande} commande={cmdEdit} onModifier={modifCommande} />}

            {/* 🚚 Logistique */}
            {ong === "livraison" && <PlanningLivraison commandes={commandes} onPatch={patchCommande} onEdit={editCommande} />}
            {ong === "chargements" && <PlanningChargements commandes={commandes} onPatch={patchCommande} onEdit={editCommande} />}
            {ong === "chauffeurs" && <Chauffeurs />}

            {/* 👥 Équipe : Planning RH + Compétences en sous-onglets internes */}
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

            {/* 🏭 Atelier */}
            {ong === "affichage_atelier" && <AffichageAtelier commandes={commandes} stocks={stocks} />}
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

            {/* ⚙ Réglages */}
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
            {ong === "stats_admin" && <StatsAdmin />}
            {ong === "import_csv" && <ImportCSV onRefresh={fetchAll} />}
            {ong === "admin_users" && isAdmin && <AdminUsers />}
          </>
        )}
      </div>
      {!mobile && <TutoAJ onGoToDashboard={() => setOng("planning_fab")} />}
      <AssistantIA />

      {/* ══ MOBILE BOTTOM NAV (par groupes) ═══════════════════════════════ */}
      {mobile && (
        <>
          {/* Menu "plus" overlay : autres groupes + leurs sous-onglets */}
          {mobileMenuOpen && (
            <div
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 998 }}
              onClick={() => setMobileMenuOpen(false)}
            >
              <div
                style={{
                  position: "absolute", bottom: 64, left: 0, right: 0,
                  background: C.s1, borderTop: `1px solid ${C.border}`,
                  borderRadius: "16px 16px 0 0", padding: "16px 12px",
                  maxHeight: "70vh", overflowY: "auto",
                }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: C.sec, marginBottom: 10, letterSpacing: 1 }}>
                  AUTRES SECTIONS
                </div>
                {mobileMoreGroups.map(g => (
                  <div key={g.id} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 6 }}>{g.l}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      {g.tabs.map(t => (
                        <button key={t.id}
                          onClick={() => { if (t.id !== "saisie") setCmdEdit(null); setOng(t.id); setMobileMenuOpen(false); }}
                          style={{
                            padding: "10px 12px", background: ong === t.id ? C.orange + "22" : C.bg,
                            border: `1px solid ${ong === t.id ? C.orange : C.border}`,
                            borderRadius: 8, cursor: "pointer", textAlign: "left",
                            color: ong === t.id ? C.orange : t.alert ? C.red : C.sec,
                            fontSize: 11, fontWeight: ong === t.id ? 700 : 500,
                          }}>
                          {t.l}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sous-onglets visibles en bandeau au-dessus de la bottom bar
              uniquement si le groupe actif a >1 sous-onglet */}
          {currentGroup && currentGroup.tabs.length > 1 && (
            <div style={{
              position: "fixed", bottom: 60, left: 0, right: 0, zIndex: 996,
              background: C.s1, borderTop: `1px solid ${C.border}`,
              display: "flex", overflowX: "auto", height: 36,
            }}>
              {currentGroup.tabs.map(t => {
                const active = ong === t.id;
                return (
                  <button key={t.id}
                    onClick={() => { if (t.id !== "saisie") setCmdEdit(null); setOng(t.id); }}
                    style={{
                      padding: "8px 12px", background: "none", border: "none",
                      borderBottom: `2px solid ${active ? C.orange : "transparent"}`,
                      color: active ? C.orange : t.alert ? C.red : C.muted,
                      fontSize: 10, fontWeight: active ? 700 : 500, cursor: "pointer", whiteSpace: "nowrap",
                    }}>
                    {t.l}
                  </button>
                );
              })}
            </div>
          )}

          {/* Bottom bar : 4 groupes principaux + Plus */}
          <div style={{
            position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 997,
            background: C.s1, borderTop: `1px solid ${C.border}`,
            display: "flex", justifyContent: "space-around", alignItems: "stretch",
            height: 60, paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}>
            {mobileMainGroups.map(g => {
              const active = currentGroup?.id === g.id;
              return (
                <button key={g.id}
                  onClick={() => {
                    if (!g.tabs[0]) return;
                    if (g.tabs[0].id !== "saisie") setCmdEdit(null);
                    setOng(g.tabs[0].id);
                    setMobileMenuOpen(false);
                  }}
                  style={{
                    flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                    justifyContent: "center", gap: 2,
                    background: "none", border: "none", cursor: "pointer",
                    borderTop: `2px solid ${active ? C.orange : "transparent"}`,
                  }}
                >
                  <span style={{ fontSize: 20 }}>{groupIcon(g)}</span>
                  <span style={{ fontSize: 9, color: active ? C.orange : C.sec, fontWeight: active ? 700 : 400 }}>
                    {groupShortLabel(g)}
                  </span>
                </button>
              );
            })}
            {/* Bouton "Plus" */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", gap: 2,
                background: "none", border: "none", cursor: "pointer",
                borderTop: `2px solid ${mobileMenuOpen ? C.orange : "transparent"}`,
              }}
            >
              <span style={{ fontSize: 20 }}>•••</span>
              <span style={{ fontSize: 9, color: mobileMenuOpen ? C.orange : C.sec, fontWeight: mobileMenuOpen ? 700 : 400 }}>Plus</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
