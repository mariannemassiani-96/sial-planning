"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { C, calcCheminCritique, fmtDate, CommandeCC, JOURS_FERIES, getWeekNum, specialMultiplier } from "@/lib/sial-data";
import { postShortLabel, type Phase as WorkPostPhase } from "@/lib/work-posts";
import { getRoutage } from "@/lib/routage-production";

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
}
interface ImpreveEntry {
  label: string; postId: string; realMin: number; ops: string[]; raison: string;
}
type PointageData = { entries: Record<string, PointageEntry>; imprevu: ImpreveEntry[] };

interface CellData { ops: string[]; cmds: string[]; extras?: string[] }

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
      for (const ligne of lignes) {
        const lType = ligne.type || cmd.type;
        if (lType === "intervention_chantier") continue;
        const lQte = parseInt(ligne.quantite) || cmd.quantite || 1;
        const lHs = lType === "hors_standard"
          ? { t_coupe: ligne.hs_t_coupe, t_montage: ligne.hs_t_montage, t_vitrage: ligne.hs_t_vitrage }
          : a.hsTemps;
        const lSf = specialMultiplier(parseFloat(ligne?.largeur_mm) || parseFloat(ligne?.largeur) || 0);
        const routage = getRoutage(lType, lQte, lHs as Record<string, unknown> | null, lSf);
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
  // On enchaîne les tâches dans la matinée (8h-12h) puis l'après-midi (13h-17h)
  // par poste, en utilisant leur estimatedMin (avec un minimum 30 min pour ne
  // pas écraser visuellement les tâches sans estimation).
  const taskTimings = useMemo(() => {
    const map = new Map<string, { startHour: number; endHour: number; durationMin: number }>();
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
      // Si plusieurs ops sur la cellule, on suppose qu'ils traitent en parallèle :
      // on divise la durée totale par le nombre d'ops. Sinon, séquentiel.
      const nbOps = Math.max(1, ts[0]?.ops.length || 1);
      let cursor = startBase;
      for (const t of ts) {
        // Durée minimale 30 min pour visibilité ; bornée à la fin du créneau
        const rawDur = Math.max(30, t.estimatedMin / nbOps);
        const start = cursor;
        const remaining = (endBase - start) * 60;
        const dur = Math.min(rawDur, remaining);
        const end = start + dur / 60;
        map.set(t.key, { startHour: start, endHour: end, durationMin: Math.round(dur) });
        cursor = end;
        if (cursor >= endBase) break;
      }
    }
    return map;
  }, [dayTasks]);

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
  const retards = useMemo(() => {
    return commandes
      .map(c => ({ cmd: c, cc: calcCheminCritique(c) }))
      .filter(x => x.cc?.enRetard && (x.cmd as any).statut !== "livre" && (x.cmd as any).statut !== "annulee" && (x.cmd as any).statut !== "terminee")
      .sort((a, b) => (b.cc?.retardJours || 0) - (a.cc?.retardJours || 0));
  }, [commandes]);

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
          <button onClick={toggleMode} title="Bascule mode du jour" style={{
            padding: "8px 14px",
            background: mode === "FRAPPES" ? "#FFA72622" : "#66BB6A22",
            border: `2px solid ${mode === "FRAPPES" ? "#FFA726" : "#66BB6A"}`,
            borderRadius: 6, color: mode === "FRAPPES" ? "#FFA726" : "#66BB6A",
            fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
          }}>
            Mode : {mode === "FRAPPES" ? "Frappes" : "Coulissants"}
          </button>
        </div>
      </div>

      {totalTasks > 0 && (
        <div style={{ height: 6, background: C.s2, borderRadius: 3, overflow: "hidden", marginBottom: 14 }}>
          <div style={{ width: `${pctGlobal}%`, height: "100%", background: pctGlobal >= 100 ? C.green : pctGlobal >= 50 ? C.orange : C.red, transition: "width 0.3s" }} />
        </div>
      )}

      {/* ══ ALERTES RETARDS ═════════════════════════════════════════════════ */}
      {retards.length > 0 && (
        <div style={{
          background: C.red + "10", border: `1px solid ${C.red}55`, borderRadius: 6,
          padding: "10px 14px", marginBottom: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 14 }}>⚠</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: C.red }}>
              {retards.length} commande{retards.length > 1 ? "s" : ""} en retard
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {retards.slice(0, 6).map(({ cmd, cc }) => {
              const a = cmd as any;
              return (
                <div key={String(cmd.id)} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 11 }}>
                  <span style={{ minWidth: 50, fontWeight: 700, color: C.red }}>+{cc?.retardJours}j</span>
                  <span style={{ fontWeight: 700, color: C.text }}>{a.client}</span>
                  <span style={{ color: C.sec }}>{a.ref_chantier || "—"}</span>
                  <span style={{ color: C.muted, fontSize: 10 }}>livraison {fmtDate(a.date_livraison_souhaitee)}</span>
                </div>
              );
            })}
            {retards.length > 6 && (
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                + {retards.length - 6} autre{retards.length - 6 > 1 ? "s" : ""}
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
                        {/* Créneau horaire */}
                        {(() => {
                          const t = taskTimings.get(task.key);
                          if (!t) return null;
                          return (
                            <div style={{
                              minWidth: 70, textAlign: "center", padding: "4px 8px",
                              background: phase.color + "18", border: `1px solid ${phase.color}55`,
                              borderRadius: 4, color: phase.color, fontWeight: 700, fontSize: 11,
                            }}>
                              <div>{fmtHour(t.startHour)}</div>
                              <div style={{ fontSize: 9, opacity: 0.8 }}>→ {fmtHour(t.endHour)}</div>
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
