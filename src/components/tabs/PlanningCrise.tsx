"use client";
import { useState, useMemo } from "react";
import { TYPES_MENUISERIE, calcCheminCritique, C, CFAM, fmtDate, hm, CommandeCC } from "@/lib/sial-data";
import { H, Bdg, Card } from "@/components/ui";

export default function PlanningCrise({ commandes }: { commandes: CommandeCC[] }) {
  const [tri, setTri] = useState<"retard" | "livraison" | "client">("retard");

  const chemins = useMemo(() => {
    return commandes
      .map(c => calcCheminCritique(c))
      .filter(Boolean)
      .sort((a, b) => {
        if (tri === "retard") return (b!.retardJours) - (a!.retardJours);
        if (tri === "livraison") return new Date(a!.dateLivraisonSouhaitee || "").getTime() - new Date(b!.dateLivraisonSouhaitee || "").getTime();
        return (a!.client || "").localeCompare(b!.client || "");
      });
  }, [commandes, tri]);

  const enRetard = chemins.filter(c => c!.enRetard).length;
  const critiques = chemins.filter(c => c!.critique).length;
  const ok = chemins.filter(c => !c!.enRetard).length;

  return (
    <div>
      <H c={C.red}>Planning de crise — Chemin critique</H>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
        {[
          { l: "Commandes critiques (>7j retard)", v: critiques, c: C.red },
          { l: "Commandes en retard (≤7j)", v: enRetard - critiques, c: C.orange },
          { l: "Commandes dans les temps", v: ok, c: C.green },
        ].map((x, i) => (
          <div key={i} style={{ textAlign: "center", padding: 14, background: C.s1, borderRadius: 6, border: `1px solid ${x.v > 0 && i < 2 ? x.c : C.border}` }}>
            <div className="mono" style={{ fontSize: 28, fontWeight: 800, color: x.c }}>{x.v}</div>
            <div style={{ fontSize: 10, color: C.sec, marginTop: 4 }}>{x.l}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 14, padding: 10, background: "#1B3A5C33", border: `1px solid ${C.blue}44`, borderRadius: 6 }}>
        <div style={{ fontSize: 10, color: C.blue, fontWeight: 700, marginBottom: 6 }}>RÈGLES TAMPONS APPLIQUÉES</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11, color: C.sec }}>
          <span>½ journée (4h) entre chaque étape</span>
          <span>·</span><span>Vitrage ISULA commandé dès démarrage montage</span>
          <span>·</span><span>Week-ends exclus</span>
          <span>·</span><span>Capacités réelles par poste</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
        {[{ id: "retard", l: "Trier par retard" }, { id: "livraison", l: "Trier par livraison" }, { id: "client", l: "Trier par client" }].map(t => (
          <button key={t.id} onClick={() => setTri(t.id as any)} style={{ padding: "5px 12px", background: tri === t.id ? C.red + "33" : C.s1, border: `1px solid ${tri === t.id ? C.red : C.border}`, borderRadius: 4, color: tri === t.id ? C.red : C.sec, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{t.l}</button>
        ))}
      </div>

      {chemins.length === 0 && <div style={{ textAlign: "center", padding: 40, color: C.sec }}>Aucune commande — ajouter des commandes d&apos;abord.</div>}

      {chemins.map((cc) => {
        if (!cc) return null;
        const tm = TYPES_MENUISERIE[cc.type];
        const retardColor = cc.critique ? C.red : cc.enRetard ? C.orange : C.green;
        return (
          <Card key={String(cc.cmdId)} accent={retardColor} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{cc.client}</span>
                  {tm && <Bdg t={tm.label} c={tm.famille === "hors_standard" ? C.purple : CFAM[tm.famille] || C.blue} />}
                  <Bdg t={`×${cc.quantite}`} c={C.sec} />
                  {cc.priorite !== "normale" && <Bdg t={cc.priorite?.replace("_", " ").toUpperCase() || ""} c={cc.priorite === "chantier_bloque" ? C.red : C.orange} />}
                </div>
                <div style={{ fontSize: 11, color: C.sec }}>
                  Démarrage : <span style={{ color: C.teal }} className="mono">{fmtDate(cc.dateDemarrage)}</span>
                  <span style={{ margin: "0 8px" }}>·</span>
                  Au + tôt : <span style={{ color: retardColor, fontWeight: 700 }} className="mono">{fmtDate(cc.dateLivraisonAuPlusTot)}</span>
                  {cc.dateCmdVitrage && <span style={{ marginLeft: 8, color: C.cyan }}>· Cmd vitrage : {fmtDate(cc.dateCmdVitrage)}</span>}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                {cc.enRetard ? (
                  <div>
                    <div className="mono" style={{ fontSize: 20, fontWeight: 800, color: retardColor }}>+{cc.retardJours}j</div>
                    <div style={{ fontSize: 10, color: C.sec }}>de retard</div>
                    <div style={{ fontSize: 10, color: C.sec }}>Promis : {fmtDate(cc.dateLivraisonSouhaitee)}</div>
                  </div>
                ) : (
                  <div>
                    <div className="mono" style={{ fontSize: 20, fontWeight: 800, color: C.green }}>✓ OK</div>
                    <div style={{ fontSize: 10, color: C.sec }}>{Math.abs(cc.retardJours)}j de marge</div>
                    <div style={{ fontSize: 10, color: C.sec }}>{fmtDate(cc.dateLivraisonSouhaitee)}</div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "grid", gap: 4 }}>
              {cc.etapes.map((e, j) => (
                <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", background: C.bg, borderRadius: 4, border: `1px solid ${e.optionnel ? C.yellow + "44" : C.border}` }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: e.couleur, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: e.optionnel ? C.yellow : C.text, minWidth: 150 }}>{e.label}</span>
                  <span style={{ fontSize: 10, color: C.sec, flex: 1 }}>{e.qui}</span>
                  <span className="mono" style={{ fontSize: 10, color: C.sec }}>{fmtDate(e.debut)}</span>
                  <span style={{ fontSize: 10, color: C.muted }}>→</span>
                  <span className="mono" style={{ fontSize: 10, color: e.couleur, fontWeight: 600 }}>{fmtDate(e.fin)}</span>
                  {e.duree_min > 0 && <Bdg t={hm(e.duree_min)} c={e.couleur} />}
                  {j < cc.etapes.length - 1 && !e.optionnel && <Bdg t="+ ½j tampon" c={C.muted} />}
                </div>
              ))}
            </div>

            {cc.enRetard && (
              <div style={{ marginTop: 8, padding: 8, background: C.red + "22", borderRadius: 4, fontSize: 11, color: C.red }}>
                {cc.critique ? "CRITIQUE — Contacter le client immédiatement pour replanifier" : "EN RETARD — Vérifier si une accélération est possible"}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
