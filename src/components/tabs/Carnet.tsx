"use client";
import { TYPES_MENUISERIE, C, CFAM, calcTempsType, dateDemarrage, hm, fmtDate, CommandeCC } from "@/lib/sial-data";
import { H, Bdg, Card } from "@/components/ui";

export default function Carnet({ commandes, onDelete }: { commandes: CommandeCC[]; onDelete: (id: any) => void }) {
  const sorted = [...commandes].sort((a, b) => new Date(a.date_livraison_souhaitee || "").getTime() - new Date(b.date_livraison_souhaitee || "").getTime());

  return (
    <div>
      <H c={C.blue}>Carnet de commandes</H>
      {sorted.length === 0 && <div style={{ textAlign: "center", padding: 40, color: C.sec }}>Aucune commande.</div>}
      {sorted.map(c => {
        const tm = TYPES_MENUISERIE[c.type];
        const t = calcTempsType(c.type, c.quantite, c.hsTemps);
        const jr = Math.round((new Date(c.date_livraison_souhaitee || "").getTime() - Date.now()) / 86400000);
        const jc = jr < 7 ? C.red : jr < 21 ? C.orange : C.green;
        const cmd = c as any;
        return (
          <Card key={String(c.id)} accent={c.priorite === "chantier_bloque" ? C.red : c.priorite === "urgente" ? C.orange : C.border} style={{ marginBottom: 7 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                  <span className="mono" style={{ fontSize: 11, color: C.orange, fontWeight: 700 }}>{cmd.num_commande || "—"}</span>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{c.client}</span>
                  {cmd.ref_chantier && <Bdg t={cmd.ref_chantier} c={C.teal} />}
                  {cmd.zone && <Bdg t={cmd.zone} c={C.sec} />}
                  {tm && <Bdg t={tm.label} c={tm.famille === "hors_standard" ? C.purple : CFAM[tm.famille] || C.blue} />}
                  {(cmd.date_panneau_porte || cmd.date_volet_roulant) && <Bdg t="+ options" c={C.yellow} />}
                </div>
                <div style={{ fontSize: 10, color: C.sec, display: "flex", gap: 10, flexWrap: "wrap" }} className="mono">
                  <span>{c.quantite} pcs</span>
                  {cmd.semaine_theorique && <span style={{ color: C.blue }}>Théo:{cmd.semaine_theorique}</span>}
                  {cmd.semaine_atteignable && <span style={{ color: C.green }}>Atteignable:{cmd.semaine_atteignable}</span>}
                  {t && <span>{hm(t.tTotal)} fab.</span>}
                  <span>Démarrage:{fmtDate(dateDemarrage(c))}</span>
                  {cmd.vitrages?.length > 0 && <span style={{ color: C.teal }}>{Math.round(cmd.vitrages.reduce((s: number, v: any) => s + (parseFloat(v.surface_m2) || 0), 0) * 100) / 100}m² vitrage</span>}
                  {cmd.lignes?.length > 1 && <span style={{ color: C.purple }}>{cmd.lignes.length} types menuiserie</span>}
                </div>
              </div>
              <div style={{ textAlign: "right", marginRight: 10 }}>
                <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: jc }}>J{jr >= 0 ? `-${jr}` : `+${Math.abs(jr)}`}</div>
                <div style={{ fontSize: 9, color: C.sec }}>{fmtDate(c.date_livraison_souhaitee)}</div>
              </div>
              <button onClick={() => onDelete(c.id)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 3, color: C.sec, cursor: "pointer", padding: "3px 7px", fontSize: 11 }}>✕</button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
