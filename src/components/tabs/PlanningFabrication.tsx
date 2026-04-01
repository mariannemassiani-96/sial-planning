"use client";
import { useState, useMemo, useCallback, useEffect } from "react";
import {
  C, T, TACHES_FABRICATION, EQUIPE, COMPETENCES_DEFAUT,
  fmtDate, CommandeCC, TYPES_MENUISERIE,
  isWorkday, JOURS_FERIES, dateDemarrage, addWorkdays,
} from "@/lib/sial-data";
import { H, Bdg } from "@/components/ui";
import PlanningCalendrier from "@/components/tabs/PlanningCalendrier";

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

// ─── Calcul des tâches nécessaires par commande ───────────────────────────────

function calcTachesCmd(cmd: CommandeCC): Array<{ tacheId: string; dureeMin: number }> {
  const tm = TYPES_MENUISERIE[cmd.type];
  if (!tm) return [];
  const q = cmd.quantite || 1;
  const { famille, mat, lmt, dt, renfort, ouvrants, dormant } = tm;
  const isPVC = mat === "PVC";
  const isCoul = famille === "coulissant";
  const isGland = famille === "glandage";
  const isFrappe = famille === "frappe" || famille === "porte";
  const tasks: Array<{ tacheId: string; dureeMin: number }> = [];

  // 1. Déballage / prépa profilés — poste 2 personnes minimum en simultané → temps mur ÷ 2
  if ((lmt || 0) * q > 0)
    tasks.push({ tacheId: "deballage_prep", dureeMin: Math.max(10, Math.round((lmt || 0) * q * 3 / 2)) });

  // 2. Coupe LMT — poste 2 personnes minimum en simultané → temps mur ÷ 2
  if ((lmt || 0) > 0)
    tasks.push({ tacheId: "coupe_lmt", dureeMin: Math.max(5, Math.round((lmt || 0) * q * T.coupe_profil / 2)) });

  // 3. Coupe double tête
  if ((dt || 0) > 0)
    tasks.push({ tacheId: "coupe_dt", dureeMin: Math.max(5, Math.round((dt || 0) * q * 1.5)) });

  // 4. Coupe renfort acier
  if ((renfort || 0) > 0)
    tasks.push({ tacheId: "coupe_renfort", dureeMin: Math.max(5, Math.round((renfort || 0) * q * 2)) });

  // 5. Soudure PVC ou assemblage ALU
  if (isPVC && isFrappe)
    tasks.push({ tacheId: "soudure_pvc", dureeMin: Math.round((1 + ouvrants) * q * T.soudure_cadre) });
  else if (!isPVC && isFrappe) {
    tasks.push({ tacheId: "assemblage_dorm_alu", dureeMin: Math.round((dormant || 1) * q * T.poincon_assemblage_alu) });
    if (ouvrants > 0)
      tasks.push({ tacheId: "assemblage_ouv_alu", dureeMin: Math.round(ouvrants * q * T.poincon_assemblage_alu) });
  }

  // 6. Pré-montage coulissant / galandage
  if ((isCoul || isGland) && ouvrants > 0)
    tasks.push({ tacheId: "premontage_coul", dureeMin: Math.round(ouvrants * q * T.ouvrant_coul_prep) });

  // 7. Montage dormant
  if (isCoul)
    tasks.push({ tacheId: "montage_dorm_coul", dureeMin: Math.round((dormant || 1) * q * T.montage_dormant_coul) });
  if (isGland)
    tasks.push({ tacheId: "montage_dorm_gal", dureeMin: Math.round((dormant || 1) * q * T.montage_dormant_gland) });

  // 8. Ferrage ouvrant (frappe)
  if (isFrappe && ouvrants > 0)
    tasks.push({ tacheId: "ferrage", dureeMin: Math.round(ouvrants * q * T.ferrage_ouvrant) });

  // 9. Vitrage
  if (isFrappe && ouvrants > 0)
    tasks.push({ tacheId: "vitrage_frappe", dureeMin: Math.round(ouvrants * q * T.vitrage_frappe) });
  if ((isCoul || isGland) && ouvrants > 0)
    tasks.push({ tacheId: "vitrage_coul", dureeMin: Math.round(ouvrants * q * T.vitrage_ouvrant_coul) });

  // 10. Mise sur palette
  tasks.push({ tacheId: "palette", dureeMin: Math.round(q * T.mise_palette) });

  return tasks;
}

// Renvoie l'id du premier opérateur compétent pour une tâche
function findBestOp(tacheId: string): string | undefined {
  for (const [opId, taches] of Object.entries(COMPETENCES_DEFAUT)) {
    if (taches.includes(tacheId)) return opId;
  }
  return TACHES_FABRICATION.find(t => t.id === tacheId)?.competences[0];
}

// Avancer d'un jour ouvré à partir d'un YYYY-MM-DD
function nextOuvrableAfter(dateStr: string): string {
  return addWorkdays(dateStr, 1);
}

// ─── Types locaux ─────────────────────────────────────────────────────────────

type PlanCell = { commandeId: string; operateur?: string; parallel?: boolean };

type PlanSemaine = {
  [tacheId: string]: {
    [dayStr: string]: PlanCell[];
  };
};

type VueMode = "poste" | "commande" | "calendrier";

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

  // ── Modals
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showPrintMenu, setShowPrintMenu] = useState(false);

  // Champs du modal planification
  const [modalTache, setModalTache] = useState(TACHES_FABRICATION[0]?.id ?? "");
  const [modalCmd, setModalCmd] = useState("");
  const [modalJour, setModalJour] = useState("");
  const [modalOp, setModalOp] = useState("");

  // ── Vue commande : dates par poste (override manuel)
  const [cmdDates, setCmdDates] = useState<Record<string, Record<string, string>>>({});

  // ── Dates auto calculées par commande depuis dateDemarrage + durées cumulées
  const autoCmdDates = useMemo(() => {
    const result: Record<string, Record<string, string>> = {};
    commandes.forEach(cmd => {
      const tm = TYPES_MENUISERIE[cmd.type];
      if (!tm || tm.famille === "hors_standard" || tm.famille === "intervention") return;
      const cid = String(cmd.id ?? "");
      result[cid] = {};
      const taches = calcTachesCmd(cmd);
      let cursorDay = dateDemarrage(cmd);
      let minutesLeft = 480;
      taches.forEach(({ tacheId, dureeMin }) => {
        if (minutesLeft <= 0) { cursorDay = nextOuvrableAfter(cursorDay); minutesLeft = 480; }
        if (!result[cid][tacheId]) result[cid][tacheId] = cursorDay;
        minutesLeft -= dureeMin;
        while (minutesLeft <= 0) { cursorDay = nextOuvrableAfter(cursorDay); minutesLeft += 480; }
      });
    });
    return result;
  }, [commandes]);

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
    TACHES_FABRICATION.forEach(t => { newPlan[t.id] = {}; });

    const weekStartStr = localStr(weekDays[0]);
    const weekEndStr   = localStr(weekDays[4]);

    // Filtrer et trier : bloqué > urgent > normal, exclure livré/annulé
    const activeCommandes = commandes
      .filter(cmd => {
        const st = (cmd as any).statut as string | undefined;
        return st !== "livree" && st !== "annulee";
      })
      .sort((a, b) => {
        const prio = (c: CommandeCC) => {
          const st = (c as any).statut as string | undefined;
          if (st === "chantier_bloque" || c.priorite === "BLOQUE") return 0;
          if (c.priorite === "URGENT" || st === "urgente") return 1;
          return 2;
        };
        return prio(a) - prio(b);
      });

    activeCommandes.forEach(cmd => {
      const tm = TYPES_MENUISERIE[cmd.type];
      if (!tm || tm.famille === "hors_standard" || tm.famille === "intervention") return;

      const cid = String(cmd.id ?? "");
      const taches = calcTachesCmd(cmd);
      let cursorDay = dateDemarrage(cmd);
      let minutesLeft = 480; // minutes restantes dans la journée courante

      taches.forEach(({ tacheId, dureeMin }) => {
        if (!newPlan[tacheId]) newPlan[tacheId] = {};

        // Passer à la journée suivante si la journée est épuisée
        if (minutesLeft <= 0) {
          cursorDay = nextOuvrableAfter(cursorDay);
          minutesLeft = 480;
        }

        // Placer dans le plan si la journée est dans la semaine courante
        if (cursorDay >= weekStartStr && cursorDay <= weekEndStr && isWorkday(cursorDay)) {
          if (!newPlan[tacheId][cursorDay]) newPlan[tacheId][cursorDay] = [];
          const exists = newPlan[tacheId][cursorDay].some(c => c.commandeId === cid);
          if (!exists) {
            newPlan[tacheId][cursorDay].push({ commandeId: cid, operateur: findBestOp(tacheId) });
          }
        }

        // Avancer le curseur en minutes
        minutesLeft -= dureeMin;
        // Si la tâche dépasse la journée, avancer d'autant de jours que nécessaire
        while (minutesLeft <= 0) {
          cursorDay = nextOuvrableAfter(cursorDay);
          minutesLeft += 480;
        }
      });
    });

    savePlan(newPlan);
  }, [commandes, weekDays, savePlan]);


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

  // ─── Vue par opérateur : inversion du plan (opId → dayStr → [{commandeId, tacheId}])
  const EQUIPE_SIAL = EQUIPE.filter(op => op.poste !== "isula");

  const planByOp = useMemo(() => {
    const result: Record<string, Record<string, Array<{ commandeId: string; tacheId: string }>>> = {};
    EQUIPE_SIAL.forEach(op => { result[op.id] = {}; });
    result["__aucun__"] = {};
    Object.entries(plan).forEach(([tacheId, byDay]) => {
      Object.entries(byDay).forEach(([dayStr, cells]) => {
        cells.forEach(cell => {
          const opId = cell.operateur ?? "__aucun__";
          if (!result[opId]) result[opId] = {};
          if (!result[opId][dayStr]) result[opId][dayStr] = [];
          result[opId][dayStr].push({ commandeId: cell.commandeId, tacheId });
        });
      });
    });
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  // ─── Trouver commande par id
  const cmdById = useCallback((id: string) =>
    commandes.find(c => String(c.id ?? "") === id),
    [commandes]
  );

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
          {([
            { id: "poste",      label: "Par opérateur" },
            { id: "commande",   label: "Par commande" },
            { id: "calendrier", label: "📅 Calendrier" },
          ] as { id: VueMode; label: string }[]).map(v => (
            <button
              key={v.id}
              onClick={() => setVue(v.id)}
              style={{
                padding: "5px 14px",
                background: vue === v.id ? C.blue : "transparent",
                color: vue === v.id ? "#fff" : C.sec,
                border: "none", cursor: "pointer", fontWeight: 600, fontSize: 11,
              }}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Navigation semaine — masquée en vue Calendrier (PlanningCalendrier a sa propre nav) */}
        {vue !== "calendrier" && (<>
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
        </>)}

        {/* Dropdown Imprimer — masqué en vue Calendrier */}
        {vue !== "calendrier" && <div style={{ position: "relative" }}>
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
        </div>}
      </div>

      {/* ── VUE CALENDRIER ─────────────────────────────────────────────────────── */}
      {vue === "calendrier" && (
        <PlanningCalendrier commandes={commandes} />
      )}

      {/* ── VUE PAR OPÉRATEUR ─────────────────────────────────────────────────── */}
      {vue === "poste" && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11 }}>
            <thead>
              <tr>
                <th style={thStyle({ width: 130, textAlign: "left" })}>Opérateur</th>
                {weekDays.map((d, i) => {
                  const ds = localStr(d);
                  const ferie = JOURS_FERIES[ds];
                  return (
                    <th key={i} style={thStyle({ background: ferie ? C.s2 : C.s1, minWidth: 160 })}>
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
              {EQUIPE_SIAL.map(op => {
                const rowByDay = planByOp[op.id] ?? {};
                const hasAnything = Object.values(rowByDay).some(arr => arr.length > 0);
                return (
                  <tr key={op.id} style={{
                    borderBottom: `1px solid ${C.border}`,
                    opacity: hasAnything ? 1 : 0.45,
                  }}>
                    {/* Colonne opérateur */}
                    <td style={{
                      border: `1px solid ${C.border}`,
                      padding: "8px 10px",
                      background: C.s1,
                      verticalAlign: "top",
                      minWidth: 120,
                    }}>
                      <div style={{ fontWeight: 700, color: C.text, fontSize: 12 }}>{op.nom}</div>
                      <div style={{ fontSize: 9, color: C.sec, marginTop: 2 }}>{op.poste}</div>
                    </td>
                    {/* Cellules par jour */}
                    {weekDays.map(d => {
                      const ds = localStr(d);
                      const ferie = JOURS_FERIES[ds];
                      const items = rowByDay[ds] ?? [];
                      return (
                        <td key={ds} style={{
                          border: `1px solid ${C.border}`,
                          verticalAlign: "top",
                          padding: "4px 5px",
                          background: ferie ? C.s1 + "cc" : "transparent",
                          minWidth: 160,
                        }}>
                          {ferie && (
                            <div style={{ fontSize: 9, color: C.orange, marginBottom: 3, fontStyle: "italic" }}>
                              {ferie}
                            </div>
                          )}
                          {items.map((item, i) => {
                            const cmd = cmdById(item.commandeId);
                            if (!cmd) return null;
                            const tache = TACHES_FABRICATION.find(t => t.id === item.tacheId);
                            return (
                              <div
                                key={i}
                                onDoubleClick={() => cmd && onEdit?.(cmd)}
                                style={{
                                  background: C.s2,
                                  border: `1px solid ${C.bLight}`,
                                  borderRadius: 4,
                                  padding: "4px 7px",
                                  marginBottom: 3,
                                  cursor: "pointer",
                                  lineHeight: 1.4,
                                  position: "relative",
                                }}
                                title="Double-clic pour éditer la commande"
                              >
                                <div style={{ fontWeight: 700, fontSize: 11, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 }}>
                                  {cmd.client ?? "—"}
                                </div>
                                {(cmd as any).ref_chantier && (
                                  <div style={{ fontSize: 9, color: C.sec, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 }}>
                                    {(cmd as any).ref_chantier}
                                  </div>
                                )}
                                <div style={{ fontSize: 9, color: C.teal, marginTop: 1 }}>
                                  {tache?.label ?? item.tacheId}
                                </div>
                                <button
                                  onClick={e => { e.stopPropagation(); removeCell(item.tacheId, ds, item.commandeId); }}
                                  title="Retirer du planning"
                                  style={{
                                    position: "absolute", top: 2, right: 3,
                                    background: "none", border: "none",
                                    color: C.red, cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0,
                                  }}
                                >×</button>
                              </div>
                            );
                          })}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {/* Ligne « Non assigné » si des cellules sans opérateur existent */}
              {Object.values(planByOp["__aucun__"] ?? {}).some(a => a.length > 0) && (
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{
                    border: `1px solid ${C.border}`, padding: "8px 10px",
                    background: C.s1, verticalAlign: "top",
                  }}>
                    <div style={{ fontWeight: 700, color: C.orange, fontSize: 11 }}>Non assigné</div>
                  </td>
                  {weekDays.map(d => {
                    const ds = localStr(d);
                    const items = planByOp["__aucun__"]?.[ds] ?? [];
                    return (
                      <td key={ds} style={{ border: `1px solid ${C.border}`, verticalAlign: "top", padding: "4px 5px" }}>
                        {items.map((item, i) => {
                          const cmd = cmdById(item.commandeId);
                          if (!cmd) return null;
                          const tache = TACHES_FABRICATION.find(t => t.id === item.tacheId);
                          return (
                            <div key={i} style={{ background: C.s2, border: `1px solid ${C.orange}44`, borderRadius: 4, padding: "3px 6px", marginBottom: 3, fontSize: 10 }}>
                              <div style={{ fontWeight: 700, color: C.text }}>{cmd.client ?? "—"}</div>
                              <div style={{ fontSize: 9, color: C.teal }}>{tache?.label ?? item.tacheId}</div>
                            </div>
                          );
                        })}
                      </td>
                    );
                  })}
                </tr>
              )}
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
                        const manual = cmdDates[cid]?.[p.id] ?? "";
                        const auto   = autoCmdDates[cid]?.[p.id] ?? "";
                        const val    = manual || auto;
                        const isAuto = !manual && !!auto;
                        return (
                          <td key={p.id} style={{
                            border: `1px solid ${C.border}`, padding: "4px 6px",
                            verticalAlign: "middle",
                            background: isAuto ? C.s1 + "88" : "transparent",
                          }}>
                            <input
                              type="date"
                              value={val}
                              onChange={e => setCmdDate(cid, p.id, e.target.value)}
                              style={{
                                background: manual ? C.s2 : "transparent",
                                border: `1px solid ${manual ? C.bLight : C.border}`,
                                borderRadius: 3,
                                color: manual ? C.text : isAuto ? C.sec : C.muted,
                                fontSize: 10, padding: "2px 4px", width: "100%",
                              }}
                            />
                            {val && (
                              <div style={{ fontSize: 9, color: isAuto ? C.muted : C.sec, marginTop: 2 }}>
                                {isAuto ? "auto · " : ""}
                                {new Date(val + "T12:00:00").toLocaleDateString("fr-FR", {
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
      {vue !== "calendrier" && <div style={{
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
      </div>}

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
