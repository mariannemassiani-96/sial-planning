// ═══════════════════════════════════════════════════════════════════════
// PAGE CHAUFFEURS — vue admin pour Marianne.
//
// Liste les opérateurs ayant la compétence "LIVR" (livraison) en BDD,
// leur niveau, et permet de marquer des informations annexes
// (permis, véhicule par défaut). Stockage léger : les infos véhicule
// vont dans `Operator.notes` ou `metadata` selon ce qui existe.
// ═══════════════════════════════════════════════════════════════════════

"use client";
import { useState, useEffect } from "react";
import { C } from "@/lib/sial-data";
import { useOperators, type OperatorFromDB } from "@/lib/use-operators";
import { ZONE_DUREE_AR } from "@/lib/livraison";
import { H } from "@/components/ui";

const VEHICULES_PROPOSES = [
  "Camion 3.5T",
  "Fourgon",
  "Pick-up",
  "Voiture utilitaire",
  "—",
];

interface ChauffeurInfo {
  permis: string[];      // ex: ["B", "C"]
  vehiculePref: string;  // libre
  zonesPref: string[];   // zones préférées
}

function parseChauffeurInfo(notes: string | null | undefined): ChauffeurInfo {
  if (!notes) return { permis: [], vehiculePref: "", zonesPref: [] };
  // On stocke dans une ligne du notes au format JSON balisé : @CHAUFFEUR:{...}
  const m = notes.match(/@CHAUFFEUR:(\{[^\n]+\})/);
  if (!m) return { permis: [], vehiculePref: "", zonesPref: [] };
  try {
    const data = JSON.parse(m[1]);
    return {
      permis: Array.isArray(data.permis) ? data.permis : [],
      vehiculePref: data.vehiculePref || "",
      zonesPref: Array.isArray(data.zonesPref) ? data.zonesPref : [],
    };
  } catch { return { permis: [], vehiculePref: "", zonesPref: [] }; }
}

function serializeChauffeurInfo(notes: string | null | undefined, info: ChauffeurInfo): string {
  const cleaned = (notes || "").replace(/@CHAUFFEUR:\{[^\n]+\}\n?/g, "").trim();
  return `${cleaned}${cleaned ? "\n" : ""}@CHAUFFEUR:${JSON.stringify(info)}`;
}

export default function Chauffeurs() {
  const { operators, loaded } = useOperators();
  const [saving, setSaving] = useState<string | null>(null);
  const [localOps, setLocalOps] = useState<OperatorFromDB[]>([]);

  useEffect(() => { setLocalOps(operators); }, [operators]);

  // Chauffeurs = opérateurs avec compétence sur LIVR/CHRG/L7 ou phase logistique
  const chauffeurs = localOps.filter(op => {
    const hasLivrSkill = op.skills?.some(s => (s.workPostId === "LIVR" || s.workPostId === "L7" || s.workPostId === "CHRG") && s.level > 0);
    const hasLogPhase = op.competences?.includes("logistique");
    return hasLivrSkill || hasLogPhase;
  });

  const updateInfo = async (opId: string, info: ChauffeurInfo) => {
    setSaving(opId);
    const op = localOps.find(o => o.id === opId);
    if (!op) { setSaving(null); return; }
    const newNotes = serializeChauffeurInfo(op.notes, info);
    try {
      const res = await fetch(`/api/operators/${opId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: newNotes }),
      });
      if (res.ok) {
        setLocalOps(prev => prev.map(o => o.id === opId ? { ...o, notes: newNotes } : o));
      }
    } catch {}
    setSaving(null);
  };

  if (!loaded) return <div style={{ padding: 30, textAlign: "center", color: C.sec }}>Chargement…</div>;

  const zonesDispos = Object.keys(ZONE_DUREE_AR);

  return (
    <div>
      <H c={C.purple}>Chauffeurs & véhicules</H>
      <div style={{ fontSize: 11, color: C.sec, marginBottom: 12 }}>
        Liste les opérateurs autorisés à conduire (compétence LIVR ou logistique en BDD).
        Pour ajouter ou retirer un chauffeur, va dans <b>Équipe → Compétences</b> et coche
        le poste LIVR ou L7.
      </div>

      {chauffeurs.length === 0 ? (
        <div style={{ padding: 30, textAlign: "center", color: C.sec, background: C.s1, borderRadius: 6 }}>
          Aucun chauffeur défini. Va dans <b>Équipe → Compétences</b> et coche LIVR/L7 pour les opérateurs concernés.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {chauffeurs.map(op => {
            const info = parseChauffeurInfo(op.notes);
            const isSaving = saving === op.id;
            return (
              <div key={op.id} style={{
                background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6,
                padding: "12px 14px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>👤 {op.name}</span>
                  <span style={{ fontSize: 10, color: C.muted }}>
                    {op.weekHours}h/sem
                    {op.vendrediOff && " · vendredi off"}
                  </span>
                  {isSaving && <span style={{ fontSize: 10, color: C.orange }}>Sauvegarde…</span>}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 14px", fontSize: 11 }}>
                  {/* Permis */}
                  <span style={{ color: C.sec, fontSize: 10 }}>Permis :</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    {["B", "C", "EC", "PL"].map(p => (
                      <button key={p}
                        onClick={() => {
                          const has = info.permis.includes(p);
                          const newPermis = has ? info.permis.filter(x => x !== p) : [...info.permis, p];
                          updateInfo(op.id, { ...info, permis: newPermis });
                        }}
                        style={{
                          padding: "3px 10px", fontSize: 11, fontWeight: 700,
                          background: info.permis.includes(p) ? C.purple + "33" : C.bg,
                          border: `1px solid ${info.permis.includes(p) ? C.purple : C.border}`,
                          borderRadius: 3,
                          color: info.permis.includes(p) ? C.purple : C.muted,
                          cursor: "pointer",
                        }}>
                        {p}
                      </button>
                    ))}
                  </div>

                  {/* Véhicule préféré */}
                  <span style={{ color: C.sec, fontSize: 10 }}>Véhicule préféré :</span>
                  <select value={info.vehiculePref}
                    onChange={e => updateInfo(op.id, { ...info, vehiculePref: e.target.value })}
                    style={{ padding: "3px 8px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 3, color: C.text, fontSize: 11, width: 200 }}>
                    <option value="">—</option>
                    {VEHICULES_PROPOSES.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>

                  {/* Zones préférées */}
                  <span style={{ color: C.sec, fontSize: 10 }}>Zones :</span>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {zonesDispos.map(z => (
                      <button key={z}
                        onClick={() => {
                          const has = info.zonesPref.includes(z);
                          const newZones = has ? info.zonesPref.filter(x => x !== z) : [...info.zonesPref, z];
                          updateInfo(op.id, { ...info, zonesPref: newZones });
                        }}
                        style={{
                          padding: "2px 8px", fontSize: 10, fontWeight: 600,
                          background: info.zonesPref.includes(z) ? C.teal + "33" : C.bg,
                          border: `1px solid ${info.zonesPref.includes(z) ? C.teal : C.border}`,
                          borderRadius: 3,
                          color: info.zonesPref.includes(z) ? C.teal : C.muted,
                          cursor: "pointer",
                        }}>
                        {z}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
