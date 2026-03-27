"use client";
import { TYPES_MENUISERIE, C, CFAM, calcTempsType, calcCheminCritique, dateDemarrage, hm, fmtDate, CommandeCC } from "@/lib/sial-data";
import { H, Bdg, Card } from "@/components/ui";

const ETAPES = [
  { key: "etape_coupe_ok",   label: "Coupe",   c: "#42A5F5" },
  { key: "etape_montage_ok", label: "Montage", c: "#FFA726" },
  { key: "etape_vitrage_ok", label: "Vitrage", c: "#26C6DA", skipIfAucunVitrage: true },
  { key: "etape_palette_ok", label: "Palette", c: "#66BB6A" },
];

export default function Carnet({ commandes, onDelete, onEdit, onPatch }: {
  commandes: CommandeCC[];
  onDelete: (id: any) => void;
  onEdit: (cmd: CommandeCC) => void;
  onPatch: (id: string, updates: Record<string, boolean>) => void;
}) {
  const sorted = [...commandes].sort((a, b) => new Date(a.date_livraison_souhaitee || "").getTime() - new Date(b.date_livraison_souhaitee || "").getTime());

  return (
    <div>
      <H c={C.blue}>Carnet de commandes</H>
      {sorted.length === 0 && <div style={{ textAlign: "center", padding: 40, color: C.sec }}>Aucune commande.</div>}
      {sorted.map(c => {
        const tm = TYPES_MENUISERIE[c.type];
        const t = calcTempsType(c.type, c.quantite, c.hsTemps);
        const cc = calcCheminCritique(c);
        const jr = Math.round((new Date(c.date_livraison_souhaitee || "").getTime() - Date.now()) / 86400000);
        const jc = jr < 7 ? C.red : jr < 21 ? C.orange : C.green;
        const retardColor = cc?.critique ? C.red : cc?.enRetard ? C.orange : C.green;
        const cmd = c as any;

        const etapesApplicables = ETAPES.filter(e => !(e.skipIfAucunVitrage && cmd.aucun_vitrage));
        const toutTermine = etapesApplicables.every(e => !!cmd[e.key]);

        return (
          <Card key={String(c.id)} accent={cc?.critique ? C.red : c.priorite === "chantier_bloque" ? C.red : c.priorite === "urgente" ? C.orange : C.border} style={{ marginBottom: 7 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                  <span className="mono" style={{ fontSize: 11, color: C.orange, fontWeight: 700 }}>{cmd.num_commande || "—"}</span>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{c.client}</span>
                  {cmd.ref_chantier && <Bdg t={cmd.ref_chantier} c={C.teal} />}
                  {cmd.zone && <Bdg t={cmd.zone} c={C.sec} />}
                  {tm && <Bdg t={tm.label} c={tm.famille === "hors_standard" ? C.purple : CFAM[tm.famille] || C.blue} />}
                  {(cmd.date_panneau_porte || cmd.date_volet_roulant) && <Bdg t="+ options" c={C.yellow} />}
                  {toutTermine && <Bdg t="✅ Terminé" c={C.green} />}
                  {cc?.enRetard
                    ? <Bdg t={cc.critique ? `CRITIQUE +${cc.retardJours}j` : `retard +${cc.retardJours}j`} c={retardColor} />
                    : cc ? <Bdg t={`OK ${Math.abs(cc.retardJours)}j marge`} c={C.green} /> : null}
                </div>
                <div style={{ fontSize: 10, color: C.sec, display: "flex", gap: 10, flexWrap: "wrap" }} className="mono">
                  <span>{c.quantite} pcs</span>
                  {t && <span>{hm(t.tTotal)} fab.</span>}
                  <span>Démarrage:{fmtDate(dateDemarrage(c))}</span>
                  {cc && <span style={{ color: retardColor }}>Au+tôt:{fmtDate(cc.dateLivraisonAuPlusTot)}</span>}
                  {cc?.dateCmdVitrage && <span style={{ color: C.cyan }}>ISULA:{fmtDate(cc.dateCmdVitrage)}</span>}
                  {cmd.aucun_vitrage && <span style={{ color: C.orange }}>Sans vitrage</span>}
                  {cmd.vitrages?.length > 0 && !cmd.aucun_vitrage && <span style={{ color: C.teal }}>{Math.round(cmd.vitrages.reduce((s: number, v: any) => s + (parseFloat(v.surface_m2) || 0), 0) * 100) / 100}m² vit.</span>}
                </div>
                {(cmd.cmd_alu_necessaire || cmd.cmd_pvc_necessaire || cmd.cmd_accessoires_necessaire || cmd.cmd_panneau_necessaire || cmd.cmd_volet_necessaire) && (
                  <div style={{ fontSize: 9, display: "flex", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                    {cmd.cmd_alu_necessaire && <span style={{ color: cmd.cmd_alu_passee ? C.green : C.red }}>{cmd.cmd_alu_passee ? "✓" : "⚠"} ALU{cmd.date_alu ? " "+fmtDate(cmd.date_alu) : ""}</span>}
                    {cmd.cmd_pvc_necessaire && <span style={{ color: cmd.cmd_pvc_passee ? C.green : C.red }}>{cmd.cmd_pvc_passee ? "✓" : "⚠"} PVC{cmd.date_pvc ? " "+fmtDate(cmd.date_pvc) : ""}</span>}
                    {cmd.cmd_accessoires_necessaire && <span style={{ color: cmd.cmd_accessoires_passee ? C.green : C.red }}>{cmd.cmd_accessoires_passee ? "✓" : "⚠"} Access.{cmd.date_accessoires ? " "+fmtDate(cmd.date_accessoires) : ""}</span>}
                    {cmd.cmd_panneau_necessaire && <span style={{ color: cmd.cmd_panneau_passee ? C.green : C.red }}>{cmd.cmd_panneau_passee ? "✓" : "⚠"} Panneau{cmd.date_panneau_porte ? " "+fmtDate(cmd.date_panneau_porte) : ""}</span>}
                    {cmd.cmd_volet_necessaire && <span style={{ color: cmd.cmd_volet_passee ? C.green : C.red }}>{cmd.cmd_volet_passee ? "✓" : "⚠"} Volet{cmd.date_volet_roulant ? " "+fmtDate(cmd.date_volet_roulant) : ""}</span>}
                  </div>
                )}

                {/* ── Suivi étapes de fabrication ── */}
                <div style={{ marginTop: 7, display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 9, color: C.sec, fontWeight: 700, marginRight: 2 }}>ÉTAPES :</span>
                  {etapesApplicables.map(({ key, label, c: col }) => {
                    const done = !!cmd[key];
                    return (
                      <button key={key}
                        onClick={() => onPatch(String(c.id), { [key]: !done })}
                        title={done ? `Décocher "${label}"` : `Marquer "${label}" comme terminé`}
                        style={{
                          padding: "2px 9px", background: done ? col+"33" : C.s2,
                          border: `1px solid ${done ? col : C.border}`,
                          borderRadius: 4, fontSize: 10, color: done ? col : C.muted,
                          cursor: "pointer", fontWeight: done ? 700 : 400, transition: "all 0.15s",
                        }}>
                        {done ? "✓ " : ""}{label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ textAlign: "right", marginRight: 10 }}>
                <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: jc }}>J{jr >= 0 ? `-${jr}` : `+${Math.abs(jr)}`}</div>
                <div style={{ fontSize: 9, color: C.sec }}>{fmtDate(c.date_livraison_souhaitee)}</div>
              </div>
              <button onClick={() => onEdit(c)} style={{ background: "none", border: `1px solid ${C.blue}`, borderRadius: 3, color: C.blue, cursor: "pointer", padding: "3px 7px", fontSize: 11, marginRight: 4 }}>✎</button>
              <button onClick={() => { if (window.confirm(`Supprimer ${cmd.num_commande || c.client} ?`)) onDelete(c.id); }} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 3, color: C.sec, cursor: "pointer", padding: "3px 7px", fontSize: 11 }}>✕</button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
