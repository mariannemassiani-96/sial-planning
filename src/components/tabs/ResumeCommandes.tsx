"use client";
import { calcCheminCritique, calcTempsType, C, CFAM, hm, fmtDate, dateDemarrage, CommandeCC, TYPES_MENUISERIE } from "@/lib/sial-data";
import { H, Bdg } from "@/components/ui";

export default function ResumeCommandes({ commandes }: { commandes: CommandeCC[] }) {
  const sorted = [...commandes].sort((a, b) =>
    new Date(a.date_livraison_souhaitee || "9999").getTime() - new Date(b.date_livraison_souhaitee || "9999").getTime()
  );

  if (sorted.length === 0) {
    return (
      <div>
        <H c={C.teal}>Résumé des commandes</H>
        <div style={{ textAlign:"center", padding:40, color:C.sec }}>Aucune commande.</div>
      </div>
    );
  }

  return (
    <div>
      <H c={C.teal}>Résumé des commandes</H>

      {sorted.map(c => {
        const cmd = c as any;
        const tm  = TYPES_MENUISERIE[c.type];
        const cc  = calcCheminCritique(c);
        const t   = calcTempsType(c.type, c.quantite, c.hsTemps);
        const jr  = c.date_livraison_souhaitee
          ? Math.round((new Date(c.date_livraison_souhaitee).getTime() - Date.now()) / 86400000)
          : null;
        const jc  = jr === null ? C.sec : jr < 0 ? C.red : jr < 7 ? C.red : jr < 21 ? C.orange : C.green;
        const retardColor = cc?.critique ? C.red : cc?.enRetard ? C.orange : C.green;

        const etapeCoupe   = cc?.etapes.find(e => e.id === "coupe");
        const etapeMontage = cc?.etapes.find(e => e.id === "montage");
        const etapeVitrage = cc?.etapes.find(e => e.id === "vitrage");
        const etapePalette = cc?.etapes.find(e => e.id === "palette");

        const totalVitrage = cmd.vitrages
          ? Math.round(cmd.vitrages.reduce((s: number, v: any) => s + (parseFloat(v.surface_m2) || 0), 0) * 100) / 100
          : 0;

        return (
          <div key={String(c.id)} style={{ marginBottom:14, background:C.s1, border:`1px solid ${C.border}`, borderLeft:`3px solid ${retardColor}`, borderRadius:7, overflow:"hidden" }}>

            {/* ── En-tête commande ── */}
            <div style={{ padding:"10px 14px", background:C.s2, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
              <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                <span className="mono" style={{ fontSize:11, color:C.orange, fontWeight:700 }}>{cmd.num_commande || "—"}</span>
                <span style={{ fontSize:15, fontWeight:700 }}>{c.client}</span>
                {cmd.ref_chantier && <Bdg t={cmd.ref_chantier} c={C.teal} />}
                {tm && <Bdg t={tm.label} c={tm.famille === "hors_standard" ? C.purple : CFAM[tm.famille] || C.blue} />}
                <Bdg t={`×${c.quantite}`} c={C.sec} />
                {cmd.zone && <Bdg t={cmd.zone} c={C.sec} />}
                {c.priorite !== "normale" && (
                  <Bdg t={c.priorite?.replace("_"," ").toUpperCase() || ""} c={c.priorite === "chantier_bloque" ? C.red : C.orange} />
                )}
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                {t && <span className="mono" style={{ fontSize:12, color:C.muted }}>{hm(t.tTotal)} fab.</span>}
                {jr !== null && (
                  <span className="mono" style={{ fontSize:16, fontWeight:700, color:jc }}>
                    J{jr >= 0 ? `-${jr}` : `+${Math.abs(jr)}`}
                  </span>
                )}
                {cc?.enRetard
                  ? <Bdg t={cc.critique ? `CRITIQUE +${cc.retardJours}j` : `RETARD +${cc.retardJours}j`} c={retardColor} />
                  : cc ? <Bdg t={`OK — ${Math.abs(cc.retardJours)}j de marge`} c={C.green} /> : null
                }
              </div>
            </div>

            {/* ── Grille 4 colonnes ── */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:1, background:C.border }}>

              {/* Réception matières */}
              <div style={{ padding:12, background:C.bg }}>
                <div style={{ fontSize:9, color:C.purple, fontWeight:700, letterSpacing:"0.08em", marginBottom:8 }}>RÉCEPTION MATIÈRES</div>
                {cmd.date_alu && (
                  <div style={{ marginBottom:5 }}>
                    <div style={{ fontSize:9, color:C.sec }}>Profilés ALU</div>
                    <div className="mono" style={{ fontSize:12, fontWeight:700, color:C.cyan }}>{fmtDate(cmd.date_alu)}</div>
                  </div>
                )}
                {cmd.date_pvc && (
                  <div style={{ marginBottom:5 }}>
                    <div style={{ fontSize:9, color:C.sec }}>Profilés PVC</div>
                    <div className="mono" style={{ fontSize:12, fontWeight:700, color:C.blue }}>{fmtDate(cmd.date_pvc)}</div>
                  </div>
                )}
                {cmd.date_accessoires && (
                  <div style={{ marginBottom:5 }}>
                    <div style={{ fontSize:9, color:C.sec }}>Accessoires</div>
                    <div className="mono" style={{ fontSize:12, fontWeight:700, color:C.orange }}>{fmtDate(cmd.date_accessoires)}</div>
                  </div>
                )}
                {cmd.date_panneau_porte && (
                  <div style={{ marginBottom:5 }}>
                    <div style={{ fontSize:9, color:C.sec }}>Panneau porte</div>
                    <div className="mono" style={{ fontSize:12, fontWeight:700, color:C.yellow }}>{fmtDate(cmd.date_panneau_porte)}</div>
                  </div>
                )}
                {cmd.date_volet_roulant && (
                  <div>
                    <div style={{ fontSize:9, color:C.sec }}>Volet roulant</div>
                    <div className="mono" style={{ fontSize:12, fontWeight:700, color:C.yellow }}>{fmtDate(cmd.date_volet_roulant)}</div>
                  </div>
                )}
                {!cmd.date_alu && !cmd.date_pvc && !cmd.date_accessoires && (
                  <div style={{ fontSize:11, color:C.muted }}>Non renseigné</div>
                )}
                <div style={{ marginTop:8, paddingTop:6, borderTop:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:9, color:C.sec }}>DÉMARRAGE FAB.</div>
                  <div className="mono" style={{ fontSize:13, fontWeight:700, color:C.teal }}>{fmtDate(dateDemarrage(c))}</div>
                </div>
              </div>

              {/* Fabrication — étapes */}
              <div style={{ padding:12, background:C.bg }}>
                <div style={{ fontSize:9, color:C.blue, fontWeight:700, letterSpacing:"0.08em", marginBottom:8 }}>FABRICATION</div>
                {[
                  { etape: etapeCoupe,   c:"#42A5F5", label:"Coupe / Soudure" },
                  { etape: etapeMontage, c:"#FFA726", label:"Montage" },
                  { etape: etapeVitrage, c:"#26C6DA", label:"Vitrage" },
                  { etape: etapePalette, c:"#66BB6A", label:"Contrôle + Palette" },
                ].map(({ etape, c: ec, label }) => etape ? (
                  <div key={label} style={{ marginBottom:7 }}>
                    <div style={{ fontSize:9, color:ec, fontWeight:600 }}>{label}</div>
                    <div className="mono" style={{ fontSize:11, color:C.sec }}>
                      {fmtDate(etape.debut)} → {fmtDate(etape.fin)}
                    </div>
                    {etape.duree_min > 0 && (
                      <div style={{ fontSize:9, color:C.muted }}>{hm(etape.duree_min)}</div>
                    )}
                  </div>
                ) : null)}
                {t && (
                  <div style={{ marginTop:6, paddingTop:6, borderTop:`1px solid ${C.border}`, fontSize:10, color:C.muted }}>
                    Total : <span className="mono" style={{ color:C.orange, fontWeight:700 }}>{hm(t.tTotal)}</span>
                    <span style={{ marginLeft:8 }}>{t.profils_total} profils</span>
                  </div>
                )}
              </div>

              {/* Vitrage ISULA */}
              <div style={{ padding:12, background:C.bg }}>
                <div style={{ fontSize:9, color:C.cyan, fontWeight:700, letterSpacing:"0.08em", marginBottom:8 }}>VITRAGE ISULA</div>
                {cc?.dateCmdVitrage && (
                  <div style={{ marginBottom:8 }}>
                    <div style={{ fontSize:9, color:C.sec }}>Commander le</div>
                    <div className="mono" style={{ fontSize:13, fontWeight:700, color:C.cyan }}>{fmtDate(cc.dateCmdVitrage)}</div>
                  </div>
                )}
                {totalVitrage > 0 && (
                  <div style={{ marginBottom:6 }}>
                    <div style={{ fontSize:9, color:C.sec }}>Surface totale</div>
                    <div className="mono" style={{ fontSize:13, fontWeight:700, color:C.teal }}>{totalVitrage} m²</div>
                  </div>
                )}
                {cmd.vitrages?.length > 0 && (
                  <div>
                    {cmd.vitrages.map((v: any, i: number) => (
                      <div key={i} style={{ fontSize:10, color:C.sec, marginBottom:2 }}>
                        {v.composition} {v.surface_m2 ? `— ${v.surface_m2} m²` : ""}
                      </div>
                    ))}
                  </div>
                )}
                {!cc?.dateCmdVitrage && totalVitrage === 0 && (
                  <div style={{ fontSize:11, color:C.muted }}>—</div>
                )}
                {cmd.semaine_theorique && (
                  <div style={{ marginTop:8, paddingTop:6, borderTop:`1px solid ${C.border}` }}>
                    <div style={{ fontSize:9, color:C.sec }}>Sem. théorique</div>
                    <div style={{ fontSize:12, fontWeight:600, color:C.blue }}>{cmd.semaine_theorique}</div>
                  </div>
                )}
                {cmd.semaine_atteignable && (
                  <div style={{ marginTop:4 }}>
                    <div style={{ fontSize:9, color:C.sec }}>Sem. atteignable</div>
                    <div style={{ fontSize:12, fontWeight:600, color:C.green }}>{cmd.semaine_atteignable}</div>
                  </div>
                )}
              </div>

              {/* Livraison */}
              <div style={{ padding:12, background:C.bg }}>
                <div style={{ fontSize:9, color:retardColor, fontWeight:700, letterSpacing:"0.08em", marginBottom:8 }}>LIVRAISON</div>
                <div style={{ marginBottom:8 }}>
                  <div style={{ fontSize:9, color:C.sec }}>Souhaitée</div>
                  <div className="mono" style={{ fontSize:13, fontWeight:700, color:C.text }}>{fmtDate(c.date_livraison_souhaitee)}</div>
                </div>
                {cc && (
                  <div style={{ marginBottom:10 }}>
                    <div style={{ fontSize:9, color:C.sec }}>Au plus tôt</div>
                    <div className="mono" style={{ fontSize:13, fontWeight:700, color:retardColor }}>{fmtDate(cc.dateLivraisonAuPlusTot)}</div>
                  </div>
                )}
                {cc?.enRetard ? (
                  <div style={{ padding:"6px 8px", background:retardColor+"22", borderRadius:4, fontSize:11, color:retardColor, fontWeight:600 }}>
                    {cc.critique
                      ? `CRITIQUE — ${cc.retardJours}j de retard`
                      : `En retard de ${cc.retardJours} jour(s)`}
                  </div>
                ) : cc ? (
                  <div style={{ padding:"6px 8px", background:C.green+"22", borderRadius:4, fontSize:11, color:C.green, fontWeight:600 }}>
                    Dans les temps — {Math.abs(cc.retardJours)}j de marge
                  </div>
                ) : null}
              </div>

            </div>{/* fin grille */}
          </div>
        );
      })}
    </div>
  );
}
