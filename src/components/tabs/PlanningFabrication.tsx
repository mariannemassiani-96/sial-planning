"use client";
import { useState, useMemo, useCallback, useEffect } from "react";
import {
  C, TACHES_FABRICATION, EQUIPE, COMPETENCES_DEFAUT,
  fmtDate, CommandeCC, TYPES_MENUISERIE,
  isWorkday, JOURS_FERIES,
} from "@/lib/sial-data";
import { H, Bdg } from "@/components/ui";

// ─── Helpers date ─────────────────────────────────────────────────────────────

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

function getWeekNum(d: Date): number {
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const w1 = new Date(jan4);
  w1.setDate(jan4.getDate() - ((jan4.getDay() || 7) - 1));
  return Math.ceil((d.getTime() - w1.getTime()) / (7 * 86400000)) + 1;
}

function getWeekDays(monday: Date): Date[] {
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

const JOUR_LABELS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];

// ─── Types locaux ─────────────────────────────────────────────────────────────

type PlanCell = { commandeId: string; operateur?: string; parallel?: boolean };

type PlanSemaine = {
  [tacheId: string]: {
    [dayStr: string]: PlanCell[];
  };
};

type VueMode = "poste" | "commande";

// ─── Postes principaux pour la vue par commande ───────────────────────────────

const POSTES_VUE_COMMANDE = [
  { id: "coupe_lmt",         label: "Coupe LMT" },
  { id: "coupe_dt",          label: "Coupe DT" },
  { id: "soudure_pvc",       label: "Soudure PVC" },
  { id: "montage_dorm_coul", label: "Montage coulissant" },
  { id: "ferrage",           label: "Montage frappe" },
  { id: "vitrage_frappe",    label: "Vitrage frappe" },
  { id: "vitrage_coul",      label: "Vitrage coulissant" },
  { id: "palette",           label: "Palette" },
];

// ─── Helpers calcul résumé ────────────────────────────────────────────────────

function calcResume(commandes: CommandeCC[], planSemaine: PlanSemaine) {
  const commandeIdsInPlan = new Set<string>();
  Object.values(planSemaine).forEach(byDay =>
    Object.values(byDay).forEach(cells =>
      cells.forEach(c => commandeIdsInPlan.add(c.commandeId))
    )
  );
  let lmt = 0, dt = 0, renfort = 0, dormants = 0, vitrages = 0;
  commandes.forEach(cmd => {
    const cid = String(cmd.id ?? "");
    if (!commandeIdsInPlan.has(cid)) return;
    const tm = TYPES_MENUISERIE[cmd.type];
    if (!tm) return;
    const q = cmd.quantite || 1;
    lmt      += (tm.lmt      || 0) * q;
    dt       += (tm.dt       || 0) * q;
    renfort  += (tm.renfort  || 0) * q;
    dormants += (tm.dormant  || 0) * q;
    vitrages += (tm.ouvrants || 0) * q;
  });
  return { lmt, dt, renfort, dormants, vitrages };
}

// ─── Styles communs ───────────────────────────────────────────────────────────

const btnSm: React.CSSProperties = {
  padding: "5px 11px",
  background: C.s2,
  border: `1px solid ${C.border}`,
  borderRadius: 5,
  color: C.text,
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 600,
  whiteSpace: "nowrap",
};

function thStyle(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    border: `1px solid ${C.border}`,
    background: C.s2,
    padding: "7px 8px",
    textAlign: "center",
    fontSize: 11,
    fontWeight: 700,
    color: C.text,
    ...extra,
  };
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 10,
  color: C.sec,
  marginBottom: 4,
  marginTop: 10,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontWeight: 600,
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  background: C.s2,
  border: `1px solid ${C.border}`,
  borderRadius: 5,
  color: C.text,
  padding: "6px 10px",
  fontSize: 11,
};

// ─── Sous-composant résumé stat ───────────────────────────────────────────────

function ResumeStat({ label, value, c }: { label: string; value: number; c: string }) {
  return (
    <div style={{
      background: C.s2, border: `1px solid ${C.border}`, borderRadius: 6,
      padding: "8px 14px", textAlign: "center", minWidth: 110,
    }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: c }}>{value}</div>
      <div style={{ fontSize: 9, color: C.sec, marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function PlanningFabrication({
  commandes,
  onEdit,
}: {
  commandes: CommandeCC[];
  onEdit?: (cmd: CommandeCC) => void;
}) {
  // ── Navigation semaine
  const [monday, setMonday] = useState<Date>(() => getMondayOf(new Date()));
  const weekDays = useMemo(() => getWeekDays(monday), [monday]);
  const semaineId = useMemo(
    () => `S${getWeekNum(monday)}_${monday.getFullYear()}`,
    [monday]
  );

  // ── Vue
  const [vue, setVue] = useState<VueMode>("poste");

  // ── Plan semaine (initialisé vide, chargé dans useEffect)
  const [plan, setPlan] = useState<PlanSemaine>({});

  // ── Statut semaine validée
  const [semValidee, setSemValidee] = useState<boolean>(false);

  // ── Tâches parallèles
  const [tachesParalleles, setTachesParalleles] = useState<Set<string>>(new Set());

  // ── Modals
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showPrintMenu, setShowPrintMenu] = useState(false);

  // Champs du modal planification
  const [modalTache, setModalTache] = useState(TACHES_FABRICATION[0]?.id ?? "");
  const [modalCmd, setModalCmd] = useState("");
  const [modalJour, setModalJour] = useState("");
  const [modalOp, setModalOp] = useState("");

  // ── Vue commande : dates par poste
  const [cmdDates, setCmdDates] = useState<Record<string, Record<string, string>>>({});

  // Synchroniser plan depuis localStorage quand la semaine change
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`planning_fab_${semaineId}`);
      setPlan(raw ? JSON.parse(raw) : {});
      setSemValidee(localStorage.getItem(`planning_fab_valide_${semaineId}`) === "1");
    } catch {
      setPlan({});
    }
  }, [semaineId]);

  // Persister plan
  const savePlan = useCallback((newPlan: PlanSemaine) => {
    setPlan(newPlan);
    try {
      localStorage.setItem(`planning_fab_${semaineId}`, JSON.stringify(newPlan));
    } catch { /* ignore */ }
  }, [semaineId]);

  // ─── Navigation semaine
  const prevWeek = () => {
    const d = new Date(monday);
    d.setDate(d.getDate() - 7);
    setMonday(d);
  };
  const nextWeek = () => {
    const d = new Date(monday);
    d.setDate(d.getDate() + 7);
    setMonday(d);
  };
  const thisWeek = () => setMonday(getMondayOf(new Date()));

  // ─── Ajouter commande dans une cellule
  const addCell = useCallback(() => {
    if (!modalCmd || !modalTache || !modalJour) return;
    const newPlan = JSON.parse(JSON.stringify(plan)) as PlanSemaine;
    if (!newPlan[modalTache]) newPlan[modalTache] = {};
    if (!newPlan[modalTache][modalJour]) newPlan[modalTache][modalJour] = [];
    const exists = newPlan[modalTache][modalJour].some(c => c.commandeId === modalCmd);
    if (!exists) {
      newPlan[modalTache][modalJour].push({ commandeId: modalCmd, operateur: modalOp || undefined });
    }
    savePlan(newPlan);
    setShowPlanModal(false);
  }, [plan, modalCmd, modalTache, modalJour, modalOp, savePlan]);

  // ─── Supprimer une cellule
  const removeCell = useCallback((tacheId: string, dayStr: string, commandeId: string) => {
    const newPlan = JSON.parse(JSON.stringify(plan)) as PlanSemaine;
    if (newPlan[tacheId]?.[dayStr]) {
      newPlan[tacheId][dayStr] = newPlan[tacheId][dayStr].filter(c => c.commandeId !== commandeId);
    }
    savePlan(newPlan);
  }, [plan, savePlan]);

  // ─── Répartition automatique
  const repartitionAuto = useCallback(() => {
    const newPlan: PlanSemaine = {};
    const workDays = weekDays.filter(d => isWorkday(localStr(d)));
    const cmdIds = commandes.map(c => String(c.id ?? "")).filter(Boolean);

    TACHES_FABRICATION.forEach(tache => {
      newPlan[tache.id] = {};

      // Opérateurs compétents pour cette tâche
      const competents = EQUIPE.filter(op => {
        const comps = COMPETENCES_DEFAUT[op.id] ?? [];
        return comps.includes(tache.id) || tache.competences.includes(op.id);
      });

      // Polyvalents (ont des compétences mais pas sur cette tâche)
      const polyvalents = EQUIPE.filter(op =>
        !competents.find(c => c.id === op.id) &&
        (COMPETENCES_DEFAUT[op.id] ?? []).length > 0
      );

      const ops = [...competents, ...polyvalents];
      if (ops.length === 0 || cmdIds.length === 0 || workDays.length === 0) return;

      // Distribuer les commandes équitablement sur les jours ouvrés
      const cmdsParJour = Math.ceil(cmdIds.length / workDays.length);
      let cmdIdx = 0;
      workDays.forEach(d => {
        const ds = localStr(d);
        newPlan[tache.id][ds] = [];
        const slice = cmdIds.slice(cmdIdx, cmdIdx + cmdsParJour);
        slice.forEach((cid, i) => {
          const op = ops[i % ops.length];
          newPlan[tache.id][ds].push({ commandeId: cid, operateur: op?.id });
        });
        cmdIdx += cmdsParJour;
      });
    });

    savePlan(newPlan);
  }, [commandes, weekDays, savePlan]);

  // ─── Toggle tâche parallèle
  const toggleParallel = (tacheId: string) => {
    setTachesParalleles(prev => {
      const next = new Set(prev);
      if (next.has(tacheId)) next.delete(tacheId);
      else next.add(tacheId);
      return next;
    });
  };

  // ─── Valider la semaine
  const validerSemaine = () => {
    const newVal = !semValidee;
    setSemValidee(newVal);
    try {
      if (newVal) localStorage.setItem(`planning_fab_valide_${semaineId}`, "1");
      else localStorage.removeItem(`planning_fab_valide_${semaineId}`);
    } catch { /* ignore */ }
  };

  // ─── Résumé quantités
  const resume = useMemo(() => calcResume(commandes, plan), [commandes, plan]);

  // ─── Trouver commande par id
  const cmdById = useCallback((id: string) =>
    commandes.find(c => String(c.id ?? "") === id),
    [commandes]
  );

  // ─── Opérateur label
  const opLabel = (id?: string) => {
    if (!id) return "";
    return EQUIPE.find(e => e.id === id)?.nom ?? id;
  };

  // ─── Imprimer
  const doPrint = (_mode: "poste" | "personne" | "complet") => {
    setShowPrintMenu(false);
    const styleEl = document.createElement("style");
    styleEl.id = "__planfab_print_style__";
    styleEl.textContent = `
      @media print {
        body > *:not(#planfab-root) { display: none !important; }
        #planfab-root { display: block !important; }
        .no-print { display: none !important; }
      }
    `;
    document.head.appendChild(styleEl);
    window.print();
    setTimeout(() => {
      const el = document.getElementById("__planfab_print_style__");
      if (el) el.remove();
    }, 800);
  };

  // ─── Mise à jour date vue commande
  const setCmdDate = (cmdId: string, posteId: string, val: string) => {
    setCmdDates(prev => ({
      ...prev,
      [cmdId]: { ...(prev[cmdId] ?? {}), [posteId]: val },
    }));
  };

  // ─── Ouverture modal planifier
  const openPlanModal = () => {
    setModalTache(TACHES_FABRICATION[0]?.id ?? "");
    setModalCmd(commandes[0] ? String(commandes[0].id ?? "") : "");
    setModalJour(localStr(weekDays[0]));
    setModalOp("");
    setShowPlanModal(true);
  };

  // ─── Rendu cellule (vue poste)
  const renderCell = (tacheId: string, dayStr: string) => {
    const cells: PlanCell[] = plan[tacheId]?.[dayStr] ?? [];
    const jourFerie = JOURS_FERIES[dayStr];
    return (
      <td
        key={dayStr}
        style={{
          border: `1px solid ${C.border}`,
          verticalAlign: "top",
          padding: "4px 5px",
          background: jourFerie ? C.s1 + "cc" : "transparent",
          position: "relative",
          minWidth: 130,
        }}
      >
        {jourFerie && (
          <div style={{ fontSize: 9, color: C.orange, marginBottom: 3, fontStyle: "italic" }}>
            {jourFerie}
          </div>
        )}
        {cells.map((cell, i) => {
          const cmd = cmdById(cell.commandeId);
          if (!cmd) return null;
          const tm = TYPES_MENUISERIE[cmd.type];
          return (
            <div
              key={i}
              onDoubleClick={() => cmd && onEdit?.(cmd)}
              style={{
                background: C.s2,
                border: `1px solid ${C.bLight}`,
                borderRadius: 4,
                padding: "3px 6px",
                marginBottom: 3,
                cursor: "pointer",
                fontSize: 10,
                lineHeight: 1.4,
                position: "relative",
              }}
              title="Double-clic pour éditer"
            >
              <div style={{ color: C.blue, fontWeight: 700 }}>#{cmd.id}</div>
              <div style={{ color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 115 }}>
                {cmd.client ?? "—"}
              </div>
              <div style={{ color: C.sec, fontSize: 9 }}>
                {cmd.quantite} × {tm?.label ?? cmd.type}
              </div>
              {cell.operateur && (
                <div style={{ fontSize: 9, color: C.green }}>
                  {opLabel(cell.operateur)}
                </div>
              )}
              <button
                onClick={e => { e.stopPropagation(); removeCell(tacheId, dayStr, cell.commandeId); }}
                title="Retirer du planning"
                style={{
                  position: "absolute", top: 2, right: 3,
                  background: "none", border: "none",
                  color: C.red, cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0,
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </td>
    );
  };

  // ── Label semaine
  const semLabel = `S.${getWeekNum(monday)} — du ${weekDays[0].toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} au ${weekDays[4].toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}`;

  // ─────────────────────────────── RENDU ───────────────────────────────────────
  return (
    <div id="planfab-root" style={{ color: C.text, fontFamily: "inherit" }}>

      {/* ── Barre de navigation / actions ──────────────────────────────────── */}
      <div className="no-print" style={{
        display: "flex", alignItems: "center", gap: 8,
        flexWrap: "wrap", marginBottom: 14,
      }}>
        {/* Switch vue */}
        <div style={{
          display: "flex", background: C.s1,
          border: `1px solid ${C.border}`, borderRadius: 5, overflow: "hidden",
        }}>
          {(["poste", "commande"] as VueMode[]).map(v => (
            <button
              key={v}
              onClick={() => setVue(v)}
              style={{
                padding: "5px 14px",
                background: vue === v ? C.blue : "transparent",
                color: vue === v ? "#fff" : C.sec,
                border: "none", cursor: "pointer", fontWeight: 600, fontSize: 11,
              }}
            >
              {v === "poste" ? "Par poste" : "Par commande"}
            </button>
          ))}
        </div>

        {/* Navigation semaine */}
        <button onClick={prevWeek} style={btnSm}>← Préc.</button>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.text, minWidth: 220, textAlign: "center" }}>
          {semLabel}
        </span>
        <button onClick={nextWeek} style={btnSm}>Suiv. →</button>
        <button onClick={thisWeek} style={{ ...btnSm, color: C.cyan }}>Cette semaine</button>

        <div style={{ flex: 1 }} />

        {semValidee && <Bdg t="✓ Semaine validée" c={C.green} />}

        <button onClick={repartitionAuto} style={{ ...btnSm, color: C.yellow }}>
          ⚡ Répartition auto
        </button>

        <button
          onClick={openPlanModal}
          style={{ ...btnSm, background: C.blue + "22", color: C.blue, border: `1px solid ${C.blue}44` }}
        >
          + Planifier
        </button>

        <button
          onClick={validerSemaine}
          style={{ ...btnSm, color: semValidee ? C.orange : C.green }}
        >
          {semValidee ? "Dé-valider" : "✓ Valider semaine"}
        </button>

        {/* Dropdown Imprimer */}
        <div style={{ position: "relative" }}>
          <button onClick={() => setShowPrintMenu(p => !p)} style={btnSm}>
            Imprimer ▾
          </button>
          {showPrintMenu && (
            <div style={{
              position: "absolute", right: 0, top: "calc(100% + 4px)",
              background: C.s1, border: `1px solid ${C.border}`,
              borderRadius: 5, zIndex: 200, minWidth: 210,
              boxShadow: "0 4px 16px #000c",
            }}>
              {[
                { key: "poste",    label: "Par poste" },
                { key: "personne", label: "Par personne" },
                { key: "complet",  label: "Planning atelier complet" },
              ].map(o => (
                <button
                  key={o.key}
                  onClick={() => doPrint(o.key as "poste" | "personne" | "complet")}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "8px 14px", background: "none", border: "none",
                    color: C.text, cursor: "pointer", fontSize: 12,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.s2)}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── VUE PAR POSTE ──────────────────────────────────────────────────────── */}
      {vue === "poste" && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11 }}>
            <thead>
              <tr>
                <th style={thStyle({ width: 200, textAlign: "left" })}>Tâche</th>
                {weekDays.map((d, i) => {
                  const ds = localStr(d);
                  const ferie = JOURS_FERIES[ds];
                  return (
                    <th key={i} style={thStyle({ background: ferie ? C.s2 : C.s1, minWidth: 140 })}>
                      <div>{JOUR_LABELS[i]}</div>
                      <div style={{ fontWeight: 400, color: C.sec, fontSize: 10 }}>
                        {d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                      </div>
                      {ferie && <div style={{ fontSize: 9, color: C.orange, marginTop: 2 }}>{ferie}</div>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {TACHES_FABRICATION.map(tache => (
                <tr key={tache.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  {/* Colonne tâche */}
                  <td style={{
                    border: `1px solid ${C.border}`,
                    padding: "6px 8px",
                    background: C.s1,
                    verticalAlign: "top",
                    minWidth: 185,
                  }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, color: C.text, fontSize: 11 }}>{tache.label}</div>
                        <div style={{ fontSize: 9, color: C.sec, marginTop: 1 }}>
                          {tache.temps_unitaire} {tache.unite}
                        </div>
                        {tache.competences.length > 0 && (
                          <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>
                            {tache.competences
                              .map(id => EQUIPE.find(e => e.id === id)?.nom ?? id)
                              .join(", ")}
                          </div>
                        )}
                        {tachesParalleles.has(tache.id) && (
                          <div style={{ marginTop: 3 }}>
                            <Bdg t="∥ Parallèle" c={C.purple} sz={9} />
                          </div>
                        )}
                      </div>
                      {/* Bouton ∥ parallèle */}
                      <button
                        onClick={() => toggleParallel(tache.id)}
                        title="Marquer comme tâche parallèle (seule la plus longue compte)"
                        style={{
                          background: tachesParalleles.has(tache.id) ? C.purple + "33" : "none",
                          border: `1px solid ${tachesParalleles.has(tache.id) ? C.purple : C.border}`,
                          borderRadius: 3,
                          color: tachesParalleles.has(tache.id) ? C.purple : C.muted,
                          fontSize: 12, cursor: "pointer", padding: "1px 5px", lineHeight: 1,
                          flexShrink: 0,
                        }}
                      >
                        ∥
                      </button>
                    </div>
                  </td>
                  {weekDays.map(d => renderCell(tache.id, localStr(d)))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── VUE PAR COMMANDE ──────────────────────────────────────────────────── */}
      {vue === "commande" && (
        <div style={{ overflowX: "auto" }}>
          {commandes.length === 0 ? (
            <div style={{ color: C.sec, padding: 32, textAlign: "center", fontSize: 13 }}>
              Aucune commande chargée.
            </div>
          ) : (
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={thStyle({ width: 190, textAlign: "left" })}>Commande</th>
                  {POSTES_VUE_COMMANDE.map(p => (
                    <th key={p.id} style={thStyle({ minWidth: 120 })}>{p.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {commandes.map(cmd => {
                  const cid = String(cmd.id ?? "");
                  const tm = TYPES_MENUISERIE[cmd.type];
                  return (
                    <tr
                      key={cid}
                      onDoubleClick={() => onEdit?.(cmd)}
                      style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}
                    >
                      <td style={{
                        border: `1px solid ${C.border}`, padding: "6px 8px", background: C.s1,
                      }}>
                        <div style={{ fontWeight: 700, color: C.blue }}>#{cmd.id}</div>
                        <div style={{ color: C.text }}>{cmd.client ?? "—"}</div>
                        <div style={{ fontSize: 9, color: C.sec }}>
                          {cmd.quantite} × {tm?.label ?? cmd.type}
                        </div>
                        {cmd.date_livraison_souhaitee && (
                          <div style={{ fontSize: 9, color: C.orange }}>
                            Livr. : {fmtDate(cmd.date_livraison_souhaitee)}
                          </div>
                        )}
                        {cmd.priorite && (
                          <div style={{ marginTop: 2 }}>
                            <Bdg t={cmd.priorite} c={cmd.priorite === "URGENT" ? C.red : C.orange} sz={9} />
                          </div>
                        )}
                      </td>
                      {POSTES_VUE_COMMANDE.map(p => {
                        const val = cmdDates[cid]?.[p.id] ?? "";
                        return (
                          <td key={p.id} style={{
                            border: `1px solid ${C.border}`, padding: "4px 6px",
                            verticalAlign: "middle",
                          }}>
                            <input
                              type="date"
                              value={val}
                              onChange={e => setCmdDate(cid, p.id, e.target.value)}
                              style={{
                                background: val ? C.s2 : "transparent",
                                border: `1px solid ${val ? C.bLight : C.border}`,
                                borderRadius: 3, color: val ? C.text : C.muted,
                                fontSize: 10, padding: "2px 4px", width: "100%",
                              }}
                            />
                            {val && (
                              <div style={{ fontSize: 9, color: C.sec, marginTop: 2 }}>
                                {new Date(val).toLocaleDateString("fr-FR", {
                                  weekday: "short", day: "2-digit", month: "short",
                                })}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Résumé quantités hebdomadaires ────────────────────────────────────── */}
      <div style={{
        marginTop: 16, padding: "12px 16px",
        background: C.s1, border: `1px solid ${C.border}`, borderRadius: 7,
      }}>
        <H>Résumé semaine — {semaineId}</H>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <ResumeStat label="Passes LMT" value={resume.lmt} c={C.blue} />
          <ResumeStat label="Passes double tête" value={resume.dt} c={C.cyan} />
          <ResumeStat label="Renfort acier" value={resume.renfort} c={C.orange} />
          <ResumeStat label="Dormants à monter" value={resume.dormants} c={C.purple} />
          <ResumeStat label="Vitrages" value={resume.vitrages} c={C.green} />
        </div>
      </div>

      {/* ── Modal Planifier ────────────────────────────────────────────────────── */}
      {showPlanModal && (
        <div
          style={{
            position: "fixed", inset: 0, background: "#000b", zIndex: 9999,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowPlanModal(false); }}
        >
          <div style={{
            background: C.s1, border: `1px solid ${C.border}`, borderRadius: 10,
            padding: 24, width: 420, maxWidth: "95vw", boxShadow: "0 8px 32px #000d",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <H c={C.blue}>Planifier une commande</H>
              <button
                onClick={() => setShowPlanModal(false)}
                style={{ background: "none", border: "none", color: C.sec, cursor: "pointer", fontSize: 20, lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <label style={labelStyle}>Tâche</label>
            <select value={modalTache} onChange={e => setModalTache(e.target.value)} style={selectStyle}>
              {TACHES_FABRICATION.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>

            <label style={labelStyle}>Commande</label>
            <select value={modalCmd} onChange={e => setModalCmd(e.target.value)} style={selectStyle}>
              <option value="">— Sélectionner une commande —</option>
              {commandes.map(cmd => {
                const tm = TYPES_MENUISERIE[cmd.type];
                return (
                  <option key={String(cmd.id ?? "")} value={String(cmd.id ?? "")}>
                    #{cmd.id} · {cmd.client ?? "?"} · {cmd.quantite} × {tm?.label ?? cmd.type}
                  </option>
                );
              })}
            </select>

            <label style={labelStyle}>Jour</label>
            <select value={modalJour} onChange={e => setModalJour(e.target.value)} style={selectStyle}>
              {weekDays.map((d, i) => {
                const ds = localStr(d);
                const ferie = JOURS_FERIES[ds];
                return (
                  <option key={ds} value={ds} disabled={!!ferie}>
                    {JOUR_LABELS[i]} {d.toLocaleDateString("fr-FR")}{ferie ? ` — ${ferie}` : ""}
                  </option>
                );
              })}
            </select>

            <label style={labelStyle}>Opérateur (optionnel)</label>
            <select value={modalOp} onChange={e => setModalOp(e.target.value)} style={selectStyle}>
              <option value="">— Non assigné —</option>
              {EQUIPE.map(op => (
                <option key={op.id} value={op.id}>{op.nom} — {op.poste}</option>
              ))}
            </select>

            <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
              <button onClick={() => setShowPlanModal(false)} style={{ ...btnSm, color: C.sec }}>
                Annuler
              </button>
              <button
                onClick={addCell}
                disabled={!modalCmd || !modalTache || !modalJour}
                style={{
                  ...btnSm,
                  background: C.blue + "22", color: C.blue,
                  border: `1px solid ${C.blue}44`,
                  opacity: (!modalCmd || !modalTache || !modalJour) ? 0.45 : 1,
                  cursor: (!modalCmd || !modalTache || !modalJour) ? "not-allowed" : "pointer",
                }}
              >
                Ajouter au planning
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
