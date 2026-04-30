"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { C, calcCheminCritique, fmtDate, CommandeCC, JOURS_FERIES, getWeekNum, specialMultiplier } from "@/lib/sial-data";
import { postShortLabel, type Phase as WorkPostPhase } from "@/lib/work-posts";
import { getRoutage, isulaInfoFromCmd } from "@/lib/routage-production";
import { calcCriticalRatio, detectBottleneck, calcTakt } from "@/lib/scheduling-priority";
import { suggestModeJourSemaine, type ModeJour } from "@/lib/heijunka";
import AndonPanel from "@/components/AndonPanel";
import SqdcpPanel from "@/components/SqdcpPanel";

// ── Helpers ──────────────────────────────────────────────────────────────────

function localStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay(); d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return localStr(d);
}
function fmtDayLong(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

const RAISONS_BLOCAGE = [
  { id: "manque_temps",      label: "Manque de temps",          icon: "⏰" },
  { id: "manque_accessoire", label: "Manque accessoire",        icon: "🔩" },
  { id: "manque_profil",     label: "Manque profilé",           icon: "📦" },
  { id: "manque_vitrage",    label: "Manque vitrage",           icon: "🪟" },
  { id: "manque_dossier",    label: "Manque dossier fab",       icon: "📋" },
  { id: "manque_info",       label: "Manque information",       icon: "❓" },
  { id: "panne_machine",     label: "Panne machine",            icon: "⚙" },
  { id: "probleme_qualite",  label: "Problème qualité",         icon: "⚠" },
  { id: "absence",           label: "Absence opérateur",        icon: "👤" },
  { id: "priorite_changee",  label: "Priorité changée",         icon: "🔄" },
  { id: "autre",             label: "Autre",                    icon: "📝" },
];

interface PointageEntry {
  pct: number;
  realMin: number;
  realOps: string[];
  status: "fait" | "partiel" | "pasfait" | "";
  raison: string;
  reportTo: string;
  reportOps: string[];
  note: string;
  /** Heure de début manuelle (format décimal, ex 9.5 = 9h30). */
  manualStart?: number;
  /** Durée manuelle en minutes (override de l'estimation). */
  manualDur?: number;
}
interface ImpreveEntry {
  label: string; postId: string; realMin: number; ops: string[]; raison: string;
}

/**
 * Entrée de contrôle / supervision : temps passé par un expert à contrôler
 * la qualité ou former un apprenti. NON compté dans la production machine,
 * mais bien comptabilisé dans le total opérateur du jour.
 */
interface ControleEntry {
  id: string;
  operateur: string;
  /** Type : "controle_qualite" | "supervision" | "formation" */
  type: string;
  /** Chantier ou poste concerné (libre). */
  cible: string;
  realMin: number;
  note?: string;
}

type PointageData = {
  entries: Record<string, PointageEntry>;
  imprevu: ImpreveEntry[];
  /** Liste des contrôles/supervisions de la journée. */
  controles?: ControleEntry[];
};

interface CellData { ops: string[]; cmds: string[]; extras?: string[]; supervisors?: string[] }

// ── Phases & couleurs (cohérent avec PlanningAffectations) ───────────────────
const PHASES = [
  { id: "coupe",       label: "Coupe & Prépa", color: "#42A5F5", postIds: ["C2","C3","C4","C5","C6"] },
  { id: "montage_f",   label: "Montage Frappes", color: "#FFA726", postIds: ["F1","F2","F3","M3"] },
  { id: "montage_c",   label: "Montage Coul./Gal.", color: "#FFA726", postIds: ["M1","M2","MHS"] },
  { id: "vitrage",     label: "Vitrage",       color: "#26C6DA", postIds: ["V1","V2","V3"] },
  { id: "isula",       label: "ISULA",         color: "#4DB6AC", postIds: ["I1","I2","I3","I4","I5","I6","I7","I8","IL","IB"] },
  { id: "logistique",  label: "Logistique",    color: "#CE93D8", postIds: ["L4","L6","L7","AUT"] },
];

// ── Format heure ─────────────────────────────────────────────────────────────
function fmtHour(decimalHour: number): string {
  const h = Math.floor(decimalHour);
  const m = Math.round((decimalHour - h) * 60);
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

const ISULA_DAYS = [1, 2, 4]; // lun, mar, jeu

// ── Composant ────────────────────────────────────────────────────────────────

export default function Aujourdhui({ commandes, stocks: _stocks, onNav }: {
  commandes: CommandeCC[];
  stocks?: Record<string, { actuel: number }>;
  onNav?: (tab: string) => void;
}) {
  const [date, setDate] = useState(() => localStr(new Date()));
  const [mode, setMode] = useState<"FRAPPES" | "COULISSANTS">("FRAPPES");
  const [affData, setAffData] = useState<Record<string, CellData>>({});
  const [pointage, setPointage] = useState<PointageData>({ entries: {}, imprevu: [] });
  const [saving, setSaving] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [editingHourKey, setEditingHourKey] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const monday = getMondayOf(date);
  const dayOfWeek = new Date(date + "T00:00:00").getDay();
  const isFerie = !!JOURS_FERIES[date];
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isIsulaDay = ISULA_DAYS.includes(dayOfWeek);
  const jourIdx = (() => {
    for (let i = 0; i < 5; i++) {
      const d = new Date(monday + "T00:00:00"); d.setDate(d.getDate() + i);
      if (localStr(d) === date) return i;
    }
    return -1;
  })();
  const semNum = getWeekNum(date);

  // ── Charger mode du jour ──
  useEffect(() => {
    fetch("/api/planning/mode-jour")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.mode === "FRAPPES" || d?.mode === "COULISSANTS") setMode(d.mode); })
      .catch(() => {});
  }, [date]);

  // ── Charger affectations de la semaine ──
  useEffect(() => {
    fetch(`/api/planning/affectations?semaine=${monday}`)
      .then(r => r.ok ? r.json() : {})
      .then(data => {
        if (!data || typeof data !== "object") { setAffData({}); return; }
        const migrated: Record<string, CellData> = {};
        for (const [k, v] of Object.entries(data)) {
          if (Array.isArray(v)) migrated[k] = { ops: v as string[], cmds: [] };
          else if (v && typeof v === "object" && "ops" in (v as any)) migrated[k] = v as CellData;
        }
        setAffData(migrated);
      }).catch(() => setAffData({}));
  }, [monday]);

  // ── Charger pointage du jour ──
  useEffect(() => {
    fetch(`/api/pointage-jour?date=${date}`)
      .then(r => r.ok ? r.json() : {})
      .then(data => {
        if (data && typeof data === "object" && !Array.isArray(data)) {
          const d = data as any;
          if (d.entries) setPointage({ entries: d.entries || {}, imprevu: d.imprevu || [] });
          else setPointage({ entries: d as Record<string, PointageEntry>, imprevu: [] });
        } else setPointage({ entries: {}, imprevu: [] });
      })
      .catch(() => setPointage({ entries: {}, imprevu: [] }));
  }, [date]);

  // ── Sauvegarde pointage ──
  const savePointage = useCallback((newData: PointageData) => {
    setPointage(newData);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      await fetch("/api/pointage-jour", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, data: newData }),
      }).catch(() => {});
      setSaving(false);
    }, 700);
  }, [date]);

  const updateEntry = (key: string, updates: Partial<PointageEntry>) => {
    const entry = pointage.entries[key] || { pct: 0, realMin: 0, realOps: [], status: "", raison: "", reportTo: "", reportOps: [], note: "" };
    savePointage({ ...pointage, entries: { ...pointage.entries, [key]: { ...entry, ...updates } } });
  };

  // ── Toggle mode du jour ──
  const toggleMode = async () => {
    const newMode = mode === "FRAPPES" ? "COULISSANTS" : "FRAPPES";
    setMode(newMode);
    await fetch("/api/planning/mode-jour", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: newMode }),
    }).catch(() => {});
  };

  // ── Index estimation par chantier × poste (pour la timeline horaire) ──
  // On précalcule depuis getRoutage(type, qty, hsTemps) les minutes
  // attendues pour chaque commande, indexées par "chantier|postId".
  const timeByChantierPost = useMemo(() => {
    const map = new Map<string, number>();
    for (const cmd of commandes) {
      const a = cmd as any;
      const ch = a.ref_chantier || a.client || "";
      if (!ch) continue;
      const lignes = Array.isArray(a.lignes) && a.lignes.length > 0
        ? a.lignes
        : [{ type: cmd.type, quantite: cmd.quantite }];
      const isulaInfo = isulaInfoFromCmd(a);
      for (let li = 0; li < lignes.length; li++) {
        const ligne = lignes[li];
        const lType = ligne.type || cmd.type;
        if (lType === "intervention_chantier") continue;
        const lQte = parseInt(ligne.quantite) || cmd.quantite || 1;
        const lHs = lType === "hors_standard"
          ? { t_coupe: ligne.hs_t_coupe, t_montage: ligne.hs_t_montage, t_vitrage: ligne.hs_t_vitrage }
          : a.hsTemps;
        const lSf = specialMultiplier(parseFloat(ligne?.largeur_mm) || parseFloat(ligne?.largeur) || 0);
        const routage = getRoutage(lType, lQte, lHs as Record<string, unknown> | null, lSf, undefined,
          li === 0 ? isulaInfo : undefined);
        for (const e of routage) {
          const k = `${ch}|${e.postId}`;
          map.set(k, (map.get(k) || 0) + e.estimatedMin);
        }
      }
    }
    return map;
  }, [commandes]);

  // ── Tâches du jour à partir des affectations, enrichies avec la durée ──
  const dayTasks = useMemo(() => {
    if (jourIdx < 0) return [];
    interface Task {
      postId: string; chantier: string; ops: string[]; key: string;
      isExtra: boolean;
      demi: "am" | "pm";          // créneau d'origine (depuis aff key)
      estimatedMin: number;       // depuis le routage de la commande
    }
    const tasks: Task[] = [];
    const seen = new Set<string>();
    for (const [k, cellRaw] of Object.entries(affData)) {
      const parts = k.split("|");
      if (parseInt(parts[1]) !== jourIdx) continue;
      const postId = parts[0];
      const demi = (parts[2] === "pm" ? "pm" : "am") as "am" | "pm";
      const cell = cellRaw as CellData;

      for (const ch of (cell.cmds || [])) {
        const key = `${postId}|${ch}`;
        if (seen.has(key)) {
          const ex = tasks.find(t => t.key === key)!;
          for (const o of (cell.ops || [])) if (!ex.ops.includes(o)) ex.ops.push(o);
          continue;
        }
        seen.add(key);
        const est = timeByChantierPost.get(`${ch}|${postId}`) || 0;
        tasks.push({ postId, chantier: ch, ops: [...(cell.ops || [])], key, isExtra: false, demi, estimatedMin: est });
      }
      for (const ext of (cell.extras || [])) {
        const key = `${postId}|${ext}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // Extras : pas d'estimation routage, on parse "(2h)" / "(1h30)" du label si présent.
        const m = ext.match(/\((\d+)h(\d+)?\)/);
        const est = m ? parseInt(m[1]) * 60 + (parseInt(m[2]) || 0) : 0;
        tasks.push({ postId, chantier: ext, ops: [...(cell.ops || [])], key, isExtra: true, demi, estimatedMin: est });
      }
    }
    return tasks;
  }, [affData, jourIdx, timeByChantierPost]);

  // ── Calcul des heures de début/fin par tâche ──
  // Si AJ a fixé une heure manuelle (entry.manualStart), on l'utilise.
  // Sinon on enchaîne automatiquement dans 8h-12h puis 13h-17h en respectant
  // la durée estimée (divisée par le nombre d'ops travaillant en parallèle).
  const taskTimings = useMemo(() => {
    const map = new Map<string, { startHour: number; endHour: number; durationMin: number; manual: boolean }>();
    // Grouper par poste × demi
    const byPostDemi = new Map<string, typeof dayTasks>();
    for (const t of dayTasks) {
      const k = `${t.postId}|${t.demi}`;
      if (!byPostDemi.has(k)) byPostDemi.set(k, []);
      byPostDemi.get(k)!.push(t);
    }
    for (const [k, ts] of Array.from(byPostDemi.entries())) {
      const [, demi] = k.split("|");
      const startBase = demi === "am" ? 8 : 13;
      const endBase = demi === "am" ? 12 : 17;
      const nbOps = Math.max(1, ts[0]?.ops.length || 1);
      let cursor = startBase;
      for (const t of ts) {
        const entry = pointage.entries[t.key];
        const manualStart = entry?.manualStart;
        const manualDur = entry?.manualDur;
        if (manualStart !== undefined) {
          const dur = manualDur ?? Math.max(30, t.estimatedMin / nbOps);
          map.set(t.key, {
            startHour: manualStart,
            endHour: manualStart + dur / 60,
            durationMin: Math.round(dur),
            manual: true,
          });
          cursor = manualStart + dur / 60;
          continue;
        }
        // Auto : durée minimale 30 min, bornée par fin de créneau
        const rawDur = manualDur ?? Math.max(30, t.estimatedMin / nbOps);
        const start = cursor;
        const remaining = (endBase - start) * 60;
        const dur = Math.min(rawDur, remaining);
        const end = start + dur / 60;
        map.set(t.key, { startHour: start, endHour: end, durationMin: Math.round(dur), manual: false });
        cursor = end;
        if (cursor >= endBase) break;
      }
    }
    return map;
  }, [dayTasks, pointage.entries]);

  // ── Grouper par phase, en respectant le mode du jour ──
  const tasksByPhase = useMemo(() => {
    const result: Array<{ phase: typeof PHASES[0]; tasks: typeof dayTasks }> = [];
    for (const phase of PHASES) {
      // Filtrage selon mode du jour : on cache la phase montage incompatible
      if (phase.id === "montage_f" && mode === "COULISSANTS") continue;
      if (phase.id === "montage_c" && mode === "FRAPPES") continue;
      if (phase.id === "isula" && !isIsulaDay) continue;
      const tasks = dayTasks.filter(t => phase.postIds.includes(t.postId));
      if (tasks.length === 0) continue;
      result.push({ phase, tasks });
    }
    return result;
  }, [dayTasks, mode, isIsulaDay]);

  // ── Retards & livraisons ──
  // Critical Ratio par commande (jours dispo / jours besoin) — règle de
  // dispatching standard. Voir lib/scheduling-priority.ts.
  const cmdsCritiques = useMemo(() => {
    return commandes
      .map(c => ({ cmd: c, cc: calcCheminCritique(c), cr: calcCriticalRatio(c, date) }))
      .filter(x => {
        const s = (x.cmd as any).statut;
        return s !== "livre" && s !== "annulee" && s !== "terminee";
      })
      .filter(x => x.cr.level === "impossible" || x.cr.level === "tendu" || x.cc?.enRetard)
      .sort((a, b) => a.cr.ratio - b.cr.ratio);
  }, [commandes, date]);

  const retards = useMemo(() => {
    return commandes
      .map(c => ({ cmd: c, cc: calcCheminCritique(c) }))
      .filter(x => x.cc?.enRetard && (x.cmd as any).statut !== "livre" && (x.cmd as any).statut !== "annulee" && (x.cmd as any).statut !== "terminee")
      .sort((a, b) => (b.cc?.retardJours || 0) - (a.cc?.retardJours || 0));
  }, [commandes]);

  // ── Détection du goulot de la semaine (Drum-Buffer-Rope) ──────────────
  // On agrège la charge par poste depuis les chantiers actifs cette semaine,
  // et on identifie le poste le plus saturé (vs sa capacité × 5j).
  const bottleneck = useMemo(() => {
    const work: Record<string, { totalMin: number }> = {};
    const weekStart = new Date(monday + "T00:00:00");
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 5);
    for (const cmd of commandes) {
      const a = cmd as any;
      if (a.statut === "livre" || a.statut === "annulee" || a.statut === "terminee") continue;
      // Considérer la commande si sa semaine_coupe ou semaine_montage tombe dans la semaine courante
      const semCoupe = a.semaine_coupe || a.semaine_montage || a.semaine_vitrage;
      if (semCoupe !== monday) continue;
      const lignes = Array.isArray(a.lignes) && a.lignes.length > 0
        ? a.lignes : [{ type: cmd.type, quantite: cmd.quantite }];
      const isulaInfoBN = isulaInfoFromCmd(a);
      for (let li = 0; li < lignes.length; li++) {
        const ligne = lignes[li];
        const lType = ligne.type || cmd.type;
        if (lType === "intervention_chantier") continue;
        const lQte = parseInt(ligne.quantite) || cmd.quantite || 1;
        const lHs = lType === "hors_standard"
          ? { t_coupe: ligne.hs_t_coupe, t_montage: ligne.hs_t_montage, t_vitrage: ligne.hs_t_vitrage }
          : a.hsTemps;
        const lSf = specialMultiplier(parseFloat(ligne?.largeur_mm) || parseFloat(ligne?.largeur) || 0);
        const routage = getRoutage(lType, lQte, lHs as Record<string, unknown> | null, lSf, undefined,
          li === 0 ? isulaInfoBN : undefined);
        for (const e of routage) {
          if (!work[e.postId]) work[e.postId] = { totalMin: 0 };
          work[e.postId].totalMin += e.estimatedMin;
        }
      }
    }
    // Compter les jours fériés cette semaine pour ajuster la capacité
    let joursOuvres = 0;
    for (let i = 0; i < 5; i++) {
      const d = new Date(monday + "T12:00:00");
      d.setDate(d.getDate() + i);
      const ds = localStr(d);
      if (!JOURS_FERIES[ds]) joursOuvres++;
    }
    return detectBottleneck(work, joursOuvres);
  }, [commandes, monday]);

  // ── Total minutes par opérateur (production + contrôle + supervision + livraison) ──
  // Permet à AJ de voir qui a fait combien dans la journée, toutes activités confondues.
  const opTotaux = useMemo(() => {
    const map = new Map<string, { production: number; controle: number; supervision: number; livraison: number; total: number }>();
    const ensure = (op: string) => {
      if (!map.has(op)) map.set(op, { production: 0, controle: 0, supervision: 0, livraison: 0, total: 0 });
      return map.get(op)!;
    };

    // Production : somme des realMin pointés (réparti par opérateur)
    for (const t of dayTasks) {
      const e = pointage.entries[t.key];
      if (!e || !e.realMin || e.realMin <= 0) continue;
      const ops = (e.realOps && e.realOps.length > 0) ? e.realOps : t.ops;
      if (ops.length === 0) continue;
      // Si livraison (extras avec "Livraison" ou poste AUT), compter en livraison
      const isLivraison = t.isExtra && (t.chantier.toLowerCase().includes("livraison") || t.chantier.toLowerCase().includes("chargement"));
      const perOp = Math.round(e.realMin / ops.length);
      for (const op of ops) {
        const ent = ensure(op);
        if (isLivraison) ent.livraison += perOp;
        else ent.production += perOp;
      }
    }

    // Contrôles & supervision (panneau dédié)
    for (const c of pointage.controles || []) {
      if (!c.operateur || !c.realMin) continue;
      const ent = ensure(c.operateur);
      if (c.type === "supervision" || c.type === "formation") ent.supervision += c.realMin;
      else ent.controle += c.realMin;
    }

    // Imprévus (compter en production par défaut)
    for (const i of pointage.imprevu || []) {
      if (!i.ops || i.ops.length === 0 || !i.realMin) continue;
      const perOp = Math.round(i.realMin / i.ops.length);
      for (const op of i.ops) {
        const ent = ensure(op);
        ent.production += perOp;
      }
    }

    // Calculer total
    for (const v of Array.from(map.values())) {
      v.total = v.production + v.controle + v.supervision + v.livraison;
    }
    return Array.from(map.entries())
      .map(([nom, vals]) => ({ nom, ...vals }))
      .filter(o => o.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [dayTasks, pointage]);

  // ── Suggestion Heijunka pour la semaine ──────────────────────────────
  // Calcule le mix idéal Frappes / Coulissants sur les 5 jours et propose
  // une séquence alternée pour lisser la charge.
  const heijunka = useMemo(() => suggestModeJourSemaine(commandes, monday), [commandes, monday]);
  const modeAuj = jourIdx >= 0 && jourIdx < 5 ? heijunka.modesByDay[jourIdx] : null;
  const suggestedDifferent = modeAuj !== null && modeAuj !== mode;

  // ── Takt time du jour ──────────────────────────────────────────────────
  // Demande client (= nombre de tâches du jour) vs temps disponible des ops
  // affectés. Permet de voir en un coup d'œil le rythme à tenir.
  const takt = useMemo(() => {
    if (dayTasks.length === 0) return null;
    const opsToday = new Set<string>();
    for (const t of dayTasks) for (const o of t.ops) opsToday.add(o);
    const nbOps = Math.max(1, opsToday.size);
    // Approximation : 8h × nbOps (sans tenir compte des horaires individuels ici)
    const totalAvailableMin = 480 * nbOps;
    return calcTakt(totalAvailableMin, dayTasks.length);
  }, [dayTasks]);

  const livraisonsAuj = useMemo(() => {
    return commandes.filter(c => {
      const a = c as any;
      if (a.statut === "annulee") return false;
      if (a.date_livraison_souhaitee === date) return true;
      const dates = (a.dates_livraisons as any[]) || [];
      return dates.some(d => d?.date === date);
    });
  }, [commandes, date]);

  // ── Stats progression ──
  const totalTasks = dayTasks.length;
  const doneTasks = dayTasks.filter(t => pointage.entries[t.key]?.status === "fait").length;
  const partialTasks = dayTasks.filter(t => pointage.entries[t.key]?.status === "partiel").length;
  const pctGlobal = totalTasks > 0 ? Math.round((doneTasks + partialTasks * 0.5) / totalTasks * 100) : 0;

  // ── Navigation ──
  const navDate = (delta: number) => {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + delta);
    let s = localStr(d);
    // Sauter we
    while (new Date(s + "T00:00:00").getDay() === 0 || new Date(s + "T00:00:00").getDay() === 6) {
      d.setDate(d.getDate() + (delta > 0 ? 1 : -1));
      s = localStr(d);
    }
    setDate(s);
  };

  return (
    <div>
      {/* ══ HEADER ═══════════════════════════════════════════════════════════ */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => navDate(-1)} style={navBtn}>←</button>
          <button onClick={() => setDate(localStr(new Date()))} style={navBtn}>Auj.</button>
          <button onClick={() => navDate(1)} style={navBtn}>→</button>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800, textTransform: "capitalize" }}>
            {fmtDayLong(date)} <span style={{ fontSize: 13, color: C.sec, fontWeight: 600 }}>· S{String(semNum).padStart(2, "0")}</span>
            {isFerie && <span style={{ marginLeft: 10, padding: "2px 8px", background: C.red + "22", border: `1px solid ${C.red}66`, borderRadius: 4, color: C.red, fontSize: 11, fontWeight: 700 }}>FÉRIÉ — {JOURS_FERIES[date]}</span>}
            {!isFerie && isIsulaDay && <span style={{ marginLeft: 10, padding: "2px 8px", background: "#4DB6AC22", border: "1px solid #4DB6AC66", borderRadius: 4, color: "#4DB6AC", fontSize: 10, fontWeight: 700 }}>ISULA actif</span>}
          </div>
          <div style={{ fontSize: 11, color: C.sec, marginTop: 2 }}>
            {totalTasks > 0 ? (
              <>{doneTasks}/{totalTasks} terminées · {partialTasks} partielles · {saving ? "Sauvegarde…" : "Sauvegardé ✓"}</>
            ) : isWeekend || isFerie ? (
              <>Pas de production prévue ce jour</>
            ) : (
              <>Aucune tâche planifiée — vérifie les <a onClick={() => onNav?.("planning_fab")} style={{ color: C.orange, cursor: "pointer", textDecoration: "underline" }}>affectations</a></>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {totalTasks > 0 && (
            <div style={{ fontSize: 32, fontWeight: 800, color: pctGlobal >= 100 ? C.green : pctGlobal >= 50 ? C.orange : C.red, lineHeight: 1 }}>
              {pctGlobal}%
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
            <button onClick={toggleMode} title="Bascule mode du jour" style={{
              padding: "8px 14px",
              background: mode === "FRAPPES" ? "#FFA72622" : "#66BB6A22",
              border: `2px solid ${mode === "FRAPPES" ? "#FFA726" : "#66BB6A"}`,
              borderRadius: 6, color: mode === "FRAPPES" ? "#FFA726" : "#66BB6A",
              fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
            }}>
              Mode : {mode === "FRAPPES" ? "Frappes" : "Coulissants"}
            </button>
            {suggestedDifferent && modeAuj && (
              <button
                onClick={async () => {
                  setMode(modeAuj);
                  await fetch("/api/planning/mode-jour", {
                    method: "PUT", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ mode: modeAuj }),
                  }).catch(() => {});
                }}
                title={heijunka.raison}
                style={{
                  padding: "3px 8px", fontSize: 9, fontWeight: 700,
                  background: C.purple + "22", border: `1px solid ${C.purple}66`,
                  borderRadius: 3, color: C.purple, cursor: "pointer", whiteSpace: "nowrap",
                }}>
                💡 Heijunka suggère : {modeAuj === "FRAPPES" ? "Frappes" : "Coul."}
              </button>
            )}
          </div>
        </div>
      </div>

      {totalTasks > 0 && (
        <div style={{ height: 6, background: C.s2, borderRadius: 3, overflow: "hidden", marginBottom: 14 }}>
          <div style={{ width: `${pctGlobal}%`, height: "100%", background: pctGlobal >= 100 ? C.green : pctGlobal >= 50 ? C.orange : C.red, transition: "width 0.3s" }} />
        </div>
      )}

      {/* ══ ANDON & SQDCP — management visuel journalier ═══════════════════ */}
      <AndonPanel />
      <SqdcpPanel date={date} />

      {/* ══ GOULOT + TAKT (pilotage Drum-Buffer-Rope) ═══════════════════════ */}
      {(bottleneck || takt) && totalTasks > 0 && (
        <div style={{
          display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap",
        }}>
          {bottleneck && bottleneck.status !== "ok" && (
            <div style={{
              flex: 1, minWidth: 240,
              background: bottleneck.status === "surcharge" ? C.red + "15"
                        : bottleneck.status === "saturé"   ? C.orange + "15"
                                                            : C.yellow + "15",
              border: `1px solid ${bottleneck.status === "surcharge" ? C.red
                                  : bottleneck.status === "saturé"   ? C.orange
                                                                      : C.yellow}66`,
              borderRadius: 6, padding: "10px 14px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 14 }}>🥁</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>
                  Goulot de la semaine — {postShortLabel(bottleneck.postId)}
                </span>
              </div>
              <div style={{ fontSize: 11, color: C.sec }}>
                Saturation <b style={{ color: bottleneck.status === "surcharge" ? C.red : bottleneck.status === "saturé" ? C.orange : C.text }}>{bottleneck.saturationPct}%</b>{" "}
                ({Math.round(bottleneck.chargeMin / 60)}h sur {Math.round(bottleneck.capacityMin / 60)}h dispo).
                {bottleneck.status === "surcharge" && " 🔴 Capacité dépassée — déplacer des chantiers."}
                {bottleneck.status === "saturé" && " 🟠 Tout retard ici décale toute la semaine."}
                {bottleneck.status === "tendu" && " 🟡 Surveiller, peu de marge."}
              </div>
            </div>
          )}
          {takt && takt.status !== "inconnu" && (
            <div style={{
              minWidth: 220,
              background: C.blue + "12", border: `1px solid ${C.blue}55`,
              borderRadius: 6, padding: "10px 14px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 14 }}>⏱</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>
                  Takt time
                </span>
              </div>
              <div style={{ fontSize: 11, color: C.sec }}>
                <b style={{ color: C.blue }}>{takt.taktMinPerPiece} min/tâche</b> pour tenir le rythme<br/>
                <span style={{ fontSize: 10, color: C.muted }}>
                  ({takt.pieces} tâches · {Math.round(takt.totalAvailableMin / 60)}h dispo)
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ ALERTES COMMANDES CRITIQUES (Critical Ratio + retards) ══════════ */}
      {cmdsCritiques.length > 0 && (
        <div style={{
          background: C.red + "10", border: `1px solid ${C.red}55`, borderRadius: 6,
          padding: "10px 14px", marginBottom: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 14 }}>⚠</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: C.red }}>
              {cmdsCritiques.length} commande{cmdsCritiques.length > 1 ? "s" : ""} en alerte
            </span>
            <span style={{ fontSize: 10, color: C.muted, fontStyle: "italic" }}>
              triées par Critical Ratio (jours dispo / jours besoin)
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {cmdsCritiques.slice(0, 8).map(({ cmd, cc, cr }) => {
              const a = cmd as any;
              return (
                <div key={String(cmd.id)} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 11 }}>
                  <span style={{
                    minWidth: 90, padding: "2px 6px", borderRadius: 3,
                    fontWeight: 700, fontSize: 10,
                    background: cr.color + "33", color: cr.color, textAlign: "center",
                  }} title={`${cr.joursDispo}j dispo / ${cr.joursBesoin}j besoin`}>
                    CR {cr.ratio}× {cr.level === "impossible" ? "🔴" : cr.level === "tendu" ? "🟠" : ""}
                  </span>
                  {cc?.enRetard && (
                    <span style={{ minWidth: 50, fontWeight: 700, color: C.red }}>+{cc.retardJours}j</span>
                  )}
                  <span style={{ fontWeight: 700, color: C.text }}>{a.client}</span>
                  <span style={{ color: C.sec }}>{a.ref_chantier || "—"}</span>
                  <span style={{ color: C.muted, fontSize: 10 }}>livraison {fmtDate(a.date_livraison_souhaitee)}</span>
                </div>
              );
            })}
            {cmdsCritiques.length > 8 && (
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                + {cmdsCritiques.length - 8} autre{cmdsCritiques.length - 8 > 1 ? "s" : ""}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ PRÊT À LIVRER AUJOURD'HUI ═══════════════════════════════════════ */}
      {livraisonsAuj.length > 0 && (
        <div style={{
          background: C.green + "10", border: `1px solid ${C.green}55`, borderRadius: 6,
          padding: "10px 14px", marginBottom: 12,
        }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.green, marginBottom: 6 }}>
            🚚 À livrer aujourd'hui ({livraisonsAuj.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {livraisonsAuj.map(c => {
              const a = c as any;
              return (
                <div key={String(c.id)} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 11 }}>
                  <span style={{ fontWeight: 700, color: C.text }}>{a.client}</span>
                  <span style={{ color: C.sec }}>{a.ref_chantier || "—"}</span>
                  {a.zone && <span style={{ padding: "1px 6px", background: C.s2, borderRadius: 3, color: C.muted, fontSize: 10 }}>{a.zone}</span>}
                  {a.transporteur && <span style={{ padding: "1px 6px", background: C.teal + "22", borderRadius: 3, color: C.teal, fontSize: 10, fontWeight: 700 }}>{a.transporteur}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══ CONTRÔLES & SUPERVISION (temps expert hors production) ══════════ */}
      <ControlesPanel
        controles={pointage.controles || []}
        onChange={(controles) => savePointage({ ...pointage, controles })}
      />

      {/* ══ TÂCHES DU JOUR PAR PHASE ════════════════════════════════════════ */}
      {tasksByPhase.length === 0 ? (
        !isWeekend && !isFerie && (
          <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6, padding: 30, textAlign: "center", color: C.sec }}>
            <div style={{ fontSize: 13, marginBottom: 6 }}>Aucune tâche planifiée pour ce jour.</div>
            <div style={{ fontSize: 11 }}>Va dans <a onClick={() => onNav?.("planning_fab")} style={{ color: C.orange, cursor: "pointer", textDecoration: "underline" }}>Planning</a> pour affecter les chantiers.</div>
          </div>
        )
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {tasksByPhase.map(({ phase, tasks }) => (
            <div key={phase.id}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8, marginBottom: 6,
                paddingBottom: 4, borderBottom: `2px solid ${phase.color}`,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: phase.color }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: phase.color }}>{phase.label}</span>
                <span style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>
                  {tasks.length} tâche{tasks.length > 1 ? "s" : ""}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {tasks.map(task => {
                  const entry = pointage.entries[task.key] || { pct: 0, realMin: 0, realOps: [...task.ops], status: "" as const, raison: "", reportTo: "", reportOps: [], note: "" };
                  const isDone = entry.status === "fait";
                  const isPartial = entry.status === "partiel";
                  const isNotDone = entry.status === "pasfait";
                  const isExpanded = expandedKey === task.key;
                  const needsDetail = isPartial || isNotDone;

                  return (
                    <div key={task.key} style={{
                      display: "flex", flexDirection: "column",
                      background: isDone ? C.green + "0A" : isPartial ? C.orange + "0A" : isNotDone ? C.red + "0A" : C.s1,
                      border: `1px solid ${isDone ? C.green + "44" : isPartial ? C.orange + "44" : isNotDone ? C.red + "44" : C.border}`,
                      borderLeft: `3px solid ${phase.color}`,
                      borderRadius: 5, overflow: "hidden",
                      opacity: isDone ? 0.75 : 1,
                    }}>
                      <div style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        {/* Créneau horaire — clic pour fixer manuellement */}
                        {(() => {
                          const t = taskTimings.get(task.key);
                          if (!t) return null;
                          const isEditingHour = editingHourKey === task.key;
                          return (
                            <div style={{ position: "relative" }}>
                              <button
                                onClick={() => setEditingHourKey(isEditingHour ? null : task.key)}
                                title={t.manual ? "Heure fixée manuellement — clic pour modifier" : "Heure auto — clic pour fixer manuellement"}
                                style={{
                                  minWidth: 70, textAlign: "center", padding: "4px 8px",
                                  background: t.manual ? phase.color + "44" : phase.color + "18",
                                  border: `1px solid ${phase.color}${t.manual ? "" : "55"}`,
                                  borderRadius: 4, color: phase.color, fontWeight: 700, fontSize: 11,
                                  cursor: "pointer",
                                }}
                              >
                                <div>{fmtHour(t.startHour)}{t.manual ? " ✎" : ""}</div>
                                <div style={{ fontSize: 9, opacity: 0.8 }}>→ {fmtHour(t.endHour)}</div>
                              </button>
                              {isEditingHour && (
                                <HourEditor
                                  startHour={t.startHour}
                                  durationMin={t.durationMin}
                                  isManual={t.manual}
                                  color={phase.color}
                                  onChange={(start, dur) => {
                                    updateEntry(task.key, { manualStart: start, manualDur: dur });
                                  }}
                                  onReset={() => {
                                    updateEntry(task.key, { manualStart: undefined, manualDur: undefined });
                                    setEditingHourKey(null);
                                  }}
                                  onClose={() => setEditingHourKey(null)}
                                />
                              )}
                            </div>
                          );
                        })()}
                        <div style={{ minWidth: 200, flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 10, fontWeight: 800, color: phase.color, padding: "1px 6px", background: phase.color + "22", borderRadius: 3 }}>{task.postId}</span>
                            <span style={{ fontSize: 10, color: C.muted }}>{postShortLabel(task.postId)}</span>
                            {task.estimatedMin > 0 && (
                              <span style={{ fontSize: 9, color: C.muted }}>
                                · estimé {task.estimatedMin >= 60 ? `${Math.round(task.estimatedMin / 6) / 10}h` : `${task.estimatedMin} min`}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 2 }}>{task.chantier}</div>
                          {task.ops.length > 0 && (
                            <div style={{ fontSize: 10, color: C.sec, marginTop: 2 }}>
                              👤 {task.ops.join(", ")}
                            </div>
                          )}
                        </div>

                        <div style={{ display: "flex", gap: 3 }}>
                          <button onClick={() => updateEntry(task.key, { pct: 100, status: "fait" })}
                            style={btnAction(isDone, C.green)}>
                            ✓ Fait
                          </button>
                          {[25, 50, 75].map(p => (
                            <button key={p} onClick={() => updateEntry(task.key, { pct: p, status: "partiel" })}
                              style={btnAction(isPartial && entry.pct === p, C.orange)}>
                              {p}%
                            </button>
                          ))}
                          <button onClick={() => updateEntry(task.key, { pct: 0, status: "pasfait" })}
                            style={btnAction(isNotDone, C.red)}>
                            ✗
                          </button>
                        </div>

                        {(needsDetail || entry.realMin > 0) && (
                          <button onClick={() => setExpandedKey(isExpanded ? null : task.key)}
                            style={{
                              padding: "4px 8px", fontSize: 10, fontWeight: 600,
                              background: isExpanded ? C.s2 : "transparent", border: `1px solid ${C.border}`,
                              borderRadius: 3, color: C.sec, cursor: "pointer",
                            }}>
                            {isExpanded ? "▴ Masquer" : "▾ Détail"}
                          </button>
                        )}
                      </div>

                      {(isExpanded || (needsDetail && !entry.raison)) && (
                        <div style={{
                          padding: "8px 12px", borderTop: `1px solid ${C.border}`,
                          background: C.bg + "55",
                          display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
                        }}>
                          <label style={{ fontSize: 10, color: C.sec, display: "flex", alignItems: "center", gap: 4 }}>
                            Durée :
                            <input type="number" min={0} value={entry.realMin || ""} placeholder="min"
                              onChange={e => updateEntry(task.key, { realMin: parseInt(e.target.value) || 0 })}
                              style={inpSm} />
                            <span style={{ fontSize: 9, color: C.muted }}>min</span>
                          </label>
                          {needsDetail && (
                            <>
                              <select value={entry.raison || ""} onChange={e => updateEntry(task.key, { raison: e.target.value })}
                                style={selSm}>
                                <option value="">Raison ?</option>
                                {RAISONS_BLOCAGE.map(r => <option key={r.id} value={r.id}>{r.icon} {r.label}</option>)}
                              </select>
                              <label style={{ fontSize: 10, color: C.sec, display: "flex", alignItems: "center", gap: 4 }}>
                                Reporter :
                                <input type="date" value={entry.reportTo || ""} onChange={e => updateEntry(task.key, { reportTo: e.target.value })}
                                  style={inpSm} />
                              </label>
                            </>
                          )}
                          <input value={entry.note || ""} onChange={e => updateEntry(task.key, { note: e.target.value })}
                            placeholder="Note (optionnel)"
                            style={{ ...inpSm, flex: 1, minWidth: 120 }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══ TOTAL OPÉRATEURS DU JOUR ════════════════════════════════════════ */}
      {opTotaux.length > 0 && (
        <div style={{
          background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6,
          padding: "10px 14px", marginTop: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>
              👥 Total opérateurs du jour
            </span>
            <span style={{ fontSize: 10, color: C.muted, flex: 1 }}>
              Production + Contrôle + Supervision + Livraison
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {opTotaux.map(o => {
              const totalH = Math.floor(o.total / 60);
              const totalM = o.total % 60;
              const formatLine = (label: string, min: number, color: string) => {
                if (min === 0) return null;
                const h = Math.floor(min / 60);
                const m = min % 60;
                const txt = h > 0 ? `${h}h${m > 0 ? String(m).padStart(2, "0") : ""}` : `${m} min`;
                return (
                  <div style={{ fontSize: 10, color, display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 6, height: 6, background: color, borderRadius: "50%" }} />
                    <span style={{ flex: 1 }}>{label}</span>
                    <span>{txt}</span>
                  </div>
                );
              };
              return (
                <div key={o.nom} style={{
                  background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5,
                  padding: "6px 10px", minWidth: 160,
                }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{o.nom}</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: C.green, marginLeft: "auto" }}>
                      {totalH}h{totalM > 0 ? String(totalM).padStart(2, "0") : ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {formatLine("Production",  o.production,  C.blue)}
                    {formatLine("Livraison",   o.livraison,   "#CE93D8")}
                    {formatLine("Contrôle",    o.controle,    C.purple)}
                    {formatLine("Supervision", o.supervision, C.teal)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const navBtn = {
  background: C.s2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text,
  padding: "6px 12px", cursor: "pointer", fontSize: 13, fontWeight: 600,
};
const inpSm = {
  width: 70, padding: "3px 6px", background: C.bg, border: `1px solid ${C.border}`,
  borderRadius: 3, color: C.text, fontSize: 11,
};
const selSm = {
  padding: "3px 6px", background: C.bg, border: `1px solid ${C.border}`,
  borderRadius: 3, color: C.text, fontSize: 10,
};
function btnAction(active: boolean, color: string) {
  return {
    padding: "5px 10px", fontSize: 11, fontWeight: 700,
    background: active ? color : C.s2,
    color: active ? "#000" : C.sec,
    border: "none", borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap" as const,
  };
}

// ── Panneau Contrôles & Supervision ──────────────────────────────────────────
// Permet à AJ ou aux experts de pointer le temps passé en contrôle qualité,
// supervision d'apprenti ou formation. Ces minutes ne sont PAS comptées
// dans la production machine, mais bien dans le total opérateur.

const CONTROLE_TYPES = [
  { id: "controle_qualite", label: "Contrôle qualité",   icon: "✓" },
  { id: "supervision",      label: "Supervision apprenti", icon: "👁" },
  { id: "formation",        label: "Formation",          icon: "🎓" },
];

function ControlesPanel({ controles, onChange }: {
  controles: ControleEntry[];
  onChange: (controles: ControleEntry[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ operateur: "", type: "controle_qualite", cible: "", realMin: "", note: "" });

  const totalMin = controles.reduce((s, c) => s + (c.realMin || 0), 0);

  const add = () => {
    if (!draft.operateur || !draft.realMin) return;
    const c: ControleEntry = {
      id: `ctrl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      operateur: draft.operateur,
      type: draft.type,
      cible: draft.cible,
      realMin: parseInt(draft.realMin) || 0,
      note: draft.note,
    };
    onChange([...controles, c]);
    setDraft({ operateur: "", type: "controle_qualite", cible: "", realMin: "", note: "" });
    setAdding(false);
  };

  const remove = (id: string) => onChange(controles.filter(c => c.id !== id));

  return (
    <div style={{
      background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6,
      padding: "10px 14px", marginBottom: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: controles.length > 0 || adding ? 8 : 0 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.purple }}>
          👁 Contrôles & supervision
        </span>
        {totalMin > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: C.purple, padding: "1px 8px", background: C.purple + "22", borderRadius: 3 }}>
            {Math.floor(totalMin / 60)}h{String(totalMin % 60).padStart(2, "0")} cumulé
          </span>
        )}
        <span style={{ fontSize: 10, color: C.muted, flex: 1 }}>
          Temps des experts hors production (qualité, formation, supervision)
        </span>
        {!adding && (
          <button onClick={() => setAdding(true)} style={{
            padding: "4px 10px", fontSize: 11, fontWeight: 700,
            background: C.purple + "22", border: `1px solid ${C.purple}55`,
            borderRadius: 4, color: C.purple, cursor: "pointer",
          }}>
            + Ajouter
          </button>
        )}
      </div>

      {adding && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", padding: "6px 0", borderTop: `1px solid ${C.border}` }}>
          <input value={draft.operateur} onChange={e => setDraft(p => ({ ...p, operateur: e.target.value }))}
            placeholder="Opérateur" style={{ padding: "4px 8px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 3, color: C.text, fontSize: 11, width: 110 }} />
          <select value={draft.type} onChange={e => setDraft(p => ({ ...p, type: e.target.value }))}
            style={{ padding: "4px 8px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 3, color: C.text, fontSize: 11 }}>
            {CONTROLE_TYPES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
          </select>
          <input value={draft.cible} onChange={e => setDraft(p => ({ ...p, cible: e.target.value }))}
            placeholder="Chantier / poste / —" style={{ padding: "4px 8px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 3, color: C.text, fontSize: 11, width: 140 }} />
          <input type="number" value={draft.realMin} onChange={e => setDraft(p => ({ ...p, realMin: e.target.value }))}
            placeholder="min" style={{ padding: "4px 8px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 3, color: C.text, fontSize: 11, width: 70 }} />
          <input value={draft.note} onChange={e => setDraft(p => ({ ...p, note: e.target.value }))}
            placeholder="Note (optionnel)" style={{ padding: "4px 8px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 3, color: C.text, fontSize: 11, flex: 1, minWidth: 100 }} />
          <button onClick={add} disabled={!draft.operateur || !draft.realMin} style={{
            padding: "4px 12px", fontSize: 11, fontWeight: 700,
            background: !draft.operateur || !draft.realMin ? C.s2 : C.purple,
            border: "none", borderRadius: 4,
            color: !draft.operateur || !draft.realMin ? C.muted : "#000",
            cursor: !draft.operateur || !draft.realMin ? "default" : "pointer",
          }}>
            OK
          </button>
          <button onClick={() => setAdding(false)} style={{
            padding: "4px 8px", fontSize: 10, color: C.muted,
            background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, cursor: "pointer",
          }}>
            ✕
          </button>
        </div>
      )}

      {controles.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: adding ? 6 : 0 }}>
          {controles.map(c => {
            const t = CONTROLE_TYPES.find(x => x.id === c.type);
            return (
              <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, padding: "3px 6px", background: C.bg, borderRadius: 3 }}>
                <span style={{ fontWeight: 700, color: C.text, minWidth: 80 }}>{c.operateur}</span>
                <span style={{ color: C.purple }}>{t?.icon} {t?.label || c.type}</span>
                {c.cible && <span style={{ color: C.sec }}>· {c.cible}</span>}
                <span style={{ fontWeight: 700, color: C.purple, marginLeft: "auto" }}>
                  {c.realMin >= 60 ? `${Math.floor(c.realMin / 60)}h${String(c.realMin % 60).padStart(2, "0")}` : `${c.realMin} min`}
                </span>
                {c.note && <span style={{ fontSize: 10, color: C.muted, fontStyle: "italic" }}>{c.note}</span>}
                <button onClick={() => remove(c.id)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 11 }}>✕</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Éditeur d'heure et durée pour une tâche ───────────────────────────────────

function HourEditor({
  startHour, durationMin, isManual, color, onChange, onReset, onClose,
}: {
  startHour: number;
  durationMin: number;
  isManual: boolean;
  color: string;
  onChange: (start: number, dur: number) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hour, setHour] = useState(Math.floor(startHour));
  const [minute, setMinute] = useState(Math.round((startHour - Math.floor(startHour)) * 60));
  const [dur, setDur] = useState(durationMin);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const apply = () => {
    const start = hour + minute / 60;
    onChange(start, dur);
    onClose();
  };

  return (
    <div ref={ref} style={{
      position: "absolute", zIndex: 100, top: "calc(100% + 4px)", left: 0,
      background: C.s1, border: `1px solid ${color}`, borderRadius: 6,
      padding: 10, minWidth: 240, boxShadow: "0 4px 16px #00000080",
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.sec, marginBottom: 6 }}>
        FIXER L'HEURE MANUELLEMENT
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: C.sec, minWidth: 50 }}>Début</span>
        <input type="number" min={6} max={20} value={hour}
          onChange={e => setHour(parseInt(e.target.value) || 8)}
          style={{ width: 50, padding: "4px 6px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 3, color: C.text, fontSize: 12 }} />
        <span style={{ fontSize: 11, color: C.sec }}>h</span>
        <input type="number" min={0} max={59} step={5} value={minute}
          onChange={e => setMinute(parseInt(e.target.value) || 0)}
          style={{ width: 50, padding: "4px 6px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 3, color: C.text, fontSize: 12 }} />
        <span style={{ fontSize: 11, color: C.sec }}>min</span>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 10, color: C.sec, minWidth: 50 }}>Durée</span>
        <input type="number" min={5} max={480} step={5} value={dur}
          onChange={e => setDur(parseInt(e.target.value) || 60)}
          style={{ width: 70, padding: "4px 6px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 3, color: C.text, fontSize: 12 }} />
        <span style={{ fontSize: 11, color: C.sec }}>min</span>
        <span style={{ fontSize: 10, color: C.muted, marginLeft: 4 }}>
          (≈ {(dur / 60).toFixed(1)}h)
        </span>
      </div>
      <div style={{ display: "flex", gap: 6, justifyContent: "space-between" }}>
        <button onClick={apply} style={{
          padding: "6px 12px", background: color, color: "#000",
          border: "none", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer",
        }}>
          OK
        </button>
        {isManual && (
          <button onClick={onReset} style={{
            padding: "6px 12px", background: "transparent", border: `1px solid ${C.border}`,
            borderRadius: 4, color: C.sec, fontSize: 11, cursor: "pointer",
          }}>
            ↺ Auto
          </button>
        )}
        <button onClick={onClose} style={{
          padding: "6px 10px", background: "transparent", border: `1px solid ${C.border}`,
          borderRadius: 4, color: C.muted, fontSize: 11, cursor: "pointer",
        }}>
          Annuler
        </button>
      </div>
    </div>
  );
}
