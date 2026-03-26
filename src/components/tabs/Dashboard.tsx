"use client";
import { useState } from "react";
import { calcCheminCritique, C, fmtDate, CommandeCC, STOCKS_DEF } from "@/lib/sial-data";
import { H } from "@/components/ui";

interface Props {
  commandes: CommandeCC[];
  stocks: Record<string, { actuel: number }>;
  onNav: (tab: string) => void;
  onRefresh: () => void;
}

export default function Dashboard({ commandes, stocks, onNav, onRefresh }: Props) {
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const importFromLocalStorage = async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const raw = localStorage.getItem("sial_v8_cmd");
      if (!raw) { setImportResult("Aucune commande trouvée dans l'ancien stockage local."); setImporting(false); return; }
      const cmds: CommandeCC[] = JSON.parse(raw);
      if (!cmds.length) { setImportResult("Le stockage local est vide."); setImporting(false); return; }
      let ok = 0, err = 0;
      for (const cmd of cmds) {
        try {
          const res = await fetch("/api/commandes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cmd) });
          if (res.ok) ok++; else err++;
        } catch { err++; }
      }
      localStorage.removeItem("sial_v8_cmd");
      setImportResult(`✓ ${ok} commande(s) importée(s)${err > 0 ? ` · ${err} erreur(s)` : ""}. Données supprimées du stockage local.`);
      onRefresh();
    } catch {
      setImportResult("Erreur lors de la lecture du stockage local.");
    }
    setImporting(false);
  };

  const hasLocalData = typeof window !== "undefined" && !!localStorage.getItem("sial_v8_cmd");
  const today = new Date().toISOString().split("T")[0];
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

  const chemins = commandes.map(c => ({ cmd: c, cc: calcCheminCritique(c) }));
  const critiques = chemins.filter(x => x.cc?.critique);
  const enRetard  = chemins.filter(x => x.cc?.enRetard && !x.cc?.critique);
  const livSemaine = commandes.filter(c => c.date_livraison_souhaitee && c.date_livraison_souhaitee <= in7 && c.date_livraison_souhaitee >= today);

  type AlerteAchat = { cmd: CommandeCC; matiere: string; probleme: "non_passee" | "sans_date" };
  const alertesAchats: AlerteAchat[] = [];
  commandes.forEach(c => {
    const cmd = c as any;
    if (cmd.cmd_alu_passee === false)               alertesAchats.push({ cmd: c, matiere: "Profilés ALU",   probleme: "non_passee" });
    if (cmd.cmd_pvc_passee === false)               alertesAchats.push({ cmd: c, matiere: "Profilés PVC",   probleme: "non_passee" });
    if (cmd.cmd_accessoires_passee === false)       alertesAchats.push({ cmd: c, matiere: "Accessoires",    probleme: "non_passee" });
    if (cmd.cmd_alu_passee === true && !cmd.date_alu)          alertesAchats.push({ cmd: c, matiere: "Profilés ALU",   probleme: "sans_date" });
    if (cmd.cmd_pvc_passee === true && !cmd.date_pvc)          alertesAchats.push({ cmd: c, matiere: "Profilés PVC",   probleme: "sans_date" });
    if (cmd.cmd_accessoires_passee === true && !cmd.date_accessoires) alertesAchats.push({ cmd: c, matiere: "Accessoires", probleme: "sans_date" });
  });

  const ruptures = Object.entries(STOCKS_DEF).filter(([id, st]) => {
    const a = parseFloat(String(stocks[id]?.actuel)) || 0;
    return a > 0 && a < st.min;
  });
  const prochainVitrage = chemins
    .filter(x => x.cc?.dateCmdVitrage && x.cc.dateCmdVitrage >= today)
    .sort((a, b) => (a.cc!.dateCmdVitrage! > b.cc!.dateCmdVitrage! ? 1 : -1))[0];

  const KPI = ({ val, label, color, onClick }: { val: string | number; label: string; color: string; onClick?: () => void }) => (
    <div onClick={onClick} style={{ background: C.s1, border: `1px solid ${color}44`, borderRadius: 8, padding: "16px 20px", textAlign: "center", cursor: onClick ? "pointer" : "default", transition: "border-color 0.15s" }}>
      <div style={{ fontSize: 32, fontWeight: 800, color, lineHeight: 1 }}>{val}</div>
      <div style={{ fontSize: 10, color: C.sec, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
    </div>
  );

  const NavBtn = ({ tab, label, color }: { tab: string; label: string; color: string }) => (
    <button onClick={() => onNav(tab)} style={{ padding: "8px 14px", background: color + "22", border: `1px solid ${color}55`, borderRadius: 5, color, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
      {label}
    </button>
  );

  return (
    <div>
      <H c={C.orange}>Tableau de bord</H>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 20 }}>
        <KPI val={commandes.length} label="Commandes" color={C.blue} onClick={() => onNav("carnet")} />
        <KPI val={critiques.length} label="Critiques" color={C.red} onClick={critiques.length > 0 ? () => onNav("crise") : undefined} />
        <KPI val={enRetard.length} label="En retard" color={C.orange} onClick={enRetard.length > 0 ? () => onNav("crise") : undefined} />
        <KPI val={livSemaine.length} label="Livraisons ≤7j" color={C.teal} onClick={livSemaine.length > 0 ? () => onNav("livraison") : undefined} />
        <KPI val={alertesAchats.length} label="Achats en attente" color={alertesAchats.length > 0 ? C.yellow : C.green} />
        <KPI val={ruptures.length} label="Ruptures stock" color={ruptures.length > 0 ? C.red : C.green} onClick={ruptures.length > 0 ? () => onNav("stocks") : undefined} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
        {/* Alertes critiques */}
        <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 10, color: C.red, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 10 }}>ALERTES CRITIQUES</div>
          {critiques.length === 0 && enRetard.length === 0 && (
            <div style={{ fontSize: 12, color: C.green, padding: "8px 0" }}>Aucune alerte — toutes les commandes sont dans les temps.</div>
          )}
          {[...critiques, ...enRetard].slice(0, 6).map(({ cmd, cc }) => (
            <div key={String(cmd.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
              <div>
                <span className="mono" style={{ fontSize: 10, color: C.orange }}>{(cmd as any).num_commande || "—"}</span>
                <span style={{ fontSize: 12, fontWeight: 600, marginLeft: 6 }}>{cmd.client}</span>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: cc?.critique ? C.red : C.orange }}>
                {cc?.critique ? `CRITIQUE +${cc.retardJours}j` : `+${cc?.retardJours}j`}
              </span>
            </div>
          ))}
          {critiques.length + enRetard.length > 6 && (
            <div style={{ fontSize: 10, color: C.sec, marginTop: 6 }}>+ {critiques.length + enRetard.length - 6} autre(s)</div>
          )}
        </div>

        {/* Livraisons à venir */}
        <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 10, color: C.teal, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 10 }}>LIVRAISONS 7 PROCHAINS JOURS</div>
          {livSemaine.length === 0 && (
            <div style={{ fontSize: 12, color: C.sec, padding: "8px 0" }}>Aucune livraison prévue cette semaine.</div>
          )}
          {livSemaine.sort((a, b) => (a.date_livraison_souhaitee! > b.date_livraison_souhaitee! ? 1 : -1)).map(c => {
            const cc = calcCheminCritique(c);
            const rc = cc?.critique ? C.red : cc?.enRetard ? C.orange : C.green;
            return (
              <div key={String(c.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                <div>
                  <span className="mono" style={{ fontSize: 10, color: C.orange }}>{(c as any).num_commande || "—"}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, marginLeft: 6 }}>{c.client}</span>
                </div>
                <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: rc }}>{fmtDate(c.date_livraison_souhaitee)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ISULA + Ruptures */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
        <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 10, color: C.cyan, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 10 }}>PROCHAIN VITRAGE ISULA</div>
          {prochainVitrage ? (
            <div>
              <div style={{ fontSize: 11, color: C.sec, marginBottom: 4 }}>Commander le</div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 800, color: C.cyan }}>{fmtDate(prochainVitrage.cc!.dateCmdVitrage)}</div>
              <div style={{ fontSize: 12, marginTop: 6, color: C.text }}>{prochainVitrage.cmd.client}</div>
              <div style={{ fontSize: 10, color: C.sec }}>{(prochainVitrage.cmd as any).num_commande}</div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: C.sec }}>Aucun vitrage à commander prochainement.</div>
          )}
        </div>

        <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 10, color: ruptures.length > 0 ? C.red : C.green, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 10 }}>STOCKS TAMPONS</div>
          {ruptures.length === 0 ? (
            <div style={{ fontSize: 12, color: C.green }}>Tous les stocks sont au-dessus du seuil minimum.</div>
          ) : (
            ruptures.map(([id, st]) => {
              const actuel = parseFloat(String(stocks[id]?.actuel)) || 0;
              return (
                <div key={id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 11, color: C.text }}>{st.label}</span>
                  <span className="mono" style={{ fontSize: 11, color: C.red }}>{actuel} / {st.min} min</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Alertes achats matières */}
      <div style={{ background: C.s1, border: `1px solid ${alertesAchats.length > 0 ? C.yellow : C.border}`, borderRadius: 8, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: alertesAchats.length > 0 ? C.yellow : C.sec, fontWeight: 700, letterSpacing: "0.08em", marginBottom: alertesAchats.length > 0 ? 10 : 0 }}>
          ACHATS MATIÈRES{alertesAchats.length === 0 ? " — Tout est en ordre" : ""}
        </div>
        {alertesAchats.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {alertesAchats.map((a, i) => {
              const cmd = a.cmd as any;
              const color = a.probleme === "non_passee" ? C.red : C.orange;
              const label = a.probleme === "non_passee" ? "Commande non passée" : "Passée — date de réception manquante";
              return (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: color + "11", border: `1px solid ${color}44`, borderRadius: 5 }}>
                  <div>
                    <span className="mono" style={{ fontSize: 10, color: C.orange }}>{cmd.num_commande || "—"}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, marginLeft: 6 }}>{a.cmd.client}</span>
                    <span style={{ fontSize: 10, color: C.sec, marginLeft: 6 }}>{a.matiere}</span>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, color, whiteSpace: "nowrap", marginLeft: 8 }}>{label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Import localStorage */}
      {(hasLocalData || importResult) && (
        <div style={{ background: C.s1, border: `1px solid ${C.yellow}`, borderRadius: 8, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: C.yellow, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 8 }}>IMPORT ANCIEN STOCKAGE LOCAL</div>
          <div style={{ fontSize: 12, color: C.sec, marginBottom: 10 }}>
            Des commandes ont été trouvées dans l&apos;ancien stockage de ce navigateur. Cliquez pour les importer en base de données partagée.
          </div>
          {importResult && (
            <div style={{ marginBottom: 8, fontSize: 12, color: importResult.startsWith("✓") ? C.green : C.red, fontWeight: 600 }}>{importResult}</div>
          )}
          {!importResult && (
            <button onClick={importFromLocalStorage} disabled={importing} style={{ padding: "7px 16px", background: C.yellow + "33", border: `1px solid ${C.yellow}`, borderRadius: 5, color: C.yellow, fontSize: 12, fontWeight: 700, cursor: importing ? "wait" : "pointer" }}>
              {importing ? "Import en cours…" : "⬆ Importer les commandes du navigateur"}
            </button>
          )}
        </div>
      )}

      {/* Accès rapide */}
      <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
        <div style={{ fontSize: 10, color: C.sec, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 10 }}>ACCÈS RAPIDE</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <NavBtn tab="saisie"      label="➕ Nouvelle commande"    color={C.orange} />
          <NavBtn tab="carnet"      label="📂 Carnet"               color={C.blue} />
          <NavBtn tab="crise"       label="🚨 Gestion de crise"     color={C.red} />
          <NavBtn tab="calendrier"  label="📅 Planning calendrier"  color={C.teal} />
          <NavBtn tab="livraison"   label="🚚 Planning livraisons"  color={C.cyan} />
          <NavBtn tab="charge"      label="📊 Charge semaine"       color={C.purple} />
          <NavBtn tab="stocks"      label="📦 Stocks tampons"       color={C.yellow} />
        </div>
      </div>
    </div>
  );
}
