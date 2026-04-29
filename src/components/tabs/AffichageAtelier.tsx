"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  C,
  EQUIPE,
  TYPES_MENUISERIE,
  EQUIPE_ANNIVERSAIRES,
  CommandeCC,
  fmtDate,
  hm,
  getWeekNum as getWeekNumUtil,
} from "@/lib/sial-data";
import { H, Bdg, Card } from "@/components/ui";

// ── Helpers date ─────────────────────────────────────────────────────────────

function localStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getMondayOf(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - day + (day === 0 ? -6 : 1));
  date.setHours(0, 0, 0, 0);
  return date;
}

function getSundayOf(d: Date): Date {
  const monday = getMondayOf(d);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday;
}

const getWeekNum = getWeekNumUtil;

function fmtJJ_MM(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtJJMMAA(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── Typage localStorage planning fab ─────────────────────────────────────────

interface PlanningPoste {
  poste: string;
  label?: string;
  objectif: number; // minutes
  realise: number;  // minutes
}

interface PlanningFabWeek {
  semaine: number;
  annee: number;
  postes: PlanningPoste[];
}

const POSTES_LABELS: Record<string, string> = {
  coupe: "Coupe / Soudure",
  coulissant: "Coulissant / Galandage",
  frappes: "Frappes / Portes",
  vitrage_ov: "Vitrage OV",
};

// ── Génération message auto ───────────────────────────────────────────────────

function genererMessage(commandes: CommandeCC[]): string {
  const enRetard = commandes.filter((c) => {
    if (!c.date_livraison_souhaitee) return false;
    const livSouhaitee = new Date(c.date_livraison_souhaitee);
    return livSouhaitee < new Date();
  }).length;
  const total = commandes.length;
  if (total === 0) return "Bonne semaine à toute l'équipe ! 👍";
  if (enRetard === 0 && total > 0)
    return `Belle semaine en vue ! ${total} commande${total > 1 ? "s" : ""} en production, objectif : 0 retard. C'est parti ! 💪`;
  if (enRetard > 0)
    return `${total} commande${total > 1 ? "s" : ""} en prod — ${enRetard} à surveiller de près. On fait de notre mieux ! 🎯`;
  return "Bonne semaine à toute l'équipe ! 👍";
}

// ── Calcul totaux semaine depuis commandes ────────────────────────────────────

function calcObjectifsSemaine(commandes: CommandeCC[]) {
  let totalPieces = 0;
  let totalM2 = 0;
  commandes.forEach((c) => {
    totalPieces += c.quantite || 0;
    const tm = TYPES_MENUISERIE[c.type];
    if (tm) {
      totalM2 += (c.quantite || 0) * 1.4;
    }
  });
  return {
    pieces: totalPieces,
    commandes: commandes.length,
    m2: Math.round(totalM2 * 10) / 10,
  };
}

// ── Anniversaires semaine en cours ────────────────────────────────────────────

interface AnniversairePerson {
  id: string;
  nom: string;
  naissance: string; // "YYYY-MM-DD"
}

function getAnniversairesSemaine(
  equipe: AnniversairePerson[],
  monday: Date,
  sunday: Date
): Array<{ nom: string; jour: string }> {
  const results: Array<{ nom: string; jour: string }> = [];
  equipe.forEach((p) => {
    if (!p.naissance) return;
    const birth = new Date(p.naissance + "T00:00:00");
    const birthThisYear = new Date(monday.getFullYear(), birth.getMonth(), birth.getDate());
    if (birthThisYear >= monday && birthThisYear <= sunday) {
      results.push({
        nom: p.nom,
        jour: fmtJJMMAA(birthThisYear),
      });
    }
  });
  return results;
}

// ── Lecture planning fab depuis localStorage ──────────────────────────────────

function lirePlanningFab(semaine: number, annee: number): PlanningFabWeek | null {
  try {
    const key = `planning_fab_${annee}_S${String(semaine).padStart(2, "0")}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as PlanningFabWeek;
  } catch {
    return null;
  }
}

// ── Indicateur couleur performance ───────────────────────────────────────────

function indicateurPerf(postes: PlanningPoste[]): { color: string; label: string } {
  const totalObj = postes.reduce((s, p) => s + p.objectif, 0);
  const totalReal = postes.reduce((s, p) => s + p.realise, 0);
  if (totalObj === 0) return { color: C.sec, label: "—" };
  const pct = Math.round((totalReal / totalObj) * 100);
  if (pct >= 90) return { color: C.green, label: `${pct}% ✓` };
  if (pct >= 70) return { color: C.orange, label: `${pct}% ~` };
  return { color: C.red, label: `${pct}% ✗` };
}

// ── Styles communs TV ─────────────────────────────────────────────────────────

const TV_ZONE: React.CSSProperties = {
  background: C.s1,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "20px 24px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  overflow: "hidden",
};

const TV_TITRE: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
  color: C.blue,
  borderBottom: `2px solid ${C.border}`,
  paddingBottom: 10,
  marginBottom: 4,
};

const TV_VALEUR: React.CSSProperties = {
  fontSize: 48,
  fontWeight: 900,
  lineHeight: 1,
};

const TV_LABEL: React.CSSProperties = {
  fontSize: 20,
  color: C.sec,
  fontWeight: 600,
};

const TV_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  padding: "8px 0",
  borderBottom: `1px solid ${C.border}`,
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

export default function AffichageAtelier({
  commandes,
  stocks: _stocks,
}: {
  commandes: CommandeCC[];
  stocks: Record<string, { actuel: number }>;
}) {
  // ── Dates semaine ─────────────────────────────────────────────────────────
  const today = new Date();
  const monday = getMondayOf(today);
  const sunday = getSundayOf(today);
  const semaine = getWeekNum(today);
  const annee = today.getFullYear();

  const mondayPrev = new Date(monday);
  mondayPrev.setDate(monday.getDate() - 7);
  const semainePrev = getWeekNum(mondayPrev);
  const anneePrev = mondayPrev.getFullYear();

  // ── State ─────────────────────────────────────────────────────────────────
  const [modeTV, setModeTV] = useState(false);
  const [message, setMessage] = useState("");
  const [anniversaires, setAnniversaires] = useState<AnniversairePerson[]>([]);
  const [planningCourant, setPlanningCourant] = useState<PlanningFabWeek | null>(null);
  const [planningPrec, setPlanningPrec] = useState<PlanningFabWeek | null>(null);
  const [editAnn, setEditAnn] = useState(false);
  const [absents, setAbsents] = useState<string[]>([]);
  const printRef = useRef<HTMLDivElement>(null);

  // ── Init anniversaires ────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem("equipe_anniversaires");
      if (stored) {
        setAnniversaires(JSON.parse(stored) as AnniversairePerson[]);
      } else {
        setAnniversaires(EQUIPE_ANNIVERSAIRES.map((p) => ({ ...p })));
      }
    } catch {
      setAnniversaires(EQUIPE_ANNIVERSAIRES.map((p) => ({ ...p })));
    }
  }, []);

  // ── Init message ──────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`message_semaine_${annee}_S${semaine}`);
      if (stored) {
        setMessage(stored);
      } else {
        setMessage(genererMessage(commandes));
      }
    } catch {
      setMessage(genererMessage(commandes));
    }
  }, [commandes, annee, semaine]);

  // ── Init absents ──────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`absents_semaine_${annee}_S${semaine}`);
      if (stored) setAbsents(JSON.parse(stored) as string[]);
    } catch {
      /* pas de données */
    }
  }, [annee, semaine]);

  // ── Chargement planning fab ───────────────────────────────────────────────
  useEffect(() => {
    setPlanningCourant(lirePlanningFab(semaine, annee));
    setPlanningPrec(lirePlanningFab(semainePrev, anneePrev));
  }, [semaine, annee, semainePrev, anneePrev]);

  // ── Sauvegarde message ────────────────────────────────────────────────────
  const sauvegarderMessage = (val: string) => {
    setMessage(val);
    try {
      localStorage.setItem(`message_semaine_${annee}_S${semaine}`, val);
    } catch {
      /* silencieux */
    }
  };

  // ── Sauvegarde anniversaires ──────────────────────────────────────────────
  const sauvegarderAnniversaires = (data: AnniversairePerson[]) => {
    setAnniversaires(data);
    try {
      localStorage.setItem("equipe_anniversaires", JSON.stringify(data));
    } catch {
      /* silencieux */
    }
  };

  // ── Toggle absent ─────────────────────────────────────────────────────────
  const toggleAbsent = (id: string) => {
    const newAbsents = absents.includes(id)
      ? absents.filter((a) => a !== id)
      : [...absents, id];
    setAbsents(newAbsents);
    try {
      localStorage.setItem(
        `absents_semaine_${annee}_S${semaine}`,
        JSON.stringify(newAbsents)
      );
    } catch {
      /* silencieux */
    }
  };

  // ── Calculs mémoïsés ──────────────────────────────────────────────────────
  const objectifs = useMemo(() => calcObjectifsSemaine(commandes), [commandes]);
  const annSemaine = useMemo(
    () => getAnniversairesSemaine(anniversaires, monday, sunday),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anniversaires, localStr(monday), localStr(sunday)]
  );
  const presents = EQUIPE.filter((e) => !absents.includes(e.id));
  const absentsNoms = EQUIPE.filter((e) => absents.includes(e.id));
  const perfPrec = planningPrec ? indicateurPerf(planningPrec.postes) : null;

  // ── Quitter mode TV avec Echap ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && modeTV) setModeTV(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modeTV]);

  // ── Impression ────────────────────────────────────────────────────────────
  const handleImprimer = () => {
    window.print();
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDU MODE TV
  // ═══════════════════════════════════════════════════════════════════════════

  if (modeTV) {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: C.bg,
          color: C.text,
          fontFamily: "'Segoe UI', system-ui, sans-serif",
          display: "flex",
          flexDirection: "column",
          zIndex: 9999,
          overflow: "hidden",
        }}
      >
        {/* Barre de titre TV */}
        <div
          style={{
            background: C.s2,
            borderBottom: `2px solid ${C.border}`,
            padding: "10px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "0.12em", color: C.blue }}>
            SIAL + ISULA — ATELIER
          </div>
          <div style={{ fontSize: 18, color: C.sec, fontWeight: 700 }}>
            SEMAINE S.{String(semaine).padStart(2, "0")} — {fmtJJMMAA(monday)}/{annee}
          </div>
          <button
            onClick={() => setModeTV(false)}
            style={{
              background: C.s1,
              border: `1px solid ${C.border}`,
              color: C.sec,
              borderRadius: 6,
              padding: "6px 14px",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            ✕ Quitter [Echap]
          </button>
        </div>

        {/* Corps TV : 3 colonnes */}
        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 12,
            padding: 12,
            minHeight: 0,
          }}
        >
          {/* ─── Zone 1 : Planning semaine en cours (gauche) ─────────────── */}
          <div style={{ ...TV_ZONE }}>
            <div style={TV_TITRE}>
              Planning S.{String(semaine).padStart(2, "0")}
              <span
                style={{
                  fontSize: 16,
                  color: C.sec,
                  marginLeft: 10,
                  fontWeight: 600,
                  textTransform: "none",
                }}
              >
                {fmtJJMMAA(monday)} → {fmtJJMMAA(sunday)}
              </span>
            </div>

            {planningCourant ? (
              <div style={{ flex: 1, overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "8px 4px",
                          fontSize: 17,
                          color: C.sec,
                          fontWeight: 700,
                        }}
                      >
                        Poste
                      </th>
                      <th
                        style={{
                          textAlign: "right",
                          padding: "8px 4px",
                          fontSize: 17,
                          color: C.sec,
                          fontWeight: 700,
                        }}
                      >
                        Objectif
                      </th>
                      <th
                        style={{
                          textAlign: "right",
                          padding: "8px 4px",
                          fontSize: 17,
                          color: C.sec,
                          fontWeight: 700,
                        }}
                      >
                        Réalisé
                      </th>
                      <th
                        style={{
                          textAlign: "right",
                          padding: "8px 4px",
                          fontSize: 17,
                          color: C.sec,
                          fontWeight: 700,
                        }}
                      >
                        %
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {planningCourant.postes.map((p) => {
                      const pct =
                        p.objectif > 0
                          ? Math.round((p.realise / p.objectif) * 100)
                          : 0;
                      const col =
                        pct >= 90 ? C.green : pct >= 70 ? C.orange : C.red;
                      return (
                        <tr
                          key={p.poste}
                          style={{ borderBottom: `1px solid ${C.border}` }}
                        >
                          <td
                            style={{
                              padding: "10px 4px",
                              fontSize: 20,
                              fontWeight: 700,
                              color: C.text,
                            }}
                          >
                            {p.label || POSTES_LABELS[p.poste] || p.poste}
                          </td>
                          <td
                            style={{
                              textAlign: "right",
                              padding: "10px 4px",
                              fontSize: 20,
                              color: C.sec,
                            }}
                          >
                            {hm(p.objectif)}
                          </td>
                          <td
                            style={{
                              textAlign: "right",
                              padding: "10px 4px",
                              fontSize: 20,
                              color: C.text,
                              fontWeight: 700,
                            }}
                          >
                            {hm(p.realise)}
                          </td>
                          <td style={{ textAlign: "right", padding: "10px 4px" }}>
                            <span
                              style={{
                                fontSize: 22,
                                fontWeight: 900,
                                color: col,
                              }}
                            >
                              {pct}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Barre de progression globale */}
                {(() => {
                  const totalObj = planningCourant.postes.reduce(
                    (s, p) => s + p.objectif,
                    0
                  );
                  const totalReal = planningCourant.postes.reduce(
                    (s, p) => s + p.realise,
                    0
                  );
                  const pctGlobal =
                    totalObj > 0
                      ? Math.round((totalReal / totalObj) * 100)
                      : 0;
                  const colGlobal =
                    pctGlobal >= 90
                      ? C.green
                      : pctGlobal >= 70
                      ? C.orange
                      : C.red;
                  return (
                    <div style={{ marginTop: 16 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 6,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 18,
                            color: C.sec,
                            fontWeight: 600,
                          }}
                        >
                          TOTAL
                        </span>
                        <span
                          style={{
                            fontSize: 24,
                            fontWeight: 900,
                            color: colGlobal,
                          }}
                        >
                          {pctGlobal}%
                        </span>
                      </div>
                      <div
                        style={{
                          height: 14,
                          background: C.border,
                          borderRadius: 7,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(100, pctGlobal)}%`,
                            height: "100%",
                            background: colGlobal,
                            borderRadius: 7,
                            transition: "width 0.5s",
                          }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div style={{ textAlign: "center", color: C.muted }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>
                    Aucune donnée planning
                  </div>
                  <div style={{ fontSize: 16, marginTop: 8 }}>
                    Renseignez le planning depuis l&apos;onglet Planning
                    Fabrication
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ─── Colonne centrale : objectifs + semaine précédente ─────────── */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              minHeight: 0,
            }}
          >
            {/* Zone 2 : Objectifs semaine */}
            <div style={{ ...TV_ZONE, flex: 1 }}>
              <div style={TV_TITRE}>Objectif semaine</div>
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: 20,
                }}
              >
                <div style={{ ...TV_ROW }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ ...TV_VALEUR, color: C.blue }}>
                      {objectifs.pieces}
                    </div>
                    <div style={TV_LABEL}>pièces à produire</div>
                  </div>
                </div>
                <div style={{ ...TV_ROW }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ ...TV_VALEUR, color: C.orange }}>
                      {objectifs.commandes}
                    </div>
                    <div style={TV_LABEL}>
                      commande{objectifs.commandes > 1 ? "s" : ""} en
                      production
                    </div>
                  </div>
                </div>
                <div style={{ ...TV_ROW, borderBottom: "none" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ ...TV_VALEUR, color: C.cyan }}>
                      {objectifs.m2}
                    </div>
                    <div style={TV_LABEL}>m² de vitrages (estimé)</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Zone 3 : Semaine précédente */}
            <div style={{ ...TV_ZONE, flex: 1 }}>
              <div style={TV_TITRE}>
                Semaine précédente
                <span
                  style={{
                    fontSize: 14,
                    color: C.sec,
                    marginLeft: 10,
                    fontWeight: 600,
                    textTransform: "none",
                  }}
                >
                  S.{String(semainePrev).padStart(2, "0")}
                </span>
              </div>
              {planningPrec && planningPrec.postes.length > 0 ? (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    gap: 12,
                  }}
                >
                  {/* Indicateur global */}
                  {(() => {
                    const perf = indicateurPerf(planningPrec.postes);
                    return (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "16px 0",
                        }}
                      >
                        <div
                          style={{
                            background: perf.color + "22",
                            border: `3px solid ${perf.color}`,
                            borderRadius: 12,
                            padding: "12px 32px",
                            textAlign: "center",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 48,
                              fontWeight: 900,
                              color: perf.color,
                            }}
                          >
                            {perf.label}
                          </div>
                          <div
                            style={{
                              fontSize: 18,
                              color: C.sec,
                              marginTop: 4,
                              fontWeight: 600,
                            }}
                          >
                            Performance globale
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Détail par poste compact */}
                  {planningPrec.postes.map((p) => {
                    const pct =
                      p.objectif > 0
                        ? Math.round((p.realise / p.objectif) * 100)
                        : 0;
                    const col =
                      pct >= 90 ? C.green : pct >= 70 ? C.orange : C.red;
                    return (
                      <div
                        key={p.poste}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 16,
                            color: C.sec,
                            minWidth: 140,
                            fontWeight: 600,
                          }}
                        >
                          {p.label || POSTES_LABELS[p.poste] || p.poste}
                        </span>
                        <div
                          style={{
                            flex: 1,
                            height: 10,
                            background: C.border,
                            borderRadius: 5,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(100, pct)}%`,
                              height: "100%",
                              background: col,
                              borderRadius: 5,
                            }}
                          />
                        </div>
                        <span
                          style={{
                            fontSize: 18,
                            fontWeight: 800,
                            color: col,
                            minWidth: 50,
                            textAlign: "right",
                          }}
                        >
                          {pct}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: C.muted,
                    fontSize: 24,
                    fontWeight: 700,
                  }}
                >
                  —
                </div>
              )}
            </div>
          </div>

          {/* ─── Zone 4 : Équipe + message + anniversaires (droite) ──────── */}
          <div style={{ ...TV_ZONE }}>
            <div style={TV_TITRE}>Équipe &amp; Infos</div>

            {/* Message de la semaine */}
            <div
              style={{
                background: C.s2,
                border: `1px solid ${C.bLight}`,
                borderRadius: 8,
                padding: "14px 18px",
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: C.blue,
                  marginBottom: 8,
                  letterSpacing: "0.08em",
                }}
              >
                MESSAGE DE LA SEMAINE
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: C.text,
                  lineHeight: 1.4,
                }}
              >
                {message || "Bonne semaine à toute l'équipe ! 👍"}
              </div>
            </div>

            {/* Anniversaires */}
            {annSemaine.length > 0 && (
              <div
                style={{
                  background: "#FFCA2822",
                  border: `1px solid ${C.yellow}44`,
                  borderRadius: 8,
                  padding: "12px 16px",
                }}
              >
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: C.yellow,
                    marginBottom: 10,
                    letterSpacing: "0.06em",
                  }}
                >
                  🎂 ANNIVERSAIRE{annSemaine.length > 1 ? "S" : ""} DE LA
                  SEMAINE
                </div>
                {annSemaine.map((a) => (
                  <div
                    key={a.nom}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 0",
                      borderBottom: `1px solid ${C.border}`,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 26,
                        fontWeight: 800,
                        color: C.text,
                      }}
                    >
                      🎉 {a.nom}
                    </span>
                    <span
                      style={{
                        fontSize: 20,
                        color: C.yellow,
                        fontWeight: 700,
                      }}
                    >
                      {a.jour}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Équipe présente / absente */}
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: C.green,
                  marginBottom: 8,
                  letterSpacing: "0.06em",
                }}
              >
                PRÉSENTS ({presents.length})
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  marginBottom: 14,
                }}
              >
                {presents.map((e) => (
                  <div
                    key={e.id}
                    style={{
                      background: C.green + "22",
                      border: `1px solid ${C.green}44`,
                      borderRadius: 6,
                      padding: "5px 12px",
                      fontSize: 20,
                      fontWeight: 700,
                      color: C.text,
                    }}
                  >
                    {e.nom}
                  </div>
                ))}
              </div>

              {absentsNoms.length > 0 && (
                <>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: C.red,
                      marginBottom: 8,
                      letterSpacing: "0.06em",
                    }}
                  >
                    ABSENTS ({absentsNoms.length})
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {absentsNoms.map((e) => (
                      <div
                        key={e.id}
                        style={{
                          background: C.red + "22",
                          border: `1px solid ${C.red}44`,
                          borderRadius: 6,
                          padding: "5px 12px",
                          fontSize: 20,
                          fontWeight: 700,
                          color: C.red,
                          textDecoration: "line-through",
                        }}
                      >
                        {e.nom}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDU MODE NORMAL (éditeur)
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div
      style={{
        color: C.text,
        fontFamily: "'Segoe UI', system-ui, sans-serif",
      }}
    >
      {/* ─── En-tête avec boutons ──────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <H c={C.blue}>Affichage Atelier</H>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => setModeTV(true)}
            style={{
              background: C.blue + "22",
              border: `1px solid ${C.blue}`,
              color: C.blue,
              borderRadius: 7,
              padding: "9px 18px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: "0.04em",
            }}
          >
            📺 Mode TV
          </button>
          <button
            onClick={handleImprimer}
            style={{
              background: C.orange + "22",
              border: `1px solid ${C.orange}`,
              color: C.orange,
              borderRadius: 7,
              padding: "9px 18px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: "0.04em",
            }}
          >
            🖨️ Imprimer A4
          </button>
        </div>
      </div>

      {/* ─── Bandeau infos semaine ─────────────────────────────────────────── */}
      <div
        style={{
          background: C.s1,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: "12px 18px",
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        <div>
          <span
            style={{
              fontSize: 11,
              color: C.sec,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Semaine courante
          </span>
          <div style={{ fontSize: 22, fontWeight: 900, color: C.text }}>
            S.{String(semaine).padStart(2, "0")} — {fmtJJMMAA(monday)} au{" "}
            {fmtJJMMAA(sunday)} {annee}
          </div>
        </div>
        <div style={{ height: 40, width: 1, background: C.border }} />
        <div>
          <span
            style={{
              fontSize: 11,
              color: C.sec,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Commandes en prod
          </span>
          <div style={{ fontSize: 22, fontWeight: 900, color: C.orange }}>
            {objectifs.commandes}
          </div>
        </div>
        <div style={{ height: 40, width: 1, background: C.border }} />
        <div>
          <span
            style={{
              fontSize: 11,
              color: C.sec,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Total pièces
          </span>
          <div style={{ fontSize: 22, fontWeight: 900, color: C.blue }}>
            {objectifs.pieces}
          </div>
        </div>
        <div style={{ height: 40, width: 1, background: C.border }} />
        <div>
          <span
            style={{
              fontSize: 11,
              color: C.sec,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Planning fab chargé
          </span>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: planningCourant ? C.green : C.muted,
            }}
          >
            {planningCourant
              ? `${planningCourant.postes.length} postes`
              : "Aucune donnée"}
          </div>
        </div>
      </div>

      {/* ─── Grille principale : message + présence ───────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
          marginBottom: 20,
        }}
      >
        {/* Message de la semaine */}
        <Card>
          <H c={C.blue}>Message de la semaine</H>
          <div style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: C.sec, fontWeight: 600 }}>
              Affiché en grand sur le mode TV — modifiable ici
            </span>
          </div>
          <textarea
            value={message}
            onChange={(e) => sauvegarderMessage(e.target.value)}
            rows={4}
            style={{
              width: "100%",
              background: C.s2,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: "10px 12px",
              color: C.text,
              fontSize: 14,
              fontFamily: "inherit",
              resize: "vertical",
              outline: "none",
              lineHeight: 1.5,
              boxSizing: "border-box",
            }}
            placeholder="Entrez votre message pour l'équipe..."
          />
          <button
            onClick={() => sauvegarderMessage(genererMessage(commandes))}
            style={{
              marginTop: 8,
              background: "transparent",
              border: `1px solid ${C.border}`,
              color: C.sec,
              borderRadius: 5,
              padding: "5px 12px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            🔄 Régénérer automatiquement
          </button>
        </Card>

        {/* Gestion présence équipe */}
        <Card>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14,
            }}
          >
            <H c={C.green}>
              Présence équipe S.{String(semaine).padStart(2, "0")}
            </H>
            <Bdg
              t={`${presents.length}/${EQUIPE.length} présents`}
              c={C.green}
            />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {EQUIPE.map((e) => {
              const isAbsent = absents.includes(e.id);
              return (
                <button
                  key={e.id}
                  onClick={() => toggleAbsent(e.id)}
                  style={{
                    background: isAbsent ? C.red + "22" : C.green + "22",
                    border: `1px solid ${isAbsent ? C.red : C.green}55`,
                    color: isAbsent ? C.red : C.green,
                    borderRadius: 6,
                    padding: "6px 12px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    textDecoration: isAbsent ? "line-through" : "none",
                    transition: "all 0.15s",
                  }}
                  title={isAbsent ? "Marquer présent" : "Marquer absent"}
                >
                  {isAbsent ? "✗" : "✓"} {e.nom}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: C.muted }}>
            Cliquez sur un nom pour basculer présent / absent
          </div>
        </Card>
      </div>

      {/* ─── Gestion anniversaires ─────────────────────────────────────────── */}
      <Card style={{ marginBottom: 20 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <H c={C.yellow}>Anniversaires équipe</H>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {annSemaine.length > 0 && (
              <Bdg
                t={`🎂 ${annSemaine.map((a) => a.nom).join(", ")} cette semaine !`}
                c={C.yellow}
              />
            )}
            <button
              onClick={() => setEditAnn(!editAnn)}
              style={{
                background: C.yellow + "22",
                border: `1px solid ${C.yellow}55`,
                color: C.yellow,
                borderRadius: 5,
                padding: "5px 12px",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {editAnn ? "✓ Fermer" : "✏️ Éditer"}
            </button>
          </div>
        </div>

        {editAnn ? (
          <div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 10,
              }}
            >
              {anniversaires.map((p, idx) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: C.s2,
                    border: `1px solid ${C.border}`,
                    borderRadius: 6,
                    padding: "8px 12px",
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: C.text,
                      minWidth: 100,
                    }}
                  >
                    {p.nom}
                  </span>
                  <input
                    type="date"
                    value={p.naissance}
                    onChange={(e) => {
                      const newData = anniversaires.map((a, i) =>
                        i === idx ? { ...a, naissance: e.target.value } : a
                      );
                      sauvegarderAnniversaires(newData);
                    }}
                    style={{
                      flex: 1,
                      background: C.bg,
                      border: `1px solid ${C.border}`,
                      borderRadius: 4,
                      color: C.text,
                      padding: "4px 8px",
                      fontSize: 12,
                      fontFamily: "inherit",
                      outline: "none",
                    }}
                  />
                  {p.naissance && (
                    <span style={{ fontSize: 11, color: C.sec }}>
                      {new Date().getMonth() + 1 ===
                      new Date(p.naissance + "T00:00:00").getMonth() + 1
                        ? "🎂"
                        : ""}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: C.muted }}>
              Données stockées localement dans le navigateur
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {anniversaires.map((p) => {
              const hasDate = !!p.naissance;
              const isCeSemaine = annSemaine.some((a) => a.nom === p.nom);
              return (
                <div
                  key={p.id}
                  style={{
                    background: isCeSemaine ? C.yellow + "22" : C.s2,
                    border: `1px solid ${isCeSemaine ? C.yellow : C.border}`,
                    borderRadius: 6,
                    padding: "5px 12px",
                    fontSize: 12,
                    fontWeight: isCeSemaine ? 800 : 600,
                    color: isCeSemaine ? C.yellow : hasDate ? C.text : C.muted,
                  }}
                >
                  {isCeSemaine ? "🎂 " : ""}
                  {p.nom}
                  {hasDate && (
                    <span
                      style={{
                        fontSize: 10,
                        color: C.sec,
                        marginLeft: 6,
                      }}
                    >
                      {fmtJJ_MM(p.naissance)}
                    </span>
                  )}
                  {!hasDate && (
                    <span
                      style={{ fontSize: 10, color: C.muted, marginLeft: 6 }}
                    >
                      —
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ─── Aperçu planning semaines (courant + précédent) ───────────────── */}
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}
      >
        <Card>
          <H c={C.orange}>
            Planning S.{String(semaine).padStart(2, "0")} (courant)
          </H>
          {planningCourant ? (
            <PlanningTable postes={planningCourant.postes} />
          ) : (
            <div
              style={{
                textAlign: "center",
                padding: 24,
                color: C.muted,
                fontSize: 13,
              }}
            >
              Aucune donnée — renseignez le planning depuis l&apos;onglet
              Planning Fabrication
            </div>
          )}
        </Card>

        <Card>
          <H c={C.purple}>
            Semaine précédente S.{String(semainePrev).padStart(2, "0")}
            {perfPrec && (
              <span style={{ marginLeft: 10, color: perfPrec.color, fontSize: 13 }}>
                {perfPrec.label}
              </span>
            )}
          </H>
          {planningPrec ? (
            <PlanningTable postes={planningPrec.postes} />
          ) : (
            <div
              style={{
                textAlign: "center",
                padding: 24,
                color: C.muted,
                fontSize: 13,
              }}
            >
              Aucune donnée pour S.{String(semainePrev).padStart(2, "0")}
            </div>
          )}
        </Card>
      </div>

      {/* ─── Zone impression (visible uniquement via @media print) ────────── */}
      <div ref={printRef}>
        <PrintView
          semaine={semaine}
          annee={annee}
          monday={monday}
          sunday={sunday}
          commandes={commandes}
          planningCourant={planningCourant}
          message={message}
          annSemaine={annSemaine}
          objectifs={objectifs}
        />
      </div>

      {/* ─── Styles globaux @media print ──────────────────────────────────── */}
      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 12mm 14mm;
          }
          body > * {
            display: none !important;
          }
          .affichage-atelier-print {
            display: block !important;
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            background: white !important;
            color: #111 !important;
          }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOUS-COMPOSANT : Tableau planning compact (réutilisé mode normal)
// ═══════════════════════════════════════════════════════════════════════════════

function PlanningTable({ postes }: { postes: PlanningPoste[] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ borderBottom: `1px solid ${C.border}` }}>
          <th
            style={{
              textAlign: "left",
              padding: "6px 4px",
              fontSize: 11,
              color: C.sec,
              fontWeight: 700,
            }}
          >
            Poste
          </th>
          <th
            style={{
              textAlign: "right",
              padding: "6px 4px",
              fontSize: 11,
              color: C.sec,
              fontWeight: 700,
            }}
          >
            Objectif
          </th>
          <th
            style={{
              textAlign: "right",
              padding: "6px 4px",
              fontSize: 11,
              color: C.sec,
              fontWeight: 700,
            }}
          >
            Réalisé
          </th>
          <th
            style={{
              textAlign: "right",
              padding: "6px 4px",
              fontSize: 11,
              color: C.sec,
              fontWeight: 700,
            }}
          >
            %
          </th>
        </tr>
      </thead>
      <tbody>
        {postes.map((p) => {
          const pct =
            p.objectif > 0 ? Math.round((p.realise / p.objectif) * 100) : 0;
          const col = pct >= 90 ? C.green : pct >= 70 ? C.orange : C.red;
          return (
            <tr key={p.poste} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td
                style={{
                  padding: "7px 4px",
                  fontSize: 12,
                  color: C.text,
                  fontWeight: 600,
                }}
              >
                {p.label || POSTES_LABELS[p.poste] || p.poste}
              </td>
              <td
                style={{
                  textAlign: "right",
                  padding: "7px 4px",
                  fontSize: 12,
                  color: C.sec,
                }}
              >
                {hm(p.objectif)}
              </td>
              <td
                style={{
                  textAlign: "right",
                  padding: "7px 4px",
                  fontSize: 12,
                  color: C.text,
                  fontWeight: 700,
                }}
              >
                {hm(p.realise)}
              </td>
              <td style={{ textAlign: "right", padding: "7px 4px" }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: col }}>
                  {pct}%
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOUS-COMPOSANT : Vue impression A4
// ═══════════════════════════════════════════════════════════════════════════════

function PrintView({
  semaine,
  annee,
  monday,
  sunday,
  commandes,
  planningCourant,
  message,
  annSemaine,
  objectifs,
}: {
  semaine: number;
  annee: number;
  monday: Date;
  sunday: Date;
  commandes: CommandeCC[];
  planningCourant: PlanningFabWeek | null;
  message: string;
  annSemaine: Array<{ nom: string; jour: string }>;
  objectifs: { pieces: number; commandes: number; m2: number };
}) {
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(
      d.getMonth() + 1
    ).padStart(2, "0")}`;

  return (
    <div
      className="affichage-atelier-print"
      style={{
        display: "none",
        padding: 0,
        background: "white",
        color: "#111",
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        fontSize: 11,
      }}
    >
      {/* En-tête impression */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "2px solid #333",
          paddingBottom: 10,
          marginBottom: 16,
        }}
      >
        <div>
          <div
            style={{ fontSize: 20, fontWeight: 900, letterSpacing: "0.06em" }}
          >
            SIAL + ISULA
          </div>
          <div style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>
            Planning Atelier
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>
            SEMAINE S.{String(semaine).padStart(2, "0")} — {annee}
          </div>
          <div style={{ fontSize: 12, color: "#555" }}>
            Du {fmt(monday)} au {fmt(sunday)}
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: 11, color: "#555" }}>
          <div>
            Imprimé le {new Date().toLocaleDateString("fr-FR")}
          </div>
          <div>
            {objectifs.commandes} commandes · {objectifs.pieces} pièces
          </div>
        </div>
      </div>

      {/* Planning fab */}
      {planningCourant && (
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 8,
              borderBottom: "1px solid #ccc",
              paddingBottom: 4,
            }}
          >
            Planning de fabrication — Semaine S.{String(semaine).padStart(2, "0")}
          </div>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}
          >
            <thead>
              <tr style={{ background: "#f0f0f0" }}>
                {["Poste", "Objectif", "Réalisé", "%", "Progression"].map(
                  (h, i) => (
                    <th
                      key={h}
                      style={{
                        textAlign: i === 0 ? "left" : "right",
                        padding: "5px 8px",
                        border: "1px solid #ccc",
                        ...(h === "Progression" ? { textAlign: "left" } : {}),
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {planningCourant.postes.map((p) => {
                const pct =
                  p.objectif > 0
                    ? Math.round((p.realise / p.objectif) * 100)
                    : 0;
                const col =
                  pct >= 90 ? "#2e7d32" : pct >= 70 ? "#e65100" : "#c62828";
                return (
                  <tr key={p.poste}>
                    <td
                      style={{
                        padding: "5px 8px",
                        border: "1px solid #ddd",
                        fontWeight: 700,
                      }}
                    >
                      {p.label || POSTES_LABELS[p.poste] || p.poste}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        padding: "5px 8px",
                        border: "1px solid #ddd",
                      }}
                    >
                      {hm(p.objectif)}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        padding: "5px 8px",
                        border: "1px solid #ddd",
                        fontWeight: 700,
                      }}
                    >
                      {hm(p.realise)}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        padding: "5px 8px",
                        border: "1px solid #ddd",
                        fontWeight: 800,
                        color: col,
                      }}
                    >
                      {pct}%
                    </td>
                    <td
                      style={{ padding: "5px 8px", border: "1px solid #ddd" }}
                    >
                      <div
                        style={{
                          height: 10,
                          background: "#e0e0e0",
                          borderRadius: 5,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(100, pct)}%`,
                            height: "100%",
                            background: col,
                            borderRadius: 5,
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Commandes en production */}
      {commandes.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 8,
              borderBottom: "1px solid #ccc",
              paddingBottom: 4,
            }}
          >
            Commandes en production ({commandes.length})
          </div>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}
          >
            <thead>
              <tr style={{ background: "#f0f0f0" }}>
                {["Client", "Type", "Qté", "Livraison souhaitée", "Priorité"].map(
                  (h, i) => (
                    <th
                      key={h}
                      style={{
                        textAlign: i === 2 ? "right" : "left",
                        padding: "4px 6px",
                        border: "1px solid #ccc",
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {commandes.map((c, i) => (
                <tr
                  key={i}
                  style={{ background: i % 2 === 0 ? "white" : "#fafafa" }}
                >
                  <td
                    style={{
                      padding: "4px 6px",
                      border: "1px solid #ddd",
                      fontWeight: 600,
                    }}
                  >
                    {c.client || "—"}
                  </td>
                  <td style={{ padding: "4px 6px", border: "1px solid #ddd" }}>
                    {TYPES_MENUISERIE[c.type]?.label || c.type}
                  </td>
                  <td
                    style={{
                      textAlign: "right",
                      padding: "4px 6px",
                      border: "1px solid #ddd",
                    }}
                  >
                    {c.quantite}
                  </td>
                  <td style={{ padding: "4px 6px", border: "1px solid #ddd" }}>
                    {c.date_livraison_souhaitee
                      ? fmtDate(c.date_livraison_souhaitee)
                      : "—"}
                  </td>
                  <td style={{ padding: "4px 6px", border: "1px solid #ddd" }}>
                    {c.priorite || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Message + anniversaires */}
      <div style={{ display: "flex", gap: 20 }}>
        {message && (
          <div
            style={{
              flex: 2,
              border: "1px solid #ccc",
              borderRadius: 6,
              padding: "10px 14px",
              background: "#f9f9f9",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                marginBottom: 6,
                color: "#555",
              }}
            >
              Message de la semaine
            </div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{message}</div>
          </div>
        )}
        {annSemaine.length > 0 && (
          <div
            style={{
              flex: 1,
              border: "1px solid #ccc",
              borderRadius: 6,
              padding: "10px 14px",
              background: "#fffde7",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                marginBottom: 6,
                color: "#555",
              }}
            >
              Anniversaires
            </div>
            {annSemaine.map((a) => (
              <div key={a.nom} style={{ fontSize: 13, fontWeight: 700 }}>
                🎂 {a.nom} — {a.jour}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Styles d'activation print */}
      <style>{`
        @media print {
          .affichage-atelier-print {
            display: block !important;
          }
        }
      `}</style>
    </div>
  );
}
