"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { C, JOURS_FERIES, isWorkday, EQUIPE, getWeekNum as getWeekNumUtil, toSemaineId as toSemaineIdUtil } from "@/lib/sial-data";
import { H, Card } from "@/components/ui";

// ── Couleurs par opérateur ────────────────────────────────────────────────────
const OP_COLORS: Record<string, string> = {
  guillaume: "#CE93D8", momo: "#4DB6AC", bruno: "#FFA726",
  ali: "#26C6DA", jp: "#FF7043", jf: "#66BB6A",
  michel: "#42A5F5", alain: "#FFCA28", francescu: "#AB47BC",
  julien: "#80CBC4", laurent: "#A5D6A7",
  mateo: "#EF5350", kentin: "#7E57C2",
};

const POSTES_LABELS: Record<string, string> = {
  logistique: "Logistique", isula: "ISULA", hors_std: "Hors-std",
  frappes: "Frappes", coulissant: "Coulissant", coupe: "Coupe", vitrage: "Vitrage",
};

// Build EQUIPE_SIAL from central EQUIPE config
const EQUIPE_SIAL = EQUIPE.map(op => {
  // Calculer les minutes par jour normal et vendredi
  // h = heures/semaine, vendrediOff = absent vendredi
  const jours = op.vendrediOff ? 4 : 5;
  const totalMin = op.h * 60;
  // Pour ceux à 39h : 4×8h + 7h = 39h → L-J=480, V=420
  // Pour ceux à 35h : 5×7h → tous les jours=420
  // Pour ceux à 36h (JP) : 4×8h + 4h → L-J=480, V=240
  // Pour ceux à 30h (Alain) : 4×7.5h → L-J=450, V=0
  let minLJ: number, minV: number;
  if (op.vendrediOff) {
    minLJ = Math.round(totalMin / jours);
    minV = 0;
  } else if (op.h === 39) {
    minLJ = 480; minV = 420; // 8h L-J, 7h V
  } else if (op.h === 36) {
    minLJ = 480; minV = 240; // 8h L-J, 4h V (vendredi matin)
  } else {
    // 35h → 7h/jour uniformes
    minLJ = Math.round(totalMin / 5);
    minV = Math.round(totalMin / 5);
  }
  return {
    id: op.id,
    nom: op.nom,
    poste: POSTES_LABELS[op.poste] || op.poste,
    c: OP_COLORS[op.id] || C.sec,
    competences: op.competences,
    minLJ,
    minV,
  };
});

const STD_MIN = 480; // référence 8h (pour la colorimétrie)

// ── Plan type: overrides uniquement ──────────────────────────────────────────
// { "jean-pierre": { "2026-03-30": 240 }, ... }
type PlanRH = Record<string, Record<string, number>>;

// ── Date helpers ──────────────────────────────────────────────────────────────
function localStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(s: string, n: number): string {
  const d = new Date(s + "T00:00:00");
  d.setDate(d.getDate() + n);
  return localStr(d);
}
function getMondayOf(s: string): string {
  const d = new Date(s + "T00:00:00");
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return localStr(d);
}
const getWeekNum = getWeekNumUtil;
function hm(min: number): string {
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
}
function semaineId(mondayStr: string): string {
  return toSemaineIdUtil(mondayStr);
}

// ── Résoudre la disponibilité effective d'un membre pour un jour ──────────────
function getDispo(plan: PlanRH, memberId: string, day: string): number {
  if (!isWorkday(day)) return 0;
  const override = plan[memberId]?.[day];
  if (override !== undefined) return override;
  // Minutes par défaut selon le jour (vendredi = 4 = index du jour)
  const membre = EQUIPE_SIAL.find(m => m.id === memberId);
  if (!membre) return STD_MIN;
  const dow = new Date(day + "T00:00:00").getDay(); // 0=dim, 5=ven
  return dow === 5 ? membre.minV : membre.minLJ;
}

// ── Cell color based on minutes ───────────────────────────────────────────────
function dispoColor(min: number): string {
  if (min === 0) return C.red;
  if (min >= STD_MIN) return C.green;
  return C.orange;
}

// ── Presets ───────────────────────────────────────────────────────────────────
const PRESETS = [
  { label: "Absent", min: 0 },
  { label: "4h",     min: 240 },
  { label: "8h",     min: 480 },
];

// ── Inline cell editor ────────────────────────────────────────────────────────
function CellEditor({
  value,
  onChange,
  onClose,
}: {
  value: number;
  onChange: (v: number) => void;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState(false);
  const [customVal, setCustomVal] = useState(String(Math.round(value / 60)));
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        zIndex: 100,
        top: "100%",
        left: 0,
        background: C.s2,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        padding: "8px 10px",
        minWidth: 160,
        boxShadow: "0 4px 16px #00000060",
      }}
    >
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: custom ? 8 : 0 }}>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => { onChange(p.min); onClose(); }}
            style={{
              padding: "4px 9px",
              background: value === p.min ? dispoColor(p.min) + "33" : C.s1,
              border: `1px solid ${value === p.min ? dispoColor(p.min) : C.border}`,
              borderRadius: 4,
              color: value === p.min ? dispoColor(p.min) : C.sec,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setCustom((v) => !v)}
          style={{
            padding: "4px 9px",
            background: custom ? C.blue + "22" : C.s1,
            border: `1px solid ${custom ? C.blue : C.border}`,
            borderRadius: 4,
            color: custom ? C.blue : C.sec,
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          ✕ Autre
        </button>
      </div>
      {custom && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
          <input
            autoFocus
            type="number"
            min={0}
            max={8}
            step={0.5}
            value={customVal}
            onChange={(e) => setCustomVal(e.target.value)}
            style={{
              width: 64,
              padding: "3px 6px",
              background: C.s1,
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              color: C.text,
              fontSize: 12,
            }}
          />
          <span style={{ fontSize: 11, color: C.sec }}>h</span>
          <button
            onClick={() => {
              const h = parseFloat(customVal);
              if (!isNaN(h) && h >= 0 && h <= 8) {
                onChange(Math.round(h * 60));
                onClose();
              }
            }}
            style={{
              padding: "3px 10px",
              background: C.blue + "22",
              border: `1px solid ${C.blue}`,
              borderRadius: 4,
              color: C.blue,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            OK
          </button>
        </div>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function PlanningRH({ commandes: _c }: { commandes: any[] }) {
  const today = localStr(new Date());
  const [anchor, setAnchor] = useState(getMondayOf(today));
  const [plan, setPlan] = useState<PlanRH>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "unsaved" | "idle">("idle");
  // editing: { memberId, day }
  const [editing, setEditing] = useState<{ memberId: string; day: string } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(anchor, i));
  const semaine = semaineId(anchor);

  // ── Load ───────────────────────────────────────────────────────────────────
  const loadPlan = useCallback(async () => {
    setLoading(true);
    setEditing(null);
    try {
      const res = await fetch(`/api/planning-rh?semaine=${encodeURIComponent(semaine)}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.plan) {
          setPlan(data.plan);
          setSaveStatus("saved");
          setLoading(false);
          return;
        }
      }
    } catch {}
    setPlan({});
    setSaveStatus("idle");
    setLoading(false);
  }, [semaine]);

  useEffect(() => { loadPlan(); }, [loadPlan]);

  // ── Auto-save with debounce ────────────────────────────────────────────────
  const scheduleSave = useCallback((newPlan: PlanRH) => {
    setSaveStatus("unsaved");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await fetch("/api/planning-rh", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ semaine, plan: newPlan }),
        });
        setSaveStatus("saved");
      } catch {
        setSaveStatus("unsaved");
      } finally {
        setSaving(false);
      }
    }, 800);
  }, [semaine]);

  // ── Override a cell ────────────────────────────────────────────────────────
  const setDispo = useCallback((memberId: string, day: string, minutes: number) => {
    setPlan((prev) => {
      const memberPlan = { ...(prev[memberId] || {}) };
      // If restoring standard value, remove override
      if (minutes === STD_MIN) {
        delete memberPlan[day];
      } else {
        memberPlan[day] = minutes;
      }
      const next: PlanRH = { ...prev };
      if (Object.keys(memberPlan).length === 0) {
        delete next[memberId];
      } else {
        next[memberId] = memberPlan;
      }
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  // ── Reset week ─────────────────────────────────────────────────────────────
  const resetWeek = async () => {
    setPlan({});
    setEditing(null);
    setSaving(true);
    try {
      await fetch("/api/planning-rh", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semaine, plan: {} }),
      });
      setSaveStatus("saved");
    } catch {
      setSaveStatus("unsaved");
    } finally {
      setSaving(false);
    }
  };

  // ── Column totals (per day) ────────────────────────────────────────────────
  function dayTotal(day: string): number {
    return EQUIPE_SIAL.reduce((sum, m) => sum + getDispo(plan, m.id, day), 0);
  }

  // ── Row totals (per member) ────────────────────────────────────────────────
  function memberTotal(memberId: string): number {
    return weekDays.reduce((sum, day) => sum + getDispo(plan, memberId, day), 0);
  }

  const JOURS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven"];

  if (loading) return (
    <div style={{ textAlign: "center", padding: 60, color: C.sec }}>Chargement…</div>
  );

  return (
    <div>
      <H c={C.purple}>Disponibilités Équipe SIAL</H>

      {/* Navigation semaine */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <button
          onClick={() => setAnchor((p) => addDays(getMondayOf(p), -7))}
          style={{ padding: "5px 12px", background: C.s1, border: `1px solid ${C.border}`, borderRadius: 4, color: C.sec, cursor: "pointer", fontSize: 13 }}
        >
          ← Semaine précédente
        </button>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text, minWidth: 240, textAlign: "center" }}>
          Sem.&nbsp;{getWeekNum(anchor)}&nbsp;—&nbsp;
          {new Date(anchor + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}
          &nbsp;→&nbsp;
          {new Date(addDays(anchor, 4) + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}
        </span>
        <button
          onClick={() => setAnchor((p) => addDays(getMondayOf(p), 7))}
          style={{ padding: "5px 12px", background: C.s1, border: `1px solid ${C.border}`, borderRadius: 4, color: C.sec, cursor: "pointer", fontSize: 13 }}
        >
          Semaine suivante →
        </button>
        <button
          onClick={() => setAnchor(getMondayOf(today))}
          style={{ padding: "5px 10px", background: C.s1, border: `1px solid ${C.border}`, borderRadius: 4, color: C.sec, cursor: "pointer", fontSize: 11 }}
        >
          Cette semaine
        </button>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {saving && (
            <span style={{ fontSize: 10, color: C.sec }}>Sauvegarde…</span>
          )}
          {!saving && saveStatus === "saved" && (
            <span style={{ fontSize: 10, color: C.green }}>✓ Sauvegardé</span>
          )}
          {!saving && saveStatus === "unsaved" && (
            <span style={{ fontSize: 10, color: C.orange }}>● Non sauvegardé</span>
          )}
          <button
            onClick={resetWeek}
            style={{
              padding: "5px 12px",
              background: C.red + "18",
              border: `1px solid ${C.red}55`,
              borderRadius: 4,
              color: C.red,
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            Réinitialiser la semaine
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", marginBottom: 20 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 160 }} />
            {weekDays.map((d) => <col key={d} />)}
            <col style={{ width: 90 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ padding: "8px 10px", background: C.s2, border: `1px solid ${C.border}`, fontSize: 10, color: C.sec, textAlign: "left" }}>
                MEMBRE
              </th>
              {weekDays.map((day, i) => {
                const ferie = JOURS_FERIES[day];
                const isToday = day === today;
                return (
                  <th key={day} style={{
                    padding: "7px 8px",
                    background: isToday ? C.orange + "22" : C.s2,
                    border: `1px solid ${C.border}`,
                    textAlign: "center",
                    fontSize: 11,
                  }}>
                    <div style={{ fontWeight: 700, color: isToday ? C.orange : ferie ? C.purple : C.text }}>
                      {JOURS_FR[i]}
                    </div>
                    <div style={{ fontSize: 9, color: C.sec, fontWeight: 400 }}>
                      {new Date(day + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}
                    </div>
                    {ferie && <div style={{ fontSize: 8, color: C.purple, marginTop: 1 }}>{ferie}</div>}
                  </th>
                );
              })}
              <th style={{ padding: "8px 6px", background: C.s2, border: `1px solid ${C.border}`, fontSize: 10, color: C.sec, textAlign: "center" }}>
                TOTAL SEM.
              </th>
            </tr>
          </thead>
          <tbody>
            {EQUIPE_SIAL.map((membre) => (
              <tr key={membre.id}>
                {/* Membre label */}
                <td style={{ padding: "8px 10px", background: C.s1, border: `1px solid ${C.border}`, verticalAlign: "middle" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: membre.c }}>{membre.nom}</div>
                  <div style={{ fontSize: 9, color: C.sec, marginTop: 1 }}>{membre.poste}</div>
                </td>

                {/* Day cells */}
                {weekDays.map((day) => {
                  const isHoliday = !!JOURS_FERIES[day] || !isWorkday(day);
                  const dispo = getDispo(plan, membre.id, day);
                  const hasOverride = plan[membre.id]?.[day] !== undefined;
                  const col = dispoColor(dispo);
                  const isEditing = editing?.memberId === membre.id && editing?.day === day;

                  return (
                    <td key={day} style={{
                      padding: "8px 8px",
                      background: isHoliday ? C.s2 + "88" : C.bg,
                      border: `1px solid ${isEditing ? membre.c : C.border}`,
                      textAlign: "center",
                      verticalAlign: "middle",
                      position: "relative",
                      cursor: isHoliday ? "default" : "pointer",
                      transition: "border-color 0.1s",
                    }}
                      onClick={() => {
                        if (isHoliday) return;
                        setEditing(isEditing ? null : { memberId: membre.id, day });
                      }}
                    >
                      {isHoliday ? (
                        <span style={{ fontSize: 10, color: C.muted }}>—</span>
                      ) : (
                        <>
                          <div style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: col,
                          }}>
                            {dispo === 0 ? "Absent" : hm(dispo)}
                          </div>
                          {hasOverride && dispo !== 0 && (
                            <div style={{ fontSize: 8, color: C.sec, marginTop: 2 }}>modifié</div>
                          )}
                          {/* Edit dropdown */}
                          {isEditing && (
                            <CellEditor
                              value={dispo}
                              onChange={(v) => setDispo(membre.id, day, v)}
                              onClose={() => setEditing(null)}
                            />
                          )}
                        </>
                      )}
                    </td>
                  );
                })}

                {/* Row total */}
                <td style={{
                  padding: "8px 6px",
                  background: C.s1,
                  border: `1px solid ${C.border}`,
                  textAlign: "center",
                  verticalAlign: "middle",
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
                    {hm(memberTotal(membre.id))}
                  </span>
                </td>
              </tr>
            ))}

            {/* Column totals row */}
            <tr>
              <td style={{
                padding: "8px 10px",
                background: C.s2,
                border: `1px solid ${C.border}`,
                fontSize: 10,
                fontWeight: 700,
                color: C.sec,
              }}>
                TOTAL / JOUR
              </td>
              {weekDays.map((day) => {
                const isHoliday = !!JOURS_FERIES[day] || !isWorkday(day);
                const total = dayTotal(day);
                return (
                  <td key={day} style={{
                    padding: "8px 8px",
                    background: C.s2,
                    border: `1px solid ${C.border}`,
                    textAlign: "center",
                    verticalAlign: "middle",
                  }}>
                    {isHoliday ? (
                      <span style={{ fontSize: 10, color: C.muted }}>—</span>
                    ) : (
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.cyan }}>
                        {hm(total)}
                      </span>
                    )}
                  </td>
                );
              })}
              {/* Grand total */}
              <td style={{
                padding: "8px 6px",
                background: C.s2,
                border: `1px solid ${C.border}`,
                textAlign: "center",
                verticalAlign: "middle",
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.cyan }}>
                  {hm(weekDays.reduce((s, d) => s + dayTotal(d), 0))}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <Card style={{ padding: "10px 14px", marginBottom: 24 }}>
        <div style={{ fontSize: 10, color: C.sec, fontWeight: 700, marginBottom: 8 }}>LÉGENDE</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: C.green }} />
            <span style={{ fontSize: 11, color: C.sec }}>8h00 — Journée complète</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: C.orange }} />
            <span style={{ fontSize: 11, color: C.sec }}>Demi-journée / partiel</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: C.red }} />
            <span style={{ fontSize: 11, color: C.sec }}>Absent</span>
          </div>
          <span style={{ fontSize: 10, color: C.muted, marginLeft: "auto" }}>
            Cliquer une cellule pour modifier la disponibilité
          </span>
        </div>
      </Card>
    </div>
  );
}
