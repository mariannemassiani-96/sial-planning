"use client";
import { useMemo, useState } from "react";
import { C } from "@/lib/sial-data";
import { H, Card } from "@/components/ui";

const STATUTS_EXCLUS_DEF = ["livre", "facture"];

interface VitrageLine {
  composition: string;
  quantite: number;
  surface_m2: number;
  cmdId: string;
  client: string;
  num_commande: string;
  ref_chantier: string;
  semaine_atteignable: string;
  fournisseur: string;
}

export default function BesoinVitrages({ commandes }: { commandes: any[] }) {
  const [exclureStatuts, setExclureStatuts] = useState<string[]>(STATUTS_EXCLUS_DEF);
  const [fournisseurFilter, setFournisseurFilter] = useState(""); // "" = tous, "isula", "externe"
  const [expanded, setExpanded] = useState<string | null>(null);

  // Collecter toutes les lignes vitrages de toutes les commandes actives
  const lignes: VitrageLine[] = useMemo(() => {
    const result: VitrageLine[] = [];
    for (const cmd of commandes) {
      if (exclureStatuts.includes(cmd.statut || "en_attente")) continue;
      const vitrages: any[] = cmd.vitrages || [];
      for (const vg of vitrages) {
        if (!vg.composition) continue;
        const qte = parseInt(vg.quantite) || 1;
        const surf = parseFloat(vg.surface_m2) || 0;
        result.push({
          composition: vg.composition.trim(),
          quantite: qte,
          surface_m2: surf,
          cmdId: String(cmd.id),
          client: cmd.client || "—",
          num_commande: cmd.num_commande || "—",
          ref_chantier: cmd.ref_chantier || "",
          semaine_atteignable: cmd.semaine_atteignable || "",
          fournisseur: vg.fournisseur || "isula",
        });
      }
    }
    return result;
  }, [commandes, exclureStatuts]);

  // Filtrer par fournisseur
  const lignesFiltrees = useMemo(() => {
    if (!fournisseurFilter) return lignes;
    if (fournisseurFilter === "isula") return lignes.filter(l => l.fournisseur === "isula");
    if (fournisseurFilter === "externe") return lignes.filter(l => l.fournisseur !== "isula");
    return lignes;
  }, [lignes, fournisseurFilter]);

  // Grouper par composition
  const groupes = useMemo(() => {
    const map: Record<string, { composition: string; totalQte: number; totalSurface: number; lignes: VitrageLine[] }> = {};
    for (const l of lignesFiltrees) {
      if (!map[l.composition]) map[l.composition] = { composition: l.composition, totalQte: 0, totalSurface: 0, lignes: [] };
      map[l.composition].totalQte += l.quantite;
      map[l.composition].totalSurface = Math.round((map[l.composition].totalSurface + l.surface_m2) * 100) / 100;
      map[l.composition].lignes.push(l);
    }
    return Object.values(map).sort((a, b) => b.totalSurface - a.totalSurface);
  }, [lignesFiltrees]);

  const totalQte = groupes.reduce((s, g) => s + g.totalQte, 0);
  const totalSurf = Math.round(groupes.reduce((s, g) => s + g.totalSurface, 0) * 100) / 100;

  const STATUTS_OPTIONS = [
    { id: "en_attente", label: "En attente" },
    { id: "appro", label: "APPRO" },
    { id: "fab", label: "FAB" },
    { id: "fabrique", label: "Fabriqué" },
    { id: "livre", label: "Livré" },
    { id: "facture", label: "Facturé" },
    { id: "livraison_partielle", label: "Liv. partielle" },
    { id: "facturation_partielle", label: "Fact. partielle" },
  ];

  const toggleExclu = (id: string) => setExclureStatuts(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  return (
    <div>
      <H c={C.cyan}>Besoins vitrages — Prévisionnel</H>

      {/* Filtres */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: C.cyan, fontWeight: 700, marginBottom: 8 }}>FILTRES</div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: C.sec, marginBottom: 4 }}>Exclure les commandes avec statut :</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {STATUTS_OPTIONS.map(s => (
              <button key={s.id} onClick={() => toggleExclu(s.id)}
                style={{ padding: "2px 8px", fontSize: 10, borderRadius: 3, cursor: "pointer", fontWeight: 600,
                  border: `1px solid ${exclureStatuts.includes(s.id) ? C.red : C.border}`,
                  background: exclureStatuts.includes(s.id) ? C.red+"22" : "none",
                  color: exclureStatuts.includes(s.id) ? C.red : C.sec }}>
                {exclureStatuts.includes(s.id) ? "✕ " : ""}{s.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: C.sec }}>Fournisseur :</span>
          {[{ id: "", l: "Tous" }, { id: "isula", l: "ISULA VITRAGE" }, { id: "externe", l: "Externes (SIGMA, EMAVER…)" }].map(f => (
            <button key={f.id} onClick={() => setFournisseurFilter(f.id)}
              style={{ padding: "2px 10px", fontSize: 10, borderRadius: 3, cursor: "pointer", fontWeight: 600,
                border: `1px solid ${fournisseurFilter === f.id ? C.cyan : C.border}`,
                background: fournisseurFilter === f.id ? C.cyan+"22" : "none",
                color: fournisseurFilter === f.id ? C.cyan : C.sec }}>
              {f.l}
            </button>
          ))}
        </div>
      </Card>

      {/* Totaux globaux */}
      {groupes.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
          <Card>
            <div style={{ fontSize: 10, color: C.sec, marginBottom: 4 }}>COMPOSITIONS DISTINCTES</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: C.cyan }}>{groupes.length}</div>
          </Card>
          <Card>
            <div style={{ fontSize: 10, color: C.sec, marginBottom: 4 }}>TOTAL PIÈCES</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: C.purple }}>{totalQte}</div>
          </Card>
          <Card>
            <div style={{ fontSize: 10, color: C.sec, marginBottom: 4 }}>TOTAL SURFACE</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: C.teal }}>{totalSurf.toFixed(2)} <span style={{ fontSize: 14 }}>m²</span></div>
          </Card>
        </div>
      )}

      {groupes.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: C.sec }}>Aucun vitrage trouvé avec les filtres actuels.</div>
      )}

      {/* Table par composition */}
      {groupes.length > 0 && (
        <Card>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: C.sec, fontSize: 10, borderBottom: `1px solid ${C.border}` }}>
                <th style={{ textAlign: "left", padding: "6px 10px" }}>COMPOSITION</th>
                <th style={{ textAlign: "right", padding: "6px 10px" }}>PIÈCES</th>
                <th style={{ textAlign: "right", padding: "6px 10px" }}>SURFACE (m²)</th>
                <th style={{ textAlign: "right", padding: "6px 10px" }}>% m²</th>
                <th style={{ textAlign: "center", padding: "6px 10px" }}>COMMANDES</th>
                <th style={{ padding: "6px 10px" }}></th>
              </tr>
            </thead>
            <tbody>
              {groupes.map(g => {
                const pct = totalSurf > 0 ? Math.round(g.totalSurface / totalSurf * 100) : 0;
                const isOpen = expanded === g.composition;
                return (
                  <>
                    <tr key={g.composition} style={{ borderBottom: `1px solid ${C.border}22`, background: isOpen ? C.s2 : "none" }}>
                      <td style={{ padding: "8px 10px", fontFamily: "monospace", fontSize: 11, color: C.text, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={g.composition}>{g.composition}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: C.purple, fontSize: 13 }}>{g.totalQte}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: C.teal, fontSize: 13 }}>{g.totalSurface.toFixed(2)}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                          <div style={{ width: 60, height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: C.teal, borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 10, color: C.sec, width: 28, textAlign: "right" }}>{pct}%</span>
                        </div>
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center", fontSize: 10, color: C.sec }}>{g.lignes.length}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right" }}>
                        <button onClick={() => setExpanded(isOpen ? null : g.composition)}
                          style={{ padding: "2px 8px", background: "none", border: `1px solid ${C.border}`, borderRadius: 3, color: C.sec, cursor: "pointer", fontSize: 10 }}>
                          {isOpen ? "▲" : "▼"}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={g.composition + "_detail"}>
                        <td colSpan={6} style={{ padding: "0 10px 10px 30px", background: C.s2 }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                            <thead>
                              <tr style={{ color: C.muted }}>
                                <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: `1px solid ${C.border}` }}>Client</th>
                                <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: `1px solid ${C.border}` }}>N° commande</th>
                                <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: `1px solid ${C.border}` }}>Chantier</th>
                                <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: `1px solid ${C.border}` }}>Semaine</th>
                                <th style={{ textAlign: "right", padding: "4px 8px", borderBottom: `1px solid ${C.border}` }}>Qté</th>
                                <th style={{ textAlign: "right", padding: "4px 8px", borderBottom: `1px solid ${C.border}` }}>Surface</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.lignes.map((l, li) => (
                                <tr key={li} style={{ borderBottom: `1px solid ${C.border}22` }}>
                                  <td style={{ padding: "3px 8px", color: C.text, fontWeight: 600 }}>{l.client}</td>
                                  <td style={{ padding: "3px 8px", color: C.orange, fontFamily: "monospace" }}>{l.num_commande}</td>
                                  <td style={{ padding: "3px 8px", color: C.sec }}>{l.ref_chantier || "—"}</td>
                                  <td style={{ padding: "3px 8px", color: C.blue }}>{l.semaine_atteignable || "—"}</td>
                                  <td style={{ padding: "3px 8px", textAlign: "right", color: C.purple, fontWeight: 700 }}>{l.quantite}</td>
                                  <td style={{ padding: "3px 8px", textAlign: "right", color: C.teal, fontWeight: 700 }}>{l.surface_m2.toFixed(2)} m²</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
