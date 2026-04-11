"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { C, EQUIPE, hm, CommandeCC } from "@/lib/sial-data";

function localStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function weekId(mondayStr: string): string {
  const d = new Date(mondayStr + "T00:00:00");
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const w1 = new Date(jan4); w1.setDate(jan4.getDate() - ((jan4.getDay() || 7) - 1));
  const wn = Math.ceil((d.getTime() - w1.getTime()) / (7 * 86400000)) + 1;
  return `S${String(wn).padStart(2, "0")}`;
}
function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay(); d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return localStr(d);
}
const JOURS_LABELS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

interface CellData { ops: string[]; cmds: string[]; extras?: string[] }
// Raisons normalisées de non-réalisation
const RAISONS_BLOCAGE = [
  { id: "manque_temps", label: "Manque de temps", icon: "⏰" },
  { id: "manque_accessoire", label: "Manque accessoire", icon: "🔩" },
  { id: "manque_profil", label: "Manque profilé", icon: "📦" },
  { id: "manque_vitrage", label: "Manque vitrage", icon: "🪟" },
  { id: "manque_dossier", label: "Manque dossier fabrication", icon: "📋" },
  { id: "manque_info", label: "Manque information", icon: "❓" },
  { id: "panne_machine", label: "Panne machine", icon: "⚙" },
  { id: "probleme_qualite", label: "Problème qualité / reprise", icon: "⚠" },
  { id: "absence", label: "Absence opérateur", icon: "👤" },
  { id: "priorite_changee", label: "Priorité changée", icon: "🔄" },
  { id: "autre", label: "Autre", icon: "📝" },
];

interface PointageEntry {
  pct: number;
  realMin: number;
  realOps: string[];
  status: "fait" | "partiel" | "pasfait" | "";
  raison: string;        // id de RAISONS_BLOCAGE
  reportTo: string;
  reportOps: string[];   // qui reprend la tâche
  note: string;
}

interface ImpreveEntry {
  label: string;
  postId: string;
  realMin: number;
  ops: string[];
  raison: string;  // "avance" = fait en avance du lendemain, "imprevu" = pas planifié
}
type PointageData = { entries: Record<string, PointageEntry>; imprevu: ImpreveEntry[] };

const POST_COLORS: Record<string, string> = {
  C2:"#42A5F5",C3:"#42A5F5",C4:"#42A5F5",C5:"#42A5F5",C6:"#42A5F5",
  M1:"#FFA726",M2:"#FFA726",M3:"#FFA726",F1:"#FFA726",F2:"#FFA726",F3:"#FFA726",MHS:"#FFA726",
  V1:"#26C6DA",V2:"#26C6DA",V3:"#26C6DA",
  IL:"#4DB6AC",IB:"#4DB6AC",I3:"#4DB6AC",I4:"#4DB6AC",
  AUT:"#78909C",L4:"#CE93D8",L6:"#CE93D8",L7:"#CE93D8",
};

export default function PointageJour({ commandes: _commandes, onPatch: _onPatch }: {
  commandes: CommandeCC[];
  onPatch: (id: string, updates: Record<string, unknown>) => void;
}) {
  const [date, setDate] = useState(() => localStr(new Date()));
  const [affData, setAffData] = useState<Record<string, CellData>>({});
  const [pointage, setPointage] = useState<PointageData>({ entries: {}, imprevu: [] });
  const [newImprevu, setNewImprevu] = useState({ label: "", postId: "AUT", min: "" });
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dayOfWeek = new Date(date + "T00:00:00").getDay();
  const dayLabel = JOURS_LABELS[dayOfWeek];
  const monday = getMondayOf(date);
  const jourIdx = (() => { for (let i = 0; i < 5; i++) { const d = new Date(monday + "T00:00:00"); d.setDate(d.getDate() + i); if (localStr(d) === date) return i; } return -1; })();

  // Charger les affectations de la semaine
  useEffect(() => {
    fetch(`/api/planning/affectations?semaine=${monday}`)
      .then(r => r.ok ? r.json() : {})
      .then(data => {
        if (data && typeof data === "object") {
          const migrated: Record<string, CellData> = {};
          for (const [k, v] of Object.entries(data)) {
            if (Array.isArray(v)) migrated[k] = { ops: v as string[], cmds: [] };
            else if (v && typeof v === "object" && "ops" in (v as any)) migrated[k] = v as CellData;
          }
          setAffData(migrated);
        }
      }).catch(() => {});
  }, [monday]);

  // Charger le pointage du jour
  useEffect(() => {
    fetch(`/api/pointage-jour?date=${date}`)
      .then(r => r.ok ? r.json() : {})
      .then(data => {
        if (data && typeof data === "object" && !Array.isArray(data)) {
          const d = data as any;
          if (d.entries) setPointage({ entries: d.entries || {}, imprevu: d.imprevu || [] });
          else setPointage({ entries: d as Record<string, PointageEntry>, imprevu: [] });
        } else { setPointage({ entries: {}, imprevu: [] }); }
      })
      .catch(() => setPointage({ entries: {}, imprevu: [] }));
  }, [date]);

  // Sauvegarde auto
  const save = useCallback((newData: PointageData) => {
    setPointage(newData);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      await fetch("/api/pointage-jour", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, data: newData }) }).catch(() => {});
      setSaving(false);
    }, 800);
  }, [date]);

  // Tâches du jour depuis les affectations
  const dayTasks = useMemo(() => {
    const tasks: Array<{ postId: string; demi: string; chantier: string; ops: string[]; extras: string[]; key: string }> = [];
    for (const [k, cell] of Object.entries(affData)) {
      const parts = k.split("|");
      if (parseInt(parts[1]) !== jourIdx) continue;
      const postId = parts[0];
      const demi = parts[2];
      // Chantiers
      for (const ch of (cell.cmds || [])) {
        tasks.push({ postId, demi, chantier: ch, ops: cell.ops || [], extras: [], key: `${postId}|${ch}` });
      }
      // Extras
      for (const ext of (cell.extras || [])) {
        tasks.push({ postId, demi, chantier: ext, ops: cell.ops || [], extras: [ext], key: `${postId}|${ext}` });
      }
      // Opérateurs sans chantier ni extra
      if ((!cell.cmds || cell.cmds.length === 0) && (!cell.extras || cell.extras.length === 0) && (cell.ops?.length || 0) > 0) {
        tasks.push({ postId, demi, chantier: "Poste " + postId, ops: cell.ops || [], extras: [], key: `${postId}|_poste` });
      }
    }
    // Dédupliquer par key (même chantier AM+PM = 1 seule ligne)
    const unique = new Map<string, typeof tasks[0]>();
    for (const t of tasks) {
      if (unique.has(t.key)) {
        const ex = unique.get(t.key)!;
        for (const o of t.ops) { if (!ex.ops.includes(o)) ex.ops.push(o); }
      } else {
        unique.set(t.key, { ...t });
      }
    }
    return Array.from(unique.values());
  }, [affData, jourIdx]);

  const updateEntry = (key: string, updates: Partial<PointageEntry>) => {
    const entry = pointage.entries[key] || { pct: 0, realMin: 0, realOps: [], status: "", raison: "", reportTo: "", reportOps: [], note: "" };
    save({ ...pointage, entries: { ...pointage.entries, [key]: { ...entry, ...updates } } });
  };

  const addImprevu = () => {
    if (!newImprevu.label.trim()) return;
    const imp: ImpreveEntry = { label: newImprevu.label.trim(), postId: newImprevu.postId, realMin: parseInt(newImprevu.min) || 0, ops: [], raison: "imprevu" };
    save({ ...pointage, imprevu: [...pointage.imprevu, imp] });
    setNewImprevu({ label: "", postId: "AUT", min: "" });
  };

  const removeImprevu = (idx: number) => {
    save({ ...pointage, imprevu: pointage.imprevu.filter((_, i) => i !== idx) });
  };

  const quickDone = (key: string) => updateEntry(key, { pct: 100, status: "fait" });
  const quickPartial = (key: string, pct: number) => updateEntry(key, { pct, status: "partiel" });
  const quickNotDone = (key: string) => updateEntry(key, { pct: 0, status: "pasfait" });

  // Navigation
  const prev = () => { const d = new Date(date + "T00:00:00"); d.setDate(d.getDate() - 1); if (d.getDay() === 0) d.setDate(d.getDate() - 2); if (d.getDay() === 6) d.setDate(d.getDate() - 1); setDate(localStr(d)); };
  const next = () => { const d = new Date(date + "T00:00:00"); d.setDate(d.getDate() + 1); if (d.getDay() === 0) d.setDate(d.getDate() + 1); if (d.getDay() === 6) d.setDate(d.getDate() + 2); setDate(localStr(d)); };
  const goToday = () => setDate(localStr(new Date()));

  const doneCount = dayTasks.filter(t => pointage.entries[t.key]?.status === "fait").length;
  const totalCount = dayTasks.length;
  const pctGlobal = totalCount > 0 ? Math.round(doneCount / totalCount * 100) : 0;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={prev} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, padding: "6px 12px", cursor: "pointer", fontSize: 14 }}>←</button>
        <button onClick={goToday} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.sec, padding: "6px 10px", cursor: "pointer", fontSize: 11 }}>Auj.</button>
        <button onClick={next} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, padding: "6px 12px", cursor: "pointer", fontSize: 14 }}>→</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{dayLabel} {new Date(date + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} — {weekId(monday)}</div>
          <div style={{ fontSize: 11, color: C.sec }}>{doneCount}/{totalCount} tâches terminées · {saving ? "Sauvegarde..." : "Sauvegardé"}</div>
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, color: pctGlobal >= 100 ? C.green : pctGlobal >= 50 ? C.orange : C.red }}>{pctGlobal}%</div>
      </div>

      {/* Barre de progression */}
      <div style={{ height: 8, background: C.s2, borderRadius: 4, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ width: `${pctGlobal}%`, height: "100%", background: pctGlobal >= 100 ? C.green : pctGlobal >= 50 ? C.orange : C.red, borderRadius: 4, transition: "width 0.3s" }} />
      </div>

      {dayTasks.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: C.sec }}>Aucune tâche planifiée ce jour. Vérifiez les affectations de {weekId(monday)}.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {dayTasks.map(task => {
            const entry = pointage.entries[task.key] || { pct: 0, realMin: 0, realOps: [...task.ops], status: "", raison: "", reportTo: "", reportOps: [], note: "" };
            if (!entry.realOps) entry.realOps = [...task.ops];
            const isDone = entry.status === "fait";
            const isPartial = entry.status === "partiel";
            const color = POST_COLORS[task.postId] || C.sec;

            return (
              <div key={task.key} style={{
                display: "flex", alignItems: "stretch", gap: 0,
                background: isDone ? C.green + "08" : isPartial ? C.orange + "08" : C.s1,
                border: `1px solid ${isDone ? C.green + "44" : isPartial ? C.orange + "44" : C.border}`,
                borderRadius: 6, overflow: "hidden", opacity: isDone ? 0.7 : 1,
              }}>
                {/* Barre colorée poste */}
                <div style={{ width: 4, background: color, flexShrink: 0 }} />

                {/* Contenu */}
                <div style={{ flex: 1, padding: "8px 12px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  {/* Poste + chantier */}
                  <div style={{ minWidth: 200 }}>
                    <span style={{ fontWeight: 700, color, fontSize: 12 }}>{task.postId}</span>
                    <span style={{ marginLeft: 8, fontWeight: 600, fontSize: 13 }}>{task.chantier}</span>
                    {task.ops.length > 0 && (
                      <div style={{ display: "flex", gap: 3, marginTop: 2, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 9, color: C.muted }}>Fait par :</span>
                        {task.ops.map(op => {
                          const isReal = (entry.realOps || task.ops).includes(op);
                          return (
                            <button key={op} onClick={() => {
                              const cur = entry.realOps || [...task.ops];
                              const next = isReal ? cur.filter(o => o !== op) : [...cur, op];
                              updateEntry(task.key, { realOps: next });
                            }} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, border: "none", cursor: "pointer", background: isReal ? C.green + "22" : C.s2, color: isReal ? C.green : C.muted, fontWeight: isReal ? 700 : 400 }}>
                              {op}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Boutons rapides */}
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => quickDone(task.key)} style={{ padding: "4px 12px", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: isDone ? C.green : C.s2, color: isDone ? "#000" : C.sec }}>✓ Fait</button>
                    {[25, 50, 75].map(p => (
                      <button key={p} onClick={() => quickPartial(task.key, p)} style={{ padding: "4px 8px", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 10, fontWeight: 600, background: isPartial && entry.pct === p ? C.orange : C.s2, color: isPartial && entry.pct === p ? "#000" : C.muted }}>{p}%</button>
                    ))}
                    <button onClick={() => quickNotDone(task.key)} style={{ padding: "4px 8px", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 10, color: entry.status === "pasfait" ? C.red : C.muted, background: entry.status === "pasfait" ? C.red + "22" : C.s2 }}>✕</button>
                  </div>

                  {/* Temps réel = durée de la tâche (pas par personne) */}
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 10, color: C.muted }}>Durée :</span>
                    <input type="number" min={0} value={entry.realMin || ""} placeholder="min"
                      onChange={e => updateEntry(task.key, { realMin: parseInt(e.target.value) || 0 })}
                      style={{ width: 50, padding: "3px 4px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 3, color: entry.realMin > 0 ? C.text : C.muted, fontSize: 11, textAlign: "center" }} />
                    <span style={{ fontSize: 10, color: C.muted }}>min</span>
                  </div>

                  {/* Raison + Report si partiel ou pas fait */}
                  {(isPartial || entry.status === "pasfait") && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 4, padding: "6px 0", borderTop: `1px solid ${C.border}` }}>
                      <select value={entry.raison || ""} onChange={e => updateEntry(task.key, { raison: e.target.value })}
                        style={{ padding: "3px 6px", background: C.bg, border: `1px solid ${C.orange}44`, borderRadius: 3, color: C.text, fontSize: 10 }}>
                        <option value="">Raison...</option>
                        {RAISONS_BLOCAGE.map(r => <option key={r.id} value={r.id}>{r.icon} {r.label}</option>)}
                      </select>
                      <input type="date" value={entry.reportTo} onChange={e => updateEntry(task.key, { reportTo: e.target.value })} placeholder="Reporter à"
                        style={{ padding: "3px 6px", background: C.bg, border: `1px solid ${C.orange}44`, borderRadius: 3, color: C.text, fontSize: 10 }} />
                      <input value={entry.note || ""} onChange={e => updateEntry(task.key, { note: e.target.value })} placeholder="Note..."
                        style={{ flex: 1, minWidth: 120, padding: "3px 6px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 3, color: C.text, fontSize: 10 }} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Résumé par opérateur — heures pointées vs théoriques */}
      {dayTasks.length > 0 && (() => {
        const isVendredi = dayOfWeek === 5;
        const opSummary: Record<string, { pointed: number; theorique: number }> = {};
        // Calculer heures pointées par opérateur
        for (const task of dayTasks) {
          const entry = pointage.entries[task.key];
          if (!entry || !entry.realMin || entry.realMin <= 0) continue;
          const ops = entry.realOps?.length > 0 ? entry.realOps : task.ops;
          const perOp = ops.length > 0 ? Math.round(entry.realMin / ops.length) : 0;
          for (const op of ops) {
            if (!opSummary[op]) {
              const eq = EQUIPE.find(e => e.nom === op);
              const maxDay = isVendredi
                ? (eq?.h === 39 ? 420 : eq?.h === 36 ? 240 : eq?.h === 35 ? 420 : eq?.h === 30 ? 0 : 420)
                : (eq?.h === 39 ? 480 : eq?.h === 36 ? 480 : eq?.h === 35 ? 420 : eq?.h === 30 ? 450 : 480);
              opSummary[op] = { pointed: 0, theorique: maxDay };
            }
            opSummary[op].pointed += perOp;
          }
        }
        // Ajouter imprévus
        for (const imp of pointage.imprevu) {
          if (imp.ops?.length && imp.realMin > 0) {
            const perOp = Math.round(imp.realMin / imp.ops.length);
            for (const op of imp.ops) {
              if (!opSummary[op]) opSummary[op] = { pointed: 0, theorique: 480 };
              opSummary[op].pointed += perOp;
            }
          }
        }
        const entries = Object.entries(opSummary).filter(([,v]) => v.theorique > 0 || v.pointed > 0);
        if (entries.length === 0) return null;

        return (
          <div style={{ marginTop: 16, background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Heures pointées par opérateur</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {entries.map(([op, data]) => {
                const isOver = data.pointed > data.theorique && data.theorique > 0;
                const isUnder = data.pointed < data.theorique * 0.7 && data.theorique > 0;
                const pct = data.theorique > 0 ? Math.round(data.pointed / data.theorique * 100) : 0;
                const col = isOver ? C.red : isUnder ? C.orange : C.green;
                return (
                  <div key={op} style={{ padding: "6px 10px", background: C.bg, border: `1px solid ${isOver ? C.red : C.border}`, borderRadius: 5, minWidth: 100, textAlign: "center" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 2 }}>{op}</div>
                    <div className="mono" style={{ fontSize: 13, fontWeight: 800, color: col }}>{hm(data.pointed)}</div>
                    <div style={{ fontSize: 9, color: C.muted }}>/ {hm(data.theorique)} ({pct}%)</div>
                    {isOver && (
                      <div style={{ fontSize: 9, color: C.red, fontWeight: 700, marginTop: 2 }}>
                        ⚠ +{hm(data.pointed - data.theorique)} heures sup ?
                      </div>
                    )}
                    {isUnder && data.pointed > 0 && (
                      <div style={{ fontSize: 9, color: C.orange, marginTop: 2 }}>
                        {hm(data.theorique - data.pointed)} non justifiées
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Tâches imprévues / faites en avance */}
      <div style={{ marginTop: 16, background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 14px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Tâches imprévues ou faites en avance</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input value={newImprevu.label} onChange={e => setNewImprevu(p => ({ ...p, label: e.target.value }))} placeholder="Ex: Changement outil, Tâche du lendemain..."
            style={{ flex: 1, minWidth: 200, padding: "5px 10px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontSize: 11 }} />
          <input type="number" value={newImprevu.min} onChange={e => setNewImprevu(p => ({ ...p, min: e.target.value }))} placeholder="min"
            style={{ width: 55, padding: "5px 6px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontSize: 11, textAlign: "center" }} />
          <button onClick={addImprevu} style={{ padding: "5px 14px", background: C.orange, border: "none", borderRadius: 4, color: "#000", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>+ Ajouter</button>
        </div>
        {pointage.imprevu.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {pointage.imprevu.map((imp, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: C.bg, borderRadius: 4, border: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 11, fontWeight: 600, flex: 1 }}>{imp.label}</span>
                {imp.realMin > 0 && <span className="mono" style={{ fontSize: 11, color: C.muted }}>{hm(imp.realMin)}</span>}
                <button onClick={() => removeImprevu(i)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 10 }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
