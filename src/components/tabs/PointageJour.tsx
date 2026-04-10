"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { C, hm, CommandeCC } from "@/lib/sial-data";

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
interface PointageEntry {
  pct: number;           // 0-100
  realMin: number;       // temps réel DURÉE de la tâche en minutes (pas par personne)
  realOps: string[];     // qui a réellement travaillé dessus
  status: "fait" | "partiel" | "pasfait" | "";
  reportTo: string;      // date YYYY-MM-DD si reporté
  note: string;
}
type PointageData = Record<string, PointageEntry>; // "postId|chantier" → entry

const POST_COLORS: Record<string, string> = {
  C2:"#42A5F5",C3:"#42A5F5",C4:"#42A5F5",C5:"#42A5F5",C6:"#42A5F5",
  M1:"#FFA726",M2:"#FFA726",M3:"#FFA726",F1:"#FFA726",F2:"#FFA726",F3:"#FFA726",MHS:"#FFA726",
  V1:"#26C6DA",V2:"#26C6DA",V3:"#26C6DA",
  IL:"#4DB6AC",IB:"#4DB6AC",I3:"#4DB6AC",I4:"#4DB6AC",
  AUT:"#78909C",L4:"#CE93D8",L6:"#CE93D8",L7:"#CE93D8",
};

export default function PointageJour({ commandes, onPatch }: {
  commandes: CommandeCC[];
  onPatch: (id: string, updates: Record<string, unknown>) => void;
}) {
  const [date, setDate] = useState(() => localStr(new Date()));
  const [affData, setAffData] = useState<Record<string, CellData>>({});
  const [pointage, setPointage] = useState<PointageData>({});
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
      .then(data => { if (data && typeof data === "object" && !Array.isArray(data)) setPointage(data as PointageData); else setPointage({}); })
      .catch(() => setPointage({}));
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
    const entry = pointage[key] || { pct: 0, realMin: 0, status: "", reportTo: "", note: "" };
    save({ ...pointage, [key]: { ...entry, ...updates } });
  };

  const quickDone = (key: string) => updateEntry(key, { pct: 100, status: "fait" });
  const quickPartial = (key: string, pct: number) => updateEntry(key, { pct, status: "partiel" });
  const quickNotDone = (key: string) => updateEntry(key, { pct: 0, status: "pasfait" });

  // Navigation
  const prev = () => { const d = new Date(date + "T00:00:00"); d.setDate(d.getDate() - 1); if (d.getDay() === 0) d.setDate(d.getDate() - 2); if (d.getDay() === 6) d.setDate(d.getDate() - 1); setDate(localStr(d)); };
  const next = () => { const d = new Date(date + "T00:00:00"); d.setDate(d.getDate() + 1); if (d.getDay() === 0) d.setDate(d.getDate() + 1); if (d.getDay() === 6) d.setDate(d.getDate() + 2); setDate(localStr(d)); };
  const goToday = () => setDate(localStr(new Date()));

  const doneCount = dayTasks.filter(t => pointage[t.key]?.status === "fait").length;
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
            const entry = pointage[task.key] || { pct: 0, realMin: 0, realOps: [...task.ops], status: "", reportTo: "", note: "" };
            if (!entry.realOps) entry.realOps = [...task.ops]; // migration
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

                  {/* Report si partiel ou pas fait */}
                  {(isPartial || entry.status === "pasfait") && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 10, color: C.orange }}>Reporter à :</span>
                      <input type="date" value={entry.reportTo}
                        onChange={e => updateEntry(task.key, { reportTo: e.target.value })}
                        style={{ padding: "2px 6px", background: C.bg, border: `1px solid ${C.orange}44`, borderRadius: 3, color: C.text, fontSize: 10 }} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
