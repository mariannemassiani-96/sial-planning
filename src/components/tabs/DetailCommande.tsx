"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { C } from "@/lib/sial-data";
import { QC_CATALOG, QCCheckDef } from "@/lib/qc-catalog";
import { STATUT_LABELS, TASK_STATUT_LABELS } from "@/lib/planning-constants";

// ─── Types ────────────────────────────────────────────────────────────────────

interface QCCheckRecord {
  id: string;
  qcRef: string;
  label: string;
  result: "OK" | "NOK" | "REPRISE" | "REBUT" | null;
  value: string | null;
  checkedAt: string | null;
  checkedBy: string | null;
  actionTaken: string | null;
  taskId: string | null;
  fabItemId: string;
}

interface TaskRecord {
  id: string;
  label: string;
  estimatedMinutes: number;
  actualMinutes: number | null;
  status: string;
  sortOrder: number;
  scheduledDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  blockedReason: string | null;
  isBlocking: boolean;
  workPost: { id: string; label: string };
  assignments: { operator: { name: string } }[];
  qcChecks: QCCheckRecord[];
}

interface FabItemRecord {
  id: string;
  label: string;
  menuiserieType: string;
  quantity: number;
  matiere: string;
  isSpecial: boolean;
  specialType: string | null;
  widthMm: number | null;
  heightMm: number | null;
  tasks: TaskRecord[];
  qcChecks: QCCheckRecord[];
}

interface NonConformityRecord {
  id: string;
  fabItemId: string;
  qcRef: string | null;
  description: string;
  severity: "MINOR" | "MAJOR" | "BLOCKING";
  status: string;
  cause: string | null;
  action: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

interface FullOrder {
  id: string;
  refProF2: string;
  refChantier: string;
  clientName: string;
  deliveryDate: string;
  createdAt: string;
  status: string;
  notes: string | null;
  items: FabItemRecord[];
  nonConformities: NonConformityRecord[];
}

// ─── Work Posts ───────────────────────────────────────────────────────────────

const ALL_POSTS = [
  { id: "C1", label: "C1 — Déchargement" },
  { id: "C2", label: "C2 — Prépa barres" },
  { id: "C3", label: "C3 — Coupe LMT" },
  { id: "C4", label: "C4 — Coupe double tête" },
  { id: "C5", label: "C5 — Coupe renfort" },
  { id: "C6", label: "C6 — Soudure PVC" },
  { id: "M1", label: "M1 — Dormants coulissants" },
  { id: "M2", label: "M2 — Dormants galandage" },
  { id: "M3", label: "M3 — Portes ALU" },
  { id: "F1", label: "F1 — Dormants frappe" },
  { id: "F2", label: "F2 — Ouvrants + ferrage" },
  { id: "F3", label: "F3 — Mise en bois" },
  { id: "V1", label: "V1 — Vitrage" },
  { id: "V2", label: "V2 — Emballage/expédition" },
  { id: "I1", label: "I1 — Réception verre" },
  { id: "I2", label: "I2 — Coupe float" },
  { id: "I3", label: "I3 — Coupe intercalaire" },
  { id: "I4", label: "I4 — Butyle" },
  { id: "I5", label: "I5 — Assemblage" },
  { id: "I6", label: "I6 — Gaz + scellement" },
  { id: "I7", label: "I7 — Contrôle CEKAL" },
  { id: "I8", label: "I8 — Sortie chaîne" },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  orderId: string;
  onBack: () => void;
}

// ─── Step builder item ────────────────────────────────────────────────────────

interface StepDraft {
  tempId: string;
  workPostId: string;
  label: string;
  minutes: number;
  unit: "min" | "h";
}

// ─── Timeline event ───────────────────────────────────────────────────────────

interface TimelineEvent {
  ts: number;
  type: "started" | "done" | "blocked" | "qc" | "nc";
  label: string;
  detail: string;
  color: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}min`;
  if (min === 0) return `${h}h`;
  return `${h}h${String(min).padStart(2, "0")}min`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " +
    d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
  );
}

function daysRemaining(iso: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dl = new Date(iso);
  dl.setHours(0, 0, 0, 0);
  return Math.round((dl.getTime() - now.getTime()) / 86400000);
}

function daysColor(days: number): string {
  if (days > 5) return C.green;
  if (days >= 2) return C.orange;
  return C.red;
}

function taskStatusColor(status: string): string {
  switch (status) {
    case "DONE":        return C.green;
    case "IN_PROGRESS": return C.blue;
    case "BLOCKED":     return C.red;
    case "SKIPPED":     return C.muted;
    default:            return C.sec;
  }
}

function severityColor(severity: NonConformityRecord["severity"]): string {
  switch (severity) {
    case "BLOCKING": return C.red;
    case "MAJOR":    return C.orange;
    default:         return C.yellow;
  }
}

// ─── Shared style helpers ─────────────────────────────────────────────────────

const btn = (color: string, sm?: boolean): React.CSSProperties => ({
  background: color + "22",
  border: `1px solid ${color}55`,
  color,
  borderRadius: 5,
  padding: sm ? "3px 10px" : "5px 13px",
  fontSize: sm ? 11 : 12,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap" as const,
});

const inpStyle: React.CSSProperties = {
  background: C.bg,
  border: `1px solid ${C.border}`,
  borderRadius: 5,
  padding: "5px 9px",
  color: C.text,
  fontSize: 12,
  outline: "none",
};

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastState {
  msg: string;
  ok: boolean;
}

// ─── QC Accordion (per task) ─────────────────────────────────────────────────

function QCAccordion({
  task,
  onRefresh,
  showToast,
}: {
  task: TaskRecord;
  onRefresh: () => void;
  showToast: (msg: string, ok: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [actionInputs, setActionInputs] = useState<Record<string, string>>({});
  const [numericInputs, setNumericInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const catalog: QCCheckDef[] = QC_CATALOG[task.workPost.id] ?? [];

  const hasPendingBlocking = catalog.some((def) => {
    if (!def.isBlocking) return false;
    const rec = task.qcChecks.find((q) => q.qcRef === def.qcRef);
    return !rec || rec.result === null;
  });

  if (catalog.length === 0) return null;

  async function handleValidate(checkId: string | null, qcRef: string, result: "OK" | "NOK", numericVal?: string) {
    if (!checkId) {
      showToast("QC non créé en base — rafraîchir la page", false);
      return;
    }
    setSaving(checkId + result);
    try {
      const body: Record<string, string> = { result };
      if (numericVal) body.value = numericVal;
      const r = await fetch(`/api/planning/qc/${checkId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({})) as { message?: string };
        showToast(e.message ?? "Erreur validation QC", false);
      } else {
        showToast(`QC ${qcRef} : ${result === "OK" ? "Validé OK" : "NOK enregistré"}`, true);
        onRefresh();
      }
    } catch {
      showToast("Erreur réseau", false);
    } finally {
      setSaving(null);
    }
  }

  async function handleSaveAction(checkId: string, qcRef: string) {
    const action = actionInputs[checkId]?.trim();
    if (!action) return;
    setSaving(checkId + "action");
    try {
      const r = await fetch(`/api/planning/qc/${checkId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result: "NOK", actionTaken: action }),
      });
      if (!r.ok) {
        showToast("Erreur enregistrement action", false);
      } else {
        showToast(`Action QC ${qcRef} enregistrée`, true);
        onRefresh();
      }
    } catch {
      showToast("Erreur réseau", false);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <button
        style={{
          ...btn(hasPendingBlocking ? C.red : C.sec, true),
          borderColor: hasPendingBlocking ? C.red + "88" : C.border,
        }}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "▲" : "▼"} Contrôles qualité ({catalog.length}){hasPendingBlocking ? " ⚠ en attente" : ""}
      </button>

      {open && (
        <div
          style={{
            marginTop: 6,
            border: `1px solid ${hasPendingBlocking ? C.red + "55" : C.border}`,
            borderRadius: 5,
            overflow: "hidden",
          }}
        >
          {catalog.map((def) => {
            const rec = task.qcChecks.find((q) => q.qcRef === def.qcRef) ?? null;
            const isSavingOK  = saving === (rec?.id ?? "") + "OK";
            const isSavingNOK = saving === (rec?.id ?? "") + "NOK";
            const isSavingAct = saving === (rec?.id ?? "") + "action";

            return (
              <div
                key={def.qcRef}
                style={{
                  padding: "9px 12px",
                  borderBottom: `1px solid ${C.border}`,
                  background: C.s2,
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                }}
              >
                {/* Row 1: ref + label + blocking indicator */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ color: C.sec, fontSize: 10, fontWeight: 700 }}>{def.qcRef}</span>
                  {def.isBlocking && (
                    <span style={{ color: C.red, fontSize: 10 }} title="Contrôle bloquant">🔒</span>
                  )}
                  <span style={{ color: C.text, fontSize: 12 }}>{def.label}</span>
                  {!rec && (
                    <span style={{ color: C.muted, fontSize: 11, fontStyle: "italic" }}>En attente</span>
                  )}
                  {rec?.result === "OK" && (
                    <>
                      <span style={{ color: C.green, fontWeight: 700 }}>✓</span>
                      <span style={{ color: C.sec, fontSize: 11 }}>
                        {rec.checkedBy ?? ""}{rec.checkedAt ? ` — ${fmtDate(rec.checkedAt)}` : ""}
                      </span>
                    </>
                  )}
                  {rec?.result === "NOK" && (
                    <span style={{ color: C.red, fontWeight: 700 }}>✗ NOK</span>
                  )}
                  {rec?.result === "REPRISE" && (
                    <span style={{ color: C.orange, fontWeight: 700 }}>↻ REPRISE</span>
                  )}
                  {rec?.result === "REBUT" && (
                    <span style={{ color: C.red, fontWeight: 700 }}>⊗ REBUT</span>
                  )}
                </div>

                {/* Numeric input if needed (only when no result yet) */}
                {def.numericValue && (!rec || rec.result === null) && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <label style={{ fontSize: 11, color: C.sec }}>Valeur mesurée :</label>
                    <input
                      type="number"
                      style={{ ...inpStyle, width: 90 }}
                      value={numericInputs[def.qcRef] ?? ""}
                      onChange={(e) =>
                        setNumericInputs((prev) => ({ ...prev, [def.qcRef]: e.target.value }))
                      }
                      placeholder="0.0"
                    />
                  </div>
                )}

                {/* Action buttons for no result */}
                {(!rec || rec.result === null) && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      style={btn(C.green, true)}
                      disabled={isSavingOK}
                      onClick={() =>
                        handleValidate(rec?.id ?? null, def.qcRef, "OK", numericInputs[def.qcRef])
                      }
                    >
                      {isSavingOK ? "…" : "OK"}
                    </button>
                    <button
                      style={btn(C.red, true)}
                      disabled={isSavingNOK}
                      onClick={() =>
                        handleValidate(rec?.id ?? null, def.qcRef, "NOK", numericInputs[def.qcRef])
                      }
                    >
                      {isSavingNOK ? "…" : "NOK"}
                    </button>
                  </div>
                )}

                {/* Action taken field for NOK */}
                {rec?.result === "NOK" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 2 }}>
                    {rec.actionTaken ? (
                      <span style={{ color: C.sec, fontSize: 11 }}>
                        Action : {rec.actionTaken}
                      </span>
                    ) : (
                      <>
                        <input
                          type="text"
                          style={{ ...inpStyle, width: "100%" }}
                          placeholder="Action corrective prise…"
                          value={actionInputs[rec.id] ?? ""}
                          onChange={(e) =>
                            setActionInputs((prev) => ({ ...prev, [rec.id]: e.target.value }))
                          }
                        />
                        <button
                          style={btn(C.orange, true)}
                          disabled={isSavingAct}
                          onClick={() => handleSaveAction(rec.id, def.qcRef)}
                        >
                          {isSavingAct ? "Enregistrement…" : "Enregistrer action"}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Task Row ─────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  onRefresh,
  showToast,
}: {
  task: TaskRecord;
  onRefresh: () => void;
  showToast: (msg: string, ok: boolean) => void;
}) {
  const [showComplete, setShowComplete] = useState(false);
  const [showBlock, setShowBlock]       = useState(false);
  const [actualMin, setActualMin]       = useState<string>("");
  const [blockReason, setBlockReason]   = useState<string>("");
  const [saving, setSaving]             = useState(false);

  async function handleStart() {
    setSaving(true);
    try {
      const r = await fetch(`/api/planning/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "IN_PROGRESS" }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({})) as { message?: string };
        showToast(e.message ?? "Erreur démarrage tâche", false);
      } else {
        showToast(`${task.label} démarrée`, true);
        onRefresh();
      }
    } catch {
      showToast("Erreur réseau", false);
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete() {
    setSaving(true);
    try {
      const body: Record<string, number> = {};
      const parsed = parseInt(actualMin, 10);
      if (!isNaN(parsed) && parsed > 0) body.actualMinutes = parsed;
      const r = await fetch(`/api/planning/tasks/${task.id}/complete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({})) as { message?: string };
        showToast(e.message ?? "Erreur complétion tâche", false);
      } else {
        showToast(`${task.label} marquée terminée`, true);
        setShowComplete(false);
        onRefresh();
      }
    } catch {
      showToast("Erreur réseau", false);
    } finally {
      setSaving(false);
    }
  }

  async function handleBlock() {
    if (!blockReason.trim()) {
      showToast("Veuillez saisir une raison", false);
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`/api/planning/tasks/${task.id}/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: blockReason.trim() }),
      });
      if (!r.ok) {
        showToast("Erreur signalement problème", false);
      } else {
        showToast(`Problème signalé : ${task.label}`, true);
        setShowBlock(false);
        setBlockReason("");
        onRefresh();
      }
    } catch {
      showToast("Erreur réseau", false);
    } finally {
      setSaving(false);
    }
  }

  const operators = task.assignments.map((a) => a.operator.name).join(", ") || "—";
  const statusColor = taskStatusColor(task.status);
  const statusLabel = TASK_STATUT_LABELS[task.status] ?? task.status;
  const isDone = task.status === "DONE";
  const isInProgress = task.status === "IN_PROGRESS";
  const isPending = task.status === "PENDING";
  const isBlocked = task.status === "BLOCKED";

  return (
    <div
      style={{
        background: C.s2,
        border: `1px solid ${isBlocked ? C.red + "55" : C.border}`,
        borderRadius: 6,
        padding: "10px 13px",
        display: "flex",
        flexDirection: "column",
        gap: 7,
        marginBottom: 6,
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {/* Poste */}
        <span
          style={{
            background: C.blue + "22",
            border: `1px solid ${C.blue}44`,
            color: C.blue,
            borderRadius: 4,
            padding: "1px 7px",
            fontSize: 11,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          {task.workPost.id}
        </span>
        <span style={{ color: C.sec, fontSize: 11 }}>{task.workPost.label}</span>
        <span style={{ flex: 1 }} />
        {/* Times */}
        <span style={{ fontSize: 11, color: C.sec }}>
          Estimé : {fmtMin(task.estimatedMinutes)}
          {isDone && task.actualMinutes != null && (
            <> / Réel : {fmtMin(task.actualMinutes)}</>
          )}
        </span>
        {/* Operators */}
        <span style={{ fontSize: 11, color: C.muted }}>{operators}</span>
        {/* Status badge */}
        <span
          style={{
            background: statusColor + "22",
            border: `1px solid ${statusColor}55`,
            color: statusColor,
            borderRadius: 4,
            padding: "1px 8px",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {statusLabel}
        </span>
      </div>

      {/* Task label */}
      <div style={{ color: C.text, fontSize: 13, fontWeight: 500 }}>{task.label}</div>

      {/* Blocked reason */}
      {isBlocked && task.blockedReason && (
        <div
          style={{
            background: C.red + "11",
            border: `1px solid ${C.red}44`,
            borderRadius: 4,
            padding: "5px 9px",
            color: C.red,
            fontSize: 12,
          }}
        >
          ⚠ Bloqué : {task.blockedReason}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "flex-start" }}>
        {isPending && (
          <button style={btn(C.blue, true)} disabled={saving} onClick={handleStart}>
            {saving ? "…" : "Démarrer"}
          </button>
        )}

        {isInProgress && !showComplete && (
          <button style={btn(C.green, true)} onClick={() => setShowComplete(true)}>
            Marquer terminé
          </button>
        )}

        {isInProgress && showComplete && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <label style={{ fontSize: 11, color: C.sec }}>Temps réel (min) :</label>
            <input
              type="number"
              style={{ ...inpStyle, width: 80 }}
              placeholder={String(task.estimatedMinutes)}
              value={actualMin}
              onChange={(e) => setActualMin(e.target.value)}
              min={0}
            />
            <button style={btn(C.green, true)} disabled={saving} onClick={handleComplete}>
              {saving ? "Enregistrement…" : "Confirmer terminé"}
            </button>
            <button style={btn(C.sec, true)} onClick={() => setShowComplete(false)}>
              Annuler
            </button>
          </div>
        )}

        {!isDone && !isBlocked && !showBlock && (
          <button
            style={btn(C.orange, true)}
            onClick={() => setShowBlock(true)}
          >
            Signaler un problème
          </button>
        )}

        {showBlock && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <input
              type="text"
              style={{ ...inpStyle, minWidth: 200 }}
              placeholder="Raison du blocage…"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
            />
            <button style={btn(C.red, true)} disabled={saving} onClick={handleBlock}>
              {saving ? "Enregistrement…" : "Confirmer blocage"}
            </button>
            <button
              style={btn(C.sec, true)}
              onClick={() => {
                setShowBlock(false);
                setBlockReason("");
              }}
            >
              Annuler
            </button>
          </div>
        )}
      </div>

      {/* QC Accordion */}
      <QCAccordion task={task} onRefresh={onRefresh} showToast={showToast} />
    </div>
  );
}

// ─── Steps Builder ────────────────────────────────────────────────────────────

function StepsBuilder({
  fabItemId,
  existingTasks,
  onRefresh,
  showToast,
}: {
  fabItemId: string;
  existingTasks: TaskRecord[];
  onRefresh: () => void;
  showToast: (msg: string, ok: boolean) => void;
}) {
  const [steps, setSteps] = useState<StepDraft[]>(() => {
    if (existingTasks.length > 0) {
      return existingTasks.map((t) => ({
        tempId: t.id,
        workPostId: t.workPost.id,
        label: t.label,
        minutes: t.estimatedMinutes,
        unit: "min" as const,
      }));
    }
    return [];
  });
  const [saving, setSaving] = useState(false);
  const dragIndex = useRef<number | null>(null);

  function addStep() {
    setSteps((prev) => [
      ...prev,
      {
        tempId: `tmp-${Date.now()}-${Math.random()}`,
        workPostId: ALL_POSTS[0].id,
        label: "",
        minutes: 30,
        unit: "min",
      },
    ]);
  }

  function removeStep(idx: number) {
    setSteps((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateStep(idx: number, patch: Partial<StepDraft>) {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function onDragStart(e: React.DragEvent, idx: number) {
    dragIndex.current = idx;
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    const from = dragIndex.current;
    if (from === null || from === idx) return;
    setSteps((prev) => {
      const arr = [...prev];
      const [item] = arr.splice(from, 1);
      arr.splice(idx, 0, item);
      dragIndex.current = idx;
      return arr;
    });
  }

  function onDragEnd() {
    dragIndex.current = null;
  }

  const totalMinutes = steps.reduce((acc, s) => {
    const m = s.unit === "h" ? s.minutes * 60 : s.minutes;
    return acc + m;
  }, 0);

  async function handleSubmit() {
    if (steps.length === 0) {
      showToast("Aucune étape à valider", false);
      return;
    }
    for (const s of steps) {
      if (!s.workPostId || !s.label.trim()) {
        showToast("Chaque étape doit avoir un poste et un libellé", false);
        return;
      }
    }
    setSaving(true);
    try {
      const payload = steps.map((s, i) => ({
        workPostId: s.workPostId,
        label: s.label.trim(),
        estimatedMinutes: s.unit === "h" ? s.minutes * 60 : s.minutes,
        sortOrder: i + 1,
      }));
      const r = await fetch(`/api/planning/fab-items/${fabItemId}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: payload }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({})) as { message?: string; error?: string };
        showToast(e.message ?? e.error ?? "Erreur validation étapes", false);
      } else {
        showToast("Étapes validées avec succès", true);
        onRefresh();
      }
    } catch {
      showToast("Erreur réseau", false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        background: C.bg,
        border: `1px solid ${C.purple}55`,
        borderRadius: 6,
        padding: "12px 14px",
        marginTop: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: C.purple,
          }}
        >
          Constructeur d&apos;étapes
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: C.sec }}>
          Total : {fmtMin(totalMinutes)}
        </span>
      </div>

      {steps.map((step, idx) => (
        <div
          key={step.tempId}
          draggable
          onDragStart={(e) => onDragStart(e, idx)}
          onDragOver={(e) => onDragOver(e, idx)}
          onDragEnd={onDragEnd}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 6,
            padding: "6px 8px",
            background: C.s1,
            border: `1px solid ${C.border}`,
            borderRadius: 5,
            cursor: "grab",
            flexWrap: "wrap",
          }}
        >
          {/* Drag handle */}
          <span
            style={{ color: C.muted, cursor: "grab", userSelect: "none", fontSize: 14 }}
            title="Réorganiser"
          >
            ↕
          </span>

          {/* Work post select */}
          <select
            style={{ ...inpStyle, width: 190 }}
            value={step.workPostId}
            onChange={(e) => updateStep(idx, { workPostId: e.target.value })}
          >
            {ALL_POSTS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>

          {/* Label */}
          <input
            type="text"
            style={{ ...inpStyle, flex: 1, minWidth: 150 }}
            placeholder="Libellé de l'étape…"
            value={step.label}
            onChange={(e) => updateStep(idx, { label: e.target.value })}
          />

          {/* Duration */}
          <input
            type="number"
            style={{ ...inpStyle, width: 70 }}
            min={1}
            value={step.minutes}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v > 0) updateStep(idx, { minutes: v });
            }}
          />
          <select
            style={{ ...inpStyle, width: 60 }}
            value={step.unit}
            onChange={(e) => updateStep(idx, { unit: e.target.value as "min" | "h" })}
          >
            <option value="min">min</option>
            <option value="h">h</option>
          </select>

          {/* Remove */}
          <button
            style={{
              background: "transparent",
              border: "none",
              color: C.red,
              fontSize: 14,
              cursor: "pointer",
              padding: "0 4px",
            }}
            onClick={() => removeStep(idx)}
            title="Supprimer cette étape"
          >
            ✕
          </button>
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button style={btn(C.cyan, true)} onClick={addStep}>
          + Ajouter une étape
        </button>
        <button style={btn(C.green)} disabled={saving || steps.length === 0} onClick={handleSubmit}>
          {saving ? "Validation en cours…" : "Valider les étapes"}
        </button>
      </div>
    </div>
  );
}

// ─── Fab Item Section ─────────────────────────────────────────────────────────

function FabItemSection({
  item,
  onRefresh,
  showToast,
}: {
  item: FabItemRecord;
  onRefresh: () => void;
  showToast: (msg: string, ok: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 7,
        marginBottom: 10,
        overflow: "hidden",
      }}
    >
      {/* Section header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: "100%",
          background: C.s1,
          border: "none",
          borderBottom: expanded ? `1px solid ${C.border}` : "none",
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          cursor: "pointer",
          textAlign: "left",
          flexWrap: "wrap",
        }}
      >
        <span style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{item.label}</span>
        <span style={{ color: C.sec, fontSize: 12 }}>{item.menuiserieType}</span>
        <span
          style={{
            background: C.blue + "22",
            color: C.blue,
            border: `1px solid ${C.blue}44`,
            borderRadius: 4,
            padding: "1px 7px",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          × {item.quantity}
        </span>
        {item.matiere && (
          <span style={{ color: C.sec, fontSize: 12 }}>{item.matiere}</span>
        )}
        {item.widthMm && item.heightMm && (
          <span style={{ color: C.muted, fontSize: 11 }}>
            {item.widthMm} × {item.heightMm} mm
          </span>
        )}
        {item.isSpecial && (
          <span
            style={{
              background: C.yellow + "22",
              color: C.yellow,
              border: `1px solid ${C.yellow}55`,
              borderRadius: 4,
              padding: "1px 8px",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            SPÉCIAL
          </span>
        )}
        {item.specialType && (
          <span
            style={{
              background: C.orange + "22",
              color: C.orange,
              border: `1px solid ${C.orange}55`,
              borderRadius: 4,
              padding: "1px 8px",
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {item.specialType}
          </span>
        )}
        <span style={{ marginLeft: "auto", color: C.sec, fontSize: 13 }}>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div style={{ padding: "12px 14px", background: C.bg }}>
          {/* Tasks list */}
          {item.tasks.length > 0 ? (
            item.tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onRefresh={onRefresh}
                showToast={showToast}
              />
            ))
          ) : (
            !item.isSpecial && (
              <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic", padding: "8px 0" }}>
                Aucune tâche définie pour cet article.
              </div>
            )
          )}

          {/* Steps builder for special items */}
          {item.isSpecial && (
            <StepsBuilder
              fabItemId={item.id}
              existingTasks={item.tasks}
              onRefresh={onRefresh}
              showToast={showToast}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── History Timeline ─────────────────────────────────────────────────────────

function HistoryTimeline({ order }: { order: FullOrder }) {
  const events: TimelineEvent[] = [];

  for (const item of order.items) {
    for (const task of item.tasks) {
      if (task.startedAt) {
        events.push({
          ts: new Date(task.startedAt).getTime(),
          type: "started",
          label: `Tâche démarrée — ${task.workPost.label}`,
          detail: task.label,
          color: C.blue,
        });
      }
      if (task.completedAt) {
        events.push({
          ts: new Date(task.completedAt).getTime(),
          type: "done",
          label: `Tâche terminée — ${task.workPost.label}`,
          detail: task.label + (task.actualMinutes != null ? ` (${fmtMin(task.actualMinutes)})` : ""),
          color: C.green,
        });
      }
      if (task.status === "BLOCKED" && task.blockedReason) {
        events.push({
          ts: task.startedAt ? new Date(task.startedAt).getTime() : Date.now(),
          type: "blocked",
          label: `Blocage — ${task.workPost.label}`,
          detail: task.blockedReason,
          color: C.red,
        });
      }
      for (const qc of task.qcChecks) {
        if (qc.result && qc.checkedAt) {
          events.push({
            ts: new Date(qc.checkedAt).getTime(),
            type: "qc",
            label: `QC ${qc.qcRef} : ${qc.result}`,
            detail: qc.label + (qc.checkedBy ? ` — ${qc.checkedBy}` : ""),
            color: qc.result === "OK" ? C.green : C.red,
          });
        }
      }
    }
  }

  for (const nc of order.nonConformities) {
    events.push({
      ts: new Date(nc.createdAt).getTime(),
      type: "nc",
      label: `Non-conformité : ${nc.severity}`,
      detail: nc.description,
      color: severityColor(nc.severity),
    });
  }

  events.sort((a, b) => b.ts - a.ts);

  if (events.length === 0) {
    return (
      <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic", paddingTop: 4 }}>
        Aucun événement enregistré.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {events.map((ev, idx) => (
        <div
          key={idx}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            paddingBottom: 12,
          }}
        >
          {/* Timeline vertical line + dot */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 20 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: ev.color,
                flexShrink: 0,
                marginTop: 3,
              }}
            />
            {idx < events.length - 1 && (
              <div style={{ width: 2, flex: 1, background: C.border, minHeight: 20, marginTop: 2 }} />
            )}
          </div>
          {/* Content */}
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ color: C.muted, fontSize: 10 }}>{fmtDateTime(new Date(ev.ts).toISOString())}</span>
              <span style={{ color: ev.color, fontSize: 12, fontWeight: 600 }}>{ev.label}</span>
            </div>
            {ev.detail && (
              <div style={{ color: C.sec, fontSize: 11, marginTop: 2 }}>{ev.detail}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Non-Conformités Section ──────────────────────────────────────────────────

function NonConformitiesSection({ ncs }: { ncs: NonConformityRecord[] }) {
  const [open, setOpen] = useState(false);

  if (ncs.length === 0) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <button
        style={{
          ...btn(C.red),
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "▲" : "▼"} Non-conformités ({ncs.length})
      </button>

      {open && (
        <div
          style={{
            marginTop: 8,
            border: `1px solid ${C.red}44`,
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          {ncs.map((nc) => {
            const sc = severityColor(nc.severity);
            return (
              <div
                key={nc.id}
                style={{
                  padding: "9px 13px",
                  borderBottom: `1px solid ${C.border}`,
                  background: C.s2,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {nc.qcRef && (
                    <span style={{ color: C.sec, fontSize: 10, fontWeight: 700 }}>{nc.qcRef}</span>
                  )}
                  <span
                    style={{
                      background: sc + "22",
                      color: sc,
                      border: `1px solid ${sc}55`,
                      borderRadius: 3,
                      padding: "1px 7px",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {nc.severity}
                  </span>
                  <span
                    style={{
                      background: C.sec + "22",
                      color: C.sec,
                      border: `1px solid ${C.border}`,
                      borderRadius: 3,
                      padding: "1px 7px",
                      fontSize: 11,
                    }}
                  >
                    {nc.status}
                  </span>
                  <span style={{ color: C.muted, fontSize: 10, marginLeft: "auto" }}>
                    {fmtDate(nc.createdAt)}
                  </span>
                </div>
                <div style={{ color: C.text, fontSize: 12 }}>{nc.description}</div>
                {nc.action && (
                  <div style={{ color: C.sec, fontSize: 11 }}>Action : {nc.action}</div>
                )}
                {nc.resolvedAt && (
                  <div style={{ color: C.green, fontSize: 11 }}>
                    Résolu le {fmtDate(nc.resolvedAt)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DetailCommande({ orderId, onBack }: Props) {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "ADMIN";

  const [order, setOrder]           = useState<FullOrder | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [toast, setToast]           = useState<ToastState | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);
  const [newStatus, setNewStatus]   = useState<string>("");

  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchOrder = useCallback(async () => {
    try {
      const r = await fetch(`/api/planning/orders/${orderId}`);
      if (!r.ok) {
        const e = await r.json().catch(() => ({})) as { error?: string };
        setError(e.error ?? "Commande introuvable");
        return;
      }
      const data = (await r.json()) as FullOrder;
      setOrder(data);
      setNewStatus(data.status);
    } catch {
      setError("Erreur réseau");
    }
  }, [orderId]);

  useEffect(() => {
    setLoading(true);
    fetchOrder().finally(() => setLoading(false));
  }, [fetchOrder]);

  async function handleStatusChange() {
    if (!newStatus || !order || newStatus === order.status) {
      setChangingStatus(false);
      return;
    }
    try {
      const r = await fetch(`/api/planning/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({})) as { error?: string };
        showToast(e.error ?? "Erreur changement statut", false);
      } else {
        showToast(`Statut mis à jour : ${STATUT_LABELS[newStatus] ?? newStatus}`, true);
        setChangingStatus(false);
        fetchOrder();
      }
    } catch {
      showToast("Erreur réseau", false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 32, color: C.sec, textAlign: "center" }}>
        Chargement de la commande…
      </div>
    );
  }

  if (error || !order) {
    return (
      <div style={{ padding: 32 }}>
        <button style={btn(C.sec)} onClick={onBack}>← Retour au planning</button>
        <div style={{ color: C.red, marginTop: 16 }}>{error ?? "Commande introuvable"}</div>
      </div>
    );
  }

  // ── Progress ────────────────────────────────────────────────────────────────
  const allTasks = order.items.flatMap((i) => i.tasks);
  const totalTasks = allTasks.length;
  const doneTasks = allTasks.filter((t) => t.status === "DONE").length;
  const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  // ── Days remaining ──────────────────────────────────────────────────────────
  const days = daysRemaining(order.deliveryDate);
  const dColor = daysColor(days);
  const daysLabel =
    days > 0 ? `J-${days}` : days === 0 ? "Aujourd'hui" : `Dépassé de ${Math.abs(days)}j`;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: "16px 20px", maxWidth: 980, margin: "0 auto" }}>
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 20,
            right: 24,
            zIndex: 9999,
            background: toast.ok ? C.green + "EE" : C.red + "EE",
            color: "#fff",
            borderRadius: 7,
            padding: "10px 18px",
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
            maxWidth: 360,
          }}
        >
          {toast.ok ? "✓ " : "✗ "}{toast.msg}
        </div>
      )}

      {/* Back button */}
      <button
        style={{
          background: "transparent",
          border: "none",
          color: C.sec,
          fontSize: 13,
          cursor: "pointer",
          padding: "4px 0",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
        onClick={onBack}
      >
        ← Retour au planning
      </button>

      {/* ── ORDER HEADER ──────────────────────────────────────────────────── */}
      <div
        style={{
          background: C.s1,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: "16px 18px",
          marginBottom: 16,
        }}
      >
        {/* Top row */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <span style={{ fontSize: 22, fontWeight: 800, color: C.orange, letterSpacing: "0.03em" }}>
              {order.refProF2}
            </span>
            {order.refChantier && (
              <span style={{ fontSize: 14, color: C.sec, marginLeft: 12 }}>{order.refChantier}</span>
            )}
          </div>
          <div style={{ flex: 1 }} />
          {/* Status badge + change */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {!changingStatus ? (
              <>
                <span
                  style={{
                    background: C.blue + "22",
                    color: C.blue,
                    border: `1px solid ${C.blue}44`,
                    borderRadius: 5,
                    padding: "3px 11px",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {STATUT_LABELS[order.status] ?? order.status}
                </span>
                {isAdmin && (
                  <button
                    style={btn(C.sec, true)}
                    onClick={() => {
                      setNewStatus(order.status);
                      setChangingStatus(true);
                    }}
                  >
                    Changer statut
                  </button>
                )}
              </>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <select
                  style={{ ...inpStyle, fontSize: 12 }}
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                >
                  {Object.entries(STATUT_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <button style={btn(C.green, true)} onClick={handleStatusChange}>
                  Valider
                </button>
                <button style={btn(C.sec, true)} onClick={() => setChangingStatus(false)}>
                  Annuler
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Client */}
        <div style={{ fontSize: 15, color: C.text, fontWeight: 600, marginBottom: 10 }}>
          {order.clientName}
        </div>

        {/* Date + days remaining */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
          <span style={{ color: C.sec, fontSize: 12 }}>
            Livraison : <span style={{ color: C.text }}>{fmtDate(order.deliveryDate)}</span>
          </span>
          <span
            style={{
              background: dColor + "22",
              color: dColor,
              border: `1px solid ${dColor}55`,
              borderRadius: 4,
              padding: "1px 9px",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {daysLabel}
          </span>
          <span style={{ color: C.muted, fontSize: 11 }}>
            Créée le {fmtDate(order.createdAt)}
          </span>
        </div>

        {/* Progress bar */}
        {totalTasks > 0 && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: C.sec }}>Avancement fabrication</span>
              <span style={{ fontSize: 11, color: doneTasks === totalTasks ? C.green : C.sec }}>
                {doneTasks} / {totalTasks} tâches ({progressPct}%)
              </span>
            </div>
            <div style={{ height: 7, background: C.border, borderRadius: 4, overflow: "hidden" }}>
              <div
                style={{
                  width: `${progressPct}%`,
                  height: "100%",
                  background: doneTasks === totalTasks ? C.green : C.blue,
                  borderRadius: 4,
                  transition: "width 0.4s ease",
                }}
              />
            </div>
          </div>
        )}

        {/* Notes */}
        {order.notes && (
          <div
            style={{
              marginTop: 10,
              padding: "7px 10px",
              background: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: 5,
              color: C.sec,
              fontSize: 12,
            }}
          >
            📝 {order.notes}
          </div>
        )}
      </div>

      {/* ── FAB ITEMS ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
          }}
        >
          <div style={{ width: 2, height: 14, background: C.orange, borderRadius: 1 }} />
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: C.orange,
            }}
          >
            Articles ({order.items.length})
          </span>
        </div>

        {order.items.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>
            Aucun article dans cette commande.
          </div>
        ) : (
          order.items.map((item) => (
            <FabItemSection
              key={item.id}
              item={item}
              onRefresh={fetchOrder}
              showToast={showToast}
            />
          ))
        )}
      </div>

      {/* ── NON-CONFORMITÉS ───────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div style={{ width: 2, height: 14, background: C.red, borderRadius: 1 }} />
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: C.red,
          }}
        >
          Non-conformités
        </span>
      </div>
      <NonConformitiesSection ncs={order.nonConformities} />

      {/* ── HISTORIQUE ────────────────────────────────────────────────────── */}
      <div
        style={{
          background: C.s1,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: "14px 16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <div style={{ width: 2, height: 14, background: C.teal, borderRadius: 1 }} />
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: C.teal,
            }}
          >
            Historique
          </span>
        </div>
        <HistoryTimeline order={order} />
      </div>
    </div>
  );
}
