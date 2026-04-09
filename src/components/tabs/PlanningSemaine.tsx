"use client";
import { useState, useEffect, useCallback } from "react";
import { C } from "@/lib/sial-data";

// ── Types ────────────────────────────────────────────────────────────────────

interface TaskData {
  id: string;
  label: string;
  estimatedMinutes: number;
  status: string;
  sortOrder: number;
  scheduledDate: string | null;
  isBlocking: boolean;
  blockedReason: string | null;
  workPost: { id: string; label: string; capacityMinDay: number };
  fabItem: {
    id: string;
    quantity: number;
    menuiserieType: string;
    isSpecial: boolean;
    fabOrder: {
      id: string;
      refChantier: string;
      clientName: string;
      refProF2: string;
      deliveryDate: string;
      status: string;
    };
  };
  assignments: { operator: { name: string } }[];
  qcChecks: { result: string | null; qcRef: string }[];
}

interface PostDay {
  postId: string;
  postLabel: string;
  capacityMinDay: number;
  minutesPlanified: number;
  chargePercent: number;
  hasBlockingSpecial: boolean;
  tasks: TaskData[];
}

interface DayData {
  date: string;
  dayName: string;
  dayIndex: number;
  isIsulaActive: boolean;
  posts: PostDay[];
}

interface WeekData {
  weekStart: string;
  weekEnd: string;
  atelier: "SIAL" | "ISULA";
  days: DayData[];
}

interface ConfirmMove {
  task: TaskData;
  targetDate: string;
  targetPostId: string;
  newChargePercent: number;
  postLabel: string;
}

interface Props {
  onSelectOrder: (orderId: string) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function addWeek(d: Date): Date {
  const nd = new Date(d);
  nd.setDate(d.getDate() + 7);
  return nd;
}

function subWeek(d: Date): Date {
  const nd = new Date(d);
  nd.setDate(d.getDate() - 7);
  return nd;
}

function fmtMin(n: number): string {
  if (n < 60) return `${n} min`;
  return `${Math.floor(n / 60)}h${(n % 60).toString().padStart(2, "0")}`;
}

function fmtDateHeader(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

function fmtWeekRange(weekStart: Date): string {
  const end = addWeek(weekStart);
  end.setDate(end.getDate() - 3); // Friday
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };
  const startStr = weekStart.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  const endStr = end.toLocaleDateString("fr-FR", opts);
  return `Semaine du ${startStr} au ${endStr}`;
}

function daysUntil(deliveryDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(deliveryDate + "T00:00:00");
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function statusBorderColor(task: TaskData): string {
  if (task.isBlocking) return C.red;
  if (task.fabItem.isSpecial) return C.yellow;
  const s = task.status;
  if (s === "A_LANCER") return C.muted;
  if (s === "EN_COURS") return C.blue;
  if (s === "ATTENTE_VITRAGE" || s === "ATTENTE_IGU") return C.orange;
  if (s === "PRET_LIVRAISON") return C.green;
  if (s === "BLOCKED") return C.red;
  // overdue check
  const days = daysUntil(task.fabItem.fabOrder.deliveryDate);
  if (days < 0 && task.fabItem.fabOrder.status !== "LIVRE") return C.red;
  return C.muted;
}

function chargeBarColor(pct: number): string {
  if (pct > 90) return C.red;
  if (pct >= 70) return C.orange;
  return C.green;
}

// ── TaskCard ─────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  onSelect,
  onDragStart,
}: {
  task: TaskData;
  onSelect: () => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, task: TaskData) => void;
}) {
  const borderColor = statusBorderColor(task);
  const isBlocked = task.status === "BLOCKED" || task.isBlocking;
  const days = daysUntil(task.fabItem.fabOrder.deliveryDate);
  const badgeColor = days > 5 ? C.green : days >= 2 ? C.orange : C.red;
  const operatorNames = task.assignments.map((a) => a.operator.name).join(", ");

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onClick={onSelect}
      style={{
        borderLeft: `3px solid ${borderColor}`,
        background: isBlocked ? "rgba(239,83,80,0.08)" : C.s2,
        borderRadius: 4,
        padding: "6px 8px",
        marginBottom: 4,
        cursor: "grab",
        position: "relative",
        fontSize: 12,
        userSelect: "none",
      }}
    >
      {/* badges top-right */}
      <div style={{ position: "absolute", top: 4, right: 4, display: "flex", gap: 4 }}>
        {task.fabItem.isSpecial && (
          <span
            style={{
              background: C.yellow,
              color: "#000",
              borderRadius: 3,
              padding: "1px 4px",
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            SPÉCIAL
          </span>
        )}
        <span
          style={{
            background: badgeColor,
            color: "#000",
            borderRadius: 3,
            padding: "1px 4px",
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          {days < 0 ? `+${Math.abs(days)}j` : `J-${days}`}
        </span>
      </div>

      {/* Line 1: ref chantier — client */}
      <div style={{ fontWeight: 700, color: C.text, paddingRight: 52, marginBottom: 2 }}>
        {task.fabItem.fabOrder.refChantier}
        <span style={{ fontWeight: 400, color: C.sec }}>
          {" "}— {task.fabItem.fabOrder.clientName}
        </span>
      </div>

      {/* Line 2: type × qty */}
      <div style={{ color: C.sec }}>
        {task.fabItem.menuiserieType} × {task.fabItem.quantity}
      </div>

      {/* Line 3: operators */}
      {operatorNames && (
        <div style={{ color: C.muted, marginTop: 2 }}>{operatorNames}</div>
      )}

      {/* Blocked warning */}
      {isBlocked && (
        <div style={{ color: C.red, marginTop: 3, fontWeight: 600 }}>
          ⚠ Bloqué{task.blockedReason ? ` — ${task.blockedReason}` : ""}
        </div>
      )}
    </div>
  );
}

// ── PostBlock ─────────────────────────────────────────────────────────────────

function PostBlock({
  post,
  onSelectOrder,
  onDragStart,
}: {
  post: PostDay;
  onSelectOrder: (orderId: string) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, task: TaskData) => void;
}) {
  const pct = Math.round(post.chargePercent);
  const barColor = chargeBarColor(pct);

  return (
    <div style={{ marginBottom: 10 }}>
      {/* Post header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: C.text,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            flex: 1,
          }}
        >
          {post.postLabel}
        </span>
        <span style={{ fontSize: 10, color: barColor, fontWeight: 700, whiteSpace: "nowrap" }}>
          {fmtMin(post.minutesPlanified)} / {fmtMin(post.capacityMinDay)}
        </span>
      </div>

      {/* Charge bar */}
      <div
        style={{
          height: 4,
          background: C.border,
          borderRadius: 2,
          marginBottom: 4,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.min(pct, 100)}%`,
            background: barColor,
            borderRadius: 2,
            transition: "width 0.3s",
          }}
        />
      </div>

      {/* Charge % */}
      <div style={{ fontSize: 10, color: barColor, marginBottom: 4, textAlign: "right" }}>
        {pct}%
      </div>

      {/* Blocking special badge */}
      {post.hasBlockingSpecial && (
        <div
          style={{
            background: "rgba(255,167,38,0.15)",
            border: `1px solid ${C.orange}`,
            borderRadius: 3,
            padding: "2px 6px",
            fontSize: 10,
            color: C.orange,
            marginBottom: 4,
          }}
        >
          Réservé — grand format
        </div>
      )}

      {/* Tasks */}
      {post.tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          onSelect={() => onSelectOrder(task.fabItem.fabOrder.id)}
          onDragStart={onDragStart}
        />
      ))}
    </div>
  );
}

// ── DayColumn ─────────────────────────────────────────────────────────────────

function DayColumn({
  day,
  atelier,
  onSelectOrder,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  isDragOver,
}: {
  day: DayData;
  atelier: "SIAL" | "ISULA";
  onSelectOrder: (orderId: string) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, task: TaskData) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>, date: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>, day: DayData) => void;
  isDragOver: boolean;
}) {
  const isIsulaInactive = atelier === "ISULA" && !day.isIsulaActive;
  const activePosts = day.posts.filter((p) => p.tasks.length > 0);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minWidth: 180,
        flex: "1 1 0",
        background: C.s1,
        borderRadius: 6,
        border: isDragOver ? `1px solid ${C.blue}` : `1px solid ${C.border}`,
        overflow: "hidden",
        transition: "border-color 0.15s",
      }}
      onDragOver={(e) => onDragOver(e, day.date)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, day)}
    >
      {/* Day header */}
      <div
        style={{
          background: C.s2,
          borderBottom: `1px solid ${C.border}`,
          padding: "8px 10px",
        }}
      >
        <div style={{ fontWeight: 700, color: C.text, fontSize: 13 }}>
          {day.dayName}
        </div>
        <div style={{ color: C.sec, fontSize: 11 }}>{fmtDateHeader(day.date)}</div>
      </div>

      {/* Content */}
      {isIsulaInactive ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: C.muted,
            fontSize: 12,
            padding: 16,
            textAlign: "center",
          }}
        >
          Atelier fermé
        </div>
      ) : (
        <div style={{ flex: 1, padding: "8px 10px", overflowY: "auto" }}>
          {activePosts.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 11, textAlign: "center", marginTop: 12 }}>
              Aucune tâche
            </div>
          ) : (
            activePosts.map((post) => (
              <PostBlock
                key={post.postId}
                post={post}
                onSelectOrder={onSelectOrder}
                onDragStart={onDragStart}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PlanningSemaine({ onSelectOrder }: Props) {
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [atelier, setAtelier] = useState<"SIAL" | "ISULA">("SIAL");
  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(true);

  const [draggedTask, setDraggedTask] = useState<TaskData | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [confirmMove, setConfirmMove] = useState<ConfirmMove | null>(null);

  // Toast
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Fetch
  const fetchWeek = useCallback(async () => {
    setLoading(true);
    try {
      const startStr = weekStart.toISOString().split("T")[0];
      const res = await fetch(
        `/api/planning/semaine?start=${startStr}&atelier=${atelier}`
      );
      if (res.ok) {
        setWeekData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [weekStart, atelier]);

  useEffect(() => {
    fetchWeek();
  }, [fetchWeek]);

  // Reschedule
  const doReschedule = useCallback(
    async (taskId: string, date: string) => {
      setDraggedTask(null);
      setConfirmMove(null);
      try {
        const res = await fetch(`/api/planning/tasks/${taskId}/reschedule`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduledDate: date }),
        });
        if (res.status === 409) {
          const data = await res.json() as { message?: string };
          showToast(data.message ?? "Conflit de planification", false);
        } else if (res.ok) {
          showToast("Tâche replanifiée", true);
          await fetchWeek();
        } else {
          showToast("Erreur lors de la replanification", false);
        }
      } catch {
        showToast("Erreur réseau", false);
      }
    },
    [fetchWeek, showToast]
  );

  // DnD handlers
  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, task: TaskData) => {
      setDraggedTask(task);
      e.dataTransfer.effectAllowed = "move";
    },
    []
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, date: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverDate(date);
    },
    []
  );

  const handleDragLeave = useCallback(() => {
    setDragOverDate(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, day: DayData) => {
      e.preventDefault();
      setDragOverDate(null);
      if (!draggedTask) return;
      if (draggedTask.scheduledDate === day.date) return;

      // Find matching post in target day
      const targetPost = day.posts.find(
        (p) => p.postId === draggedTask.workPost.id
      );

      if (targetPost) {
        const newMinutes = targetPost.minutesPlanified + draggedTask.estimatedMinutes;
        const newChargePct =
          targetPost.capacityMinDay > 0
            ? (newMinutes / targetPost.capacityMinDay) * 100
            : 0;

        if (newChargePct > 90) {
          setConfirmMove({
            task: draggedTask,
            targetDate: day.date,
            targetPostId: targetPost.postId,
            newChargePercent: Math.round(newChargePct),
            postLabel: targetPost.postLabel,
          });
          return;
        }
      }

      doReschedule(draggedTask.id, day.date);
    },
    [draggedTask, doReschedule]
  );

  // Check if week has any tasks
  const hasTasks =
    weekData !== null &&
    weekData.days.some((d) => d.posts.some((p) => p.tasks.length > 0));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      {/* ── Header bar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: C.s1,
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          padding: "8px 14px",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        {/* Left: navigation */}
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => setWeekStart((d) => subWeek(d))}
            style={navBtnStyle}
          >
            ← Sem. préc.
          </button>
          <button
            onClick={() => setWeekStart(getMonday(new Date()))}
            style={navBtnStyle}
          >
            {"Aujourd'hui"}
          </button>
          <button
            onClick={() => setWeekStart((d) => addWeek(d))}
            style={navBtnStyle}
          >
            Sem. suiv. →
          </button>
        </div>

        {/* Center: date range */}
        <div style={{ color: C.text, fontWeight: 600, fontSize: 14, textAlign: "center", flex: 1 }}>
          {fmtWeekRange(weekStart)}
        </div>

        {/* Right: atelier tabs */}
        <div
          style={{
            display: "flex",
            gap: 2,
            background: C.bg,
            borderRadius: 5,
            padding: 2,
          }}
        >
          {(["SIAL", "ISULA"] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAtelier(a)}
              style={{
                padding: "4px 14px",
                borderRadius: 4,
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 13,
                background: atelier === a ? C.blue : "transparent",
                color: atelier === a ? "#000" : C.sec,
                transition: "background 0.15s",
              }}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* ── Calendar grid ── */}
      {loading ? (
        <div style={{ color: C.sec, textAlign: "center", padding: 40 }}>
          Chargement...
        </div>
      ) : !weekData || weekData.days.length === 0 ? (
        <EmptyState />
      ) : !hasTasks ? (
        <EmptyState />
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: 8,
            overflowX: "auto",
            flex: 1,
            alignItems: "stretch",
            paddingBottom: 8,
          }}
        >
          {weekData.days.map((day) => (
            <DayColumn
              key={day.date}
              day={day}
              atelier={atelier}
              onSelectOrder={onSelectOrder}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              isDragOver={dragOverDate === day.date}
            />
          ))}
        </div>
      )}

      {/* ── Confirmation modal ── */}
      {confirmMove && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => {
            setConfirmMove(null);
            setDraggedTask(null);
          }}
        >
          <div
            style={{
              background: C.s1,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: 24,
              width: 360,
              maxWidth: "90vw",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontWeight: 700,
                color: C.text,
                fontSize: 15,
                marginBottom: 12,
              }}
            >
              Confirmer le déplacement
            </div>
            <div style={{ color: C.sec, fontSize: 13, marginBottom: 20 }}>
              Le poste{" "}
              <strong style={{ color: C.text }}>{confirmMove.postLabel}</strong>{" "}
              sera chargé à{" "}
              <strong style={{ color: C.orange }}>
                {confirmMove.newChargePercent}%
              </strong>{" "}
              après déplacement. Confirmer ?
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  setConfirmMove(null);
                  setDraggedTask(null);
                }}
                style={{
                  ...modalBtnStyle,
                  background: C.s2,
                  color: C.text,
                  border: `1px solid ${C.border}`,
                }}
              >
                Annuler
              </button>
              <button
                onClick={() =>
                  doReschedule(confirmMove.task.id, confirmMove.targetDate)
                }
                style={{
                  ...modalBtnStyle,
                  background: C.blue,
                  color: "#000",
                  border: "none",
                }}
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: toast.ok ? C.green : C.red,
            color: "#000",
            borderRadius: 6,
            padding: "10px 18px",
            fontWeight: 600,
            fontSize: 13,
            zIndex: 2000,
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: C.muted,
        fontSize: 14,
        textAlign: "center",
        padding: 40,
      }}
    >
      Aucune tâche planifiée cette semaine. Créez des commandes et assignez des
      tâches pour les voir apparaître ici.
    </div>
  );
}

// ── Shared style constants ────────────────────────────────────────────────────

const navBtnStyle: React.CSSProperties = {
  background: C.s2,
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  color: C.text,
  fontSize: 12,
  fontWeight: 600,
  padding: "4px 10px",
  cursor: "pointer",
};

const modalBtnStyle: React.CSSProperties = {
  padding: "7px 18px",
  borderRadius: 5,
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};
