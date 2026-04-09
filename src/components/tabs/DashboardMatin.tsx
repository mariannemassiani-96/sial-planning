"use client";
import { useState, useEffect, useCallback } from "react";
import { C } from "@/lib/sial-data";
import { BUFFER_THRESHOLDS, STATUT_LABELS } from "@/lib/planning-constants";

// ── Types ────────────────────────────────────────────────────────────────────

interface TaskItem {
  id: string;
  label: string;
  estimatedMinutes: number;
  actualMinutes: number | null;
  status: string;
  blockedReason: string | null;
  sortOrder: number;
  assignments: { operator: { name: string } }[];
  fabItem: {
    quantity: number;
    label: string;
    menuiserieType: string;
    isSpecial: boolean;
    fabOrder: { refChantier: string; clientName: string; refProF2: string };
  };
}

interface PostData {
  id: string;
  label: string;
  capacityMinDay: number;
  tasks: TaskItem[];
}

interface AlertLateOrder {
  id: string;
  refChantier: string;
  clientName: string;
  daysLate: number;
}

interface AlertSpecial {
  taskId: string;
  label: string;
  workPostId: string;
  workPostLabel: string;
  estimatedMinutes: number;
  refChantier: string;
  clientName: string;
}

interface AlertAttenteVitrage {
  id: string;
  refChantier: string;
  clientName: string;
  waitDays: number;
}

interface BufferStockData {
  id: string;
  type: string;
  quantity: number;
  unit: string;
  min: number;
  cible: number;
  max: number;
  label: string;
}

interface ReadyOrder {
  id: string;
  refChantier: string;
  clientName: string;
  refProF2: string;
  deliveryDate: string;
}

interface DashboardData {
  mode: "COULISSANTS" | "FRAPPES";
  date: string;
  isIsulaDay: boolean;
  dayOfWeek: number;
  sialPosts: PostData[];
  isulaPosts: PostData[];
  bufferStocks: BufferStockData[];
  alerts: {
    lateOrders: AlertLateOrder[];
    specialsThisWeek: AlertSpecial[];
    attenteVitrage: AlertAttenteVitrage[];
    lowStocks: BufferStockData[];
  };
  readyToDeliver: ReadyOrder[];
}

// ── Utilitaires ──────────────────────────────────────────────────────────────

const JOURS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MOIS_FR = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];

function fmtDateFr(dateStr: string) {
  const d = new Date(dateStr);
  return `${JOURS_FR[d.getDay()]} ${d.getDate()} ${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtMin(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

function totalTasksMin(tasks: TaskItem[]) {
  return tasks.reduce((s, t) => s + t.estimatedMinutes, 0);
}

// ── Toast simple ─────────────────────────────────────────────────────────────

function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const show = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 2800);
  };
  return { msg, show };
}

// ── Composant barre de stock tampon ──────────────────────────────────────────

function StockBar({ stock }: { stock: BufferStockData }) {
  const pct = Math.min(100, (stock.quantity / stock.max) * 100);
  const minPct = (stock.min / stock.max) * 100;
  const ciblePct = (stock.cible / stock.max) * 100;
  const color = stock.quantity < stock.min ? C.red : stock.quantity < stock.cible ? C.orange : C.green;

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
        <span style={{ color: C.text }}>{stock.label}</span>
        <span style={{ color, fontWeight: 700 }}>
          {stock.quantity} {stock.unit}
          {stock.quantity < stock.min && <span style={{ color: C.red, marginLeft: 6 }}>⚠ SOUS MIN</span>}
        </span>
      </div>
      <div style={{ height: 8, background: C.s2, borderRadius: 4, position: "relative", border: `1px solid ${C.border}` }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width 0.3s" }} />
        {/* marqueur min */}
        <div style={{ position: "absolute", left: `${minPct}%`, top: -2, bottom: -2, width: 2, background: C.red, opacity: 0.7 }} />
        {/* marqueur cible */}
        <div style={{ position: "absolute", left: `${ciblePct}%`, top: -2, bottom: -2, width: 2, background: C.green, opacity: 0.7 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.muted, marginTop: 2 }}>
        <span>0</span>
        <span style={{ color: C.red }}>min {stock.min}</span>
        <span style={{ color: C.green }}>cible {stock.cible}</span>
        <span>max {stock.max} {stock.unit}</span>
      </div>
    </div>
  );
}

// ── Carte tâche poste ─────────────────────────────────────────────────────────

function TaskCard({
  task,
  onDone,
  onBlock,
}: {
  task: TaskItem;
  onDone: (id: string) => void;
  onBlock: (id: string, reason: string) => void;
}) {
  const [blocking, setBlocking] = useState(false);
  const [reason, setReason] = useState("");

  const isBlocked = task.status === "BLOCKED";
  const isDone = task.status === "DONE";
  const ops = task.assignments.map((a) => a.operator.name).join(", ");

  return (
    <div
      style={{
        background: isDone ? C.s2 : isBlocked ? "#2A1A1A" : C.s1,
        border: `1px solid ${isBlocked ? C.red : isDone ? C.muted : C.border}`,
        borderRadius: 6,
        padding: "10px 14px",
        marginBottom: 8,
        opacity: isDone ? 0.6 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            {task.fabItem.isSpecial && (
              <span style={{ background: "#7C5A00", color: C.yellow, fontSize: 10, padding: "1px 6px", borderRadius: 3, fontWeight: 700 }}>
                SPÉCIAL
              </span>
            )}
            <span style={{ fontSize: 13, fontWeight: 700, color: isBlocked ? C.red : C.text }}>
              {task.fabItem.fabOrder.refChantier} — {task.fabItem.fabOrder.clientName}
            </span>
          </div>
          <div style={{ fontSize: 12, color: C.sec, marginBottom: 3 }}>
            {task.label} · {task.fabItem.quantity}× {task.fabItem.menuiserieType}
          </div>
          <div style={{ display: "flex", gap: 10, fontSize: 11, color: C.muted }}>
            <span>Estimé : {fmtMin(task.estimatedMinutes)}</span>
            {ops && <span>Opérateurs : {ops}</span>}
          </div>
          {isBlocked && task.blockedReason && (
            <div style={{ marginTop: 6, fontSize: 12, color: C.red, background: "#2A0A0A", padding: "4px 8px", borderRadius: 4 }}>
              Bloqué : {task.blockedReason}
            </div>
          )}
        </div>

        {!isDone && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
            <button
              onClick={() => onDone(task.id)}
              style={{
                padding: "6px 14px",
                background: C.green,
                color: "#000",
                border: "none",
                borderRadius: 4,
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Marquer terminé
            </button>
            {!isBlocked && !blocking && (
              <button
                onClick={() => setBlocking(true)}
                style={{
                  padding: "6px 14px",
                  background: "none",
                  color: C.orange,
                  border: `1px solid ${C.orange}`,
                  borderRadius: 4,
                  fontSize: 12,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Signaler un problème
              </button>
            )}
          </div>
        )}
      </div>

      {blocking && (
        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Décrivez le problème…"
            style={{
              flex: 1,
              background: C.s2,
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              color: C.text,
              padding: "6px 10px",
              fontSize: 12,
            }}
          />
          <button
            onClick={() => { onBlock(task.id, reason); setBlocking(false); setReason(""); }}
            disabled={!reason.trim()}
            style={{
              padding: "6px 12px",
              background: C.red,
              color: "#fff",
              border: "none",
              borderRadius: 4,
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Confirmer
          </button>
          <button
            onClick={() => { setBlocking(false); setReason(""); }}
            style={{
              padding: "6px 10px",
              background: "none",
              color: C.sec,
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Annuler
          </button>
        </div>
      )}
    </div>
  );
}

// ── Bloc poste ────────────────────────────────────────────────────────────────

function PostBlock({
  post,
  onDone,
  onBlock,
}: {
  post: PostData;
  onDone: (id: string) => void;
  onBlock: (id: string, reason: string) => void;
}) {
  const totalMin = totalTasksMin(post.tasks);
  const usagePct = post.capacityMinDay > 0 ? Math.min(100, (totalMin / post.capacityMinDay) * 100) : 0;
  const usageColor = usagePct > 90 ? C.red : usagePct > 70 ? C.orange : C.green;

  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: C.s2,
          border: `1px solid ${C.border}`,
          borderRadius: "6px 6px 0 0",
          padding: "8px 14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontWeight: 800, fontSize: 14, color: C.orange }}>{post.id}</span>
          <span style={{ fontSize: 13, color: C.text }}>{post.label}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 80, height: 6, background: C.s1, borderRadius: 3, border: `1px solid ${C.border}` }}>
            <div style={{ height: "100%", width: `${usagePct}%`, background: usageColor, borderRadius: 3 }} />
          </div>
          <span style={{ fontSize: 11, color: usageColor }}>{fmtMin(totalMin)} / {fmtMin(post.capacityMinDay)}</span>
        </div>
      </div>

      <div
        style={{
          border: `1px solid ${C.border}`,
          borderTop: "none",
          borderRadius: "0 0 6px 6px",
          padding: post.tasks.length ? "10px 10px 2px" : "16px",
        }}
      >
        {post.tasks.length === 0 ? (
          <div style={{ textAlign: "center", color: C.muted, fontSize: 12 }}>Aucune tâche planifiée sur ce poste aujourd'hui</div>
        ) : (
          post.tasks.map((t) => (
            <TaskCard key={t.id} task={t} onDone={onDone} onBlock={onBlock} />
          ))
        )}
      </div>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function DashboardMatin() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [togglingMode, setTogglingMode] = useState(false);
  const { msg: toastMsg, show: showToast } = useToast();

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/planning/dashboard");
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleMode = async () => {
    if (!data || togglingMode) return;
    const newMode = data.mode === "COULISSANTS" ? "FRAPPES" : "COULISSANTS";
    setTogglingMode(true);
    try {
      const res = await fetch("/api/planning/mode-jour", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: newMode }),
      });
      if (res.ok) {
        setData((d) => d ? { ...d, mode: newMode } : d);
        showToast(`Mode du jour : ${newMode === "COULISSANTS" ? "Coulissants / Gal / Portes" : "Frappes"}`);
        fetchData();
      }
    } catch {}
    setTogglingMode(false);
  };

  const markDone = async (taskId: string) => {
    try {
      const res = await fetch(`/api/planning/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DONE" }),
      });
      if (res.ok) {
        showToast("Tâche marquée terminée");
        fetchData();
      }
    } catch {}
  };

  const markBlocked = async (taskId: string, reason: string) => {
    try {
      const res = await fetch(`/api/planning/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "BLOCKED", blockedReason: reason }),
      });
      if (res.ok) {
        showToast("Problème signalé");
        fetchData();
      }
    } catch {}
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 80, color: C.sec }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>⏳</div>
        <div>Chargement du tableau de bord…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ textAlign: "center", padding: 80, color: C.red }}>
        Erreur de chargement — <button onClick={fetchData} style={{ color: C.blue, background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>Réessayer</button>
      </div>
    );
  }

  const { mode, date, isIsulaDay, dayOfWeek, sialPosts, isulaPosts, bufferStocks, alerts, readyToDeliver } = data;
  const totalAlerts = alerts.lateOrders.length + alerts.specialsThisWeek.length + alerts.attenteVitrage.length + alerts.lowStocks.length;
  const isulaDayNames: Record<number, string> = { 1: "lundi", 2: "mardi", 4: "jeudi" };
  const nextIsulaDay = isIsulaDay ? "aujourd'hui" : (() => {
    for (let i = 1; i <= 7; i++) {
      const d = (dayOfWeek + i) % 7;
      if ([1, 2, 4].includes(d)) return isulaDayNames[d];
    }
    return "lundi";
  })();

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      {/* Toast */}
      {toastMsg && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: C.green,
            color: "#000",
            padding: "10px 24px",
            borderRadius: 6,
            fontWeight: 700,
            fontSize: 14,
            zIndex: 9999,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          {toastMsg}
        </div>
      )}

      {/* ── En-tête fixe ──────────────────────────────────────────────────── */}
      <div
        style={{
          background: C.s1,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: "14px 20px",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 2 }}>
            Tableau de bord matin
          </div>
          <div style={{ fontSize: 13, color: C.sec }}>{fmtDateFr(date)}</div>
          <div style={{ marginTop: 6, fontSize: 12 }}>
            <span
              style={{
                padding: "2px 10px",
                borderRadius: 12,
                background: isIsulaDay ? "#0D2A1A" : "#1A1A1A",
                border: `1px solid ${isIsulaDay ? C.green : C.muted}`,
                color: isIsulaDay ? C.green : C.muted,
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              ISULA {isIsulaDay ? "ACTIF aujourd'hui" : `INACTIF — prochain : ${nextIsulaDay}`}
            </span>
          </div>
        </div>

        {/* Toggle mode du jour */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase" }}>Mode du jour</div>
          <button
            onClick={toggleMode}
            disabled={togglingMode}
            style={{
              display: "flex",
              background: C.s2,
              border: `2px solid ${mode === "COULISSANTS" ? C.teal : C.orange}`,
              borderRadius: 20,
              padding: 3,
              cursor: "pointer",
              transition: "border-color 0.2s",
            }}
          >
            {(["COULISSANTS", "FRAPPES"] as const).map((m) => (
              <span
                key={m}
                style={{
                  padding: "6px 14px",
                  borderRadius: 16,
                  fontSize: 12,
                  fontWeight: 700,
                  background: mode === m ? (m === "COULISSANTS" ? C.teal : C.orange) : "transparent",
                  color: mode === m ? "#000" : C.sec,
                  transition: "background 0.2s, color 0.2s",
                }}
              >
                {m === "COULISSANTS" ? "Coulissants / Gal / Portes" : "Frappes"}
              </span>
            ))}
          </button>
        </div>
      </div>

      {/* ── Section Alertes ───────────────────────────────────────────────── */}
      {totalAlerts > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.red, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <span>ALERTES</span>
            <span
              style={{
                background: C.red,
                color: "#fff",
                borderRadius: 10,
                padding: "1px 7px",
                fontSize: 11,
              }}
            >
              {totalAlerts}
            </span>
          </div>

          {/* Retards */}
          {alerts.lateOrders.map((o) => (
            <div
              key={o.id}
              style={{
                background: "#2A0A0A",
                border: `1px solid ${C.red}`,
                borderRadius: 6,
                padding: "8px 14px",
                marginBottom: 8,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <span style={{ color: C.red, fontWeight: 700, fontSize: 12 }}>RETARD</span>
                <span style={{ color: C.text, fontSize: 13, marginLeft: 10 }}>
                  {o.refChantier} — {o.clientName}
                </span>
              </div>
              <span style={{ color: C.red, fontWeight: 700, fontSize: 13 }}>
                +{o.daysLate} jour{o.daysLate > 1 ? "s" : ""}
              </span>
            </div>
          ))}

          {/* Spéciaux cette semaine */}
          {alerts.specialsThisWeek.map((s) => (
            <div
              key={s.taskId}
              style={{
                background: "#2A1A00",
                border: `1px solid ${C.yellow}`,
                borderRadius: 6,
                padding: "8px 14px",
                marginBottom: 8,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <span style={{ background: "#7C5A00", color: C.yellow, fontSize: 10, padding: "1px 6px", borderRadius: 3, fontWeight: 700 }}>
                  SPÉCIAL
                </span>
                <span style={{ color: C.text, fontSize: 13, marginLeft: 10 }}>
                  {s.refChantier} — {s.clientName}
                </span>
                <span style={{ color: C.sec, fontSize: 12, marginLeft: 8 }}>
                  {s.workPostId} — {s.label}
                </span>
              </div>
              <span style={{ color: C.yellow, fontSize: 12 }}>{fmtMin(s.estimatedMinutes)}</span>
            </div>
          ))}

          {/* Attente vitrage */}
          {alerts.attenteVitrage.map((o) => (
            <div
              key={o.id}
              style={{
                background: "#2A1500",
                border: `1px solid ${C.orange}`,
                borderRadius: 6,
                padding: "8px 14px",
                marginBottom: 8,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <span style={{ color: C.orange, fontWeight: 700, fontSize: 12 }}>ATTENTE VITRAGE</span>
                <span style={{ color: C.text, fontSize: 13, marginLeft: 10 }}>
                  {o.refChantier} — {o.clientName}
                </span>
              </div>
              <span style={{ color: C.orange, fontSize: 12 }}>
                depuis {o.waitDays} jour{o.waitDays > 1 ? "s" : ""}
              </span>
            </div>
          ))}

          {/* Stocks bas */}
          {alerts.lowStocks.map((s) => (
            <div
              key={s.type}
              style={{
                background: "#2A0A0A",
                border: `1px solid ${C.red}`,
                borderRadius: 6,
                padding: "8px 14px",
                marginBottom: 8,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <span style={{ color: C.red, fontWeight: 700, fontSize: 12 }}>STOCK BAS</span>
                <span style={{ color: C.text, fontSize: 13, marginLeft: 10 }}>{s.label}</span>
              </div>
              <span style={{ color: C.red, fontWeight: 700, fontSize: 13 }}>
                {s.quantity} {s.unit} (min : {s.min})
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Aujourd'hui — SIAL ────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 14,
            paddingBottom: 8,
            borderBottom: `2px solid ${C.orange}`,
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 800, color: C.orange }}>SIAL</span>
          <span style={{ fontSize: 14, color: C.sec }}>
            — Mode {mode === "COULISSANTS" ? "Coulissants / Gal / Portes" : "Frappes"}
          </span>
          <span
            style={{
              marginLeft: "auto",
              fontSize: 11,
              color: C.sec,
              background: C.s2,
              border: `1px solid ${C.border}`,
              padding: "2px 8px",
              borderRadius: 4,
            }}
          >
            {sialPosts.reduce((s, p) => s + p.tasks.length, 0)} tâche(s) planifiée(s)
          </span>
        </div>

        {sialPosts.filter((p) => p.tasks.length > 0).length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: 32,
              color: C.sec,
              background: C.s1,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            Aucune tâche planifiée aujourd'hui pour les postes {mode === "COULISSANTS" ? "coulissants/gal/portes" : "frappes"}.
            <br />
            <span style={{ color: C.muted, fontSize: 12 }}>
              Créez des commandes et planifiez des tâches pour les voir apparaître ici.
            </span>
          </div>
        ) : (
          sialPosts.map((post) => (
            <PostBlock key={post.id} post={post} onDone={markDone} onBlock={markBlocked} />
          ))
        )}
      </div>

      {/* ── Aujourd'hui — ISULA (lundi, mardi, jeudi uniquement) ─────────── */}
      {isIsulaDay && (
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 14,
              paddingBottom: 8,
              borderBottom: `2px solid ${C.teal}`,
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 800, color: C.teal }}>ISULA VITRAGE</span>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 11,
                color: C.sec,
                background: C.s2,
                border: `1px solid ${C.border}`,
                padding: "2px 8px",
                borderRadius: 4,
              }}
            >
              {isulaPosts.reduce((s, p) => s + p.tasks.length, 0)} tâche(s) planifiée(s)
            </span>
          </div>

          {/* Niveaux stocks tampons ISULA */}
          {bufferStocks.filter((s) => ["VITRAGES_ISULA", "VERRE_BRUT_ISULA"].includes(s.type)).length > 0 && (
            <div
              style={{
                background: C.s1,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: "14px 16px",
                marginBottom: 14,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: C.sec, marginBottom: 10 }}>
                STOCKS TAMPONS ISULA
              </div>
              {bufferStocks
                .filter((s) => ["VITRAGES_ISULA", "OUVRANTS_VITRES", "VERRE_BRUT_ISULA"].includes(s.type))
                .map((s) => (
                  <StockBar key={s.type} stock={s} />
                ))}
            </div>
          )}

          {isulaPosts.filter((p) => p.tasks.length > 0).length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: 32,
                color: C.sec,
                background: C.s1,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              Aucune tâche ISULA planifiée aujourd'hui.
            </div>
          ) : (
            isulaPosts.map((post) => (
              <PostBlock key={post.id} post={post} onDone={markDone} onBlock={markBlocked} />
            ))
          )}
        </div>
      )}

      {/* ── Prêt à livrer ────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 800,
            color: C.green,
            marginBottom: 12,
            paddingBottom: 8,
            borderBottom: `2px solid ${C.green}`,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>PRÊT À LIVRER</span>
          {readyToDeliver.length > 0 && (
            <span
              style={{
                background: C.green,
                color: "#000",
                borderRadius: 10,
                padding: "1px 7px",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {readyToDeliver.length}
            </span>
          )}
        </div>

        {readyToDeliver.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: 24,
              color: C.muted,
              background: C.s1,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            Aucune commande prête à livrer
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {readyToDeliver.map((o) => {
              const daysToDelivery = Math.floor(
                (new Date(o.deliveryDate).getTime() - Date.now()) / 86400000
              );
              const dateColor = daysToDelivery < 0 ? C.red : daysToDelivery <= 2 ? C.orange : C.green;
              return (
                <div
                  key={o.id}
                  style={{
                    background: C.s1,
                    border: `1px solid ${C.green}`,
                    borderRadius: 6,
                    padding: "10px 16px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{o.refChantier}</span>
                    <span style={{ color: C.sec, fontSize: 13, marginLeft: 8 }}>{o.clientName}</span>
                    <span style={{ color: C.muted, fontSize: 11, marginLeft: 8 }}>{o.refProF2}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: dateColor }}>
                      {new Date(o.deliveryDate).toLocaleDateString("fr-FR")}
                    </div>
                    <div style={{ fontSize: 11, color: dateColor }}>
                      {daysToDelivery < 0
                        ? `Retard ${Math.abs(daysToDelivery)}j`
                        : daysToDelivery === 0
                        ? "Aujourd'hui"
                        : `Dans ${daysToDelivery} j`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Tous les stocks tampons (fin de page) ─────────────────────────── */}
      {bufferStocks.length > 0 && (
        <div
          style={{
            background: C.s1,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: "14px 16px",
            marginBottom: 24,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: C.sec, marginBottom: 12 }}>
            STOCKS TAMPONS ATELIER
          </div>
          {bufferStocks.map((s) => (
            <StockBar key={s.type} stock={s} />
          ))}
        </div>
      )}
    </div>
  );
}
