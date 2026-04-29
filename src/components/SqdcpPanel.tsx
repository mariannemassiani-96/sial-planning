// ═══════════════════════════════════════════════════════════════════════
// TABLEAU SQDCP — Management visuel journalier.
//
// Référence : management visuel lean — un tableau quotidien qui pilote
// la performance via 5 dimensions :
//   S = Sécurité     (incidents, presqu'accidents)
//   Q = Qualité      (NC, reprises, rebuts)
//   D = Délai        (retards, livraisons à l'heure)
//   C = Coût         (heures réelles vs estimées, gaspillage)
//   P = Personnel    (présence, ambiance, formation)
//
// AJ saisit chaque jour un statut + une note pour chaque dimension.
// Stockage : table MemoAction avec type="sqdcp".
// ═══════════════════════════════════════════════════════════════════════

"use client";
import { useState, useEffect, useCallback } from "react";
import { C } from "@/lib/sial-data";

const DIMENSIONS = [
  { id: "S", label: "Sécurité",   color: C.red,    description: "Incidents, presqu'accidents, EPI" },
  { id: "Q", label: "Qualité",    color: C.purple, description: "NC, reprises, rebuts" },
  { id: "D", label: "Délai",      color: C.orange, description: "Livraisons à l'heure, retards" },
  { id: "C", label: "Coût",       color: C.yellow, description: "Heures réelles vs estimées" },
  { id: "P", label: "Personnel",  color: C.teal,   description: "Présence, ambiance, formation" },
] as const;

type Dim = typeof DIMENSIONS[number]["id"];
type Status = "ok" | "alerte" | "ko" | "";

interface SqdcpEntry {
  id: string;
  texte: string;       // contient le JSON sérialisé du statut SQDCP
  type: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

interface SqdcpData {
  S: { status: Status; note: string };
  Q: { status: Status; note: string };
  D: { status: Status; note: string };
  C: { status: Status; note: string };
  P: { status: Status; note: string };
}

const EMPTY: SqdcpData = {
  S: { status: "", note: "" },
  Q: { status: "", note: "" },
  D: { status: "", note: "" },
  C: { status: "", note: "" },
  P: { status: "", note: "" },
};

export default function SqdcpPanel({ date }: { date: string }) {
  const [data, setData] = useState<SqdcpData>(EMPTY);
  const [memoId, setMemoId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Dim | null>(null);

  const load = useCallback(async () => {
    try {
      // Lister les memos type=sqdcp pour ce jour
      const r = await fetch(`/api/memos`);
      if (!r.ok) return;
      const all = await r.json();
      const list: SqdcpEntry[] = Array.isArray(all) ? all : [];
      const today = list.find(m =>
        m.type === "sqdcp" &&
        m.createdAt?.startsWith(date) &&
        m.metadata && (m.metadata as any).sqdcp
      );
      if (today) {
        setMemoId(today.id);
        setData({ ...EMPTY, ...((today.metadata as any).sqdcp as Partial<SqdcpData>) });
      } else {
        setMemoId(null);
        setData(EMPTY);
      }
    } catch {}
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const save = async (newData: SqdcpData) => {
    setSaving(true);
    try {
      if (memoId) {
        await fetch(`/api/memos`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: memoId, metadata: { sqdcp: newData }, texte: summarize(newData) }),
        });
      } else {
        const res = await fetch("/api/memos", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "sqdcp",
            texte: summarize(newData),
            statut: "ouvert",
            metadata: { sqdcp: newData, date },
          }),
        });
        if (res.ok) {
          const created = await res.json();
          setMemoId(created.id);
        }
      }
    } catch {}
    setSaving(false);
  };

  const updateDim = (dim: Dim, updates: Partial<{ status: Status; note: string }>) => {
    const newData = { ...data, [dim]: { ...data[dim], ...updates } };
    setData(newData);
    save(newData);
  };

  const allOk = DIMENSIONS.every(d => data[d.id].status === "ok");
  const anyKo = DIMENSIONS.some(d => data[d.id].status === "ko");
  const anyAlert = DIMENSIONS.some(d => data[d.id].status === "alerte");

  const colorForGlobal = anyKo ? C.red : anyAlert ? C.orange : allOk ? C.green : C.muted;

  return (
    <div style={{
      background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6,
      padding: "10px 14px", marginBottom: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>
          📋 Tableau SQDCP du jour
        </span>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 3,
          background: colorForGlobal + "22", color: colorForGlobal,
        }}>
          {anyKo ? "🔴 Alerte" : anyAlert ? "🟠 Vigilance" : allOk ? "🟢 Tout OK" : "⚪ Non rempli"}
        </span>
        <span style={{ fontSize: 10, color: C.muted, flex: 1 }}>
          Sécurité · Qualité · Délai · Coût · Personnel
        </span>
        {saving && <span style={{ fontSize: 10, color: C.orange }}>Sauvegarde…</span>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
        {DIMENSIONS.map(d => {
          const s = data[d.id];
          const isExp = expanded === d.id;
          return (
            <div key={d.id}
              style={{
                background: s.status === "ok" ? C.green + "10"
                          : s.status === "alerte" ? C.orange + "10"
                          : s.status === "ko" ? C.red + "10"
                          : C.bg,
                border: `1px solid ${s.status === "ok" ? C.green + "44"
                                    : s.status === "alerte" ? C.orange + "44"
                                    : s.status === "ko" ? C.red + "44"
                                    : C.border}`,
                borderRadius: 5, padding: "6px 8px",
                cursor: "pointer",
              }}
              onClick={() => setExpanded(isExp ? null : d.id)}
              title={d.description}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: d.color }}>{d.id}</span>
                <span style={{ fontSize: 10, color: C.sec }}>{d.label}</span>
              </div>
              <div style={{ display: "flex", gap: 3 }}>
                {[
                  { v: "ok",     icon: "✓", col: C.green },
                  { v: "alerte", icon: "⚠", col: C.orange },
                  { v: "ko",     icon: "✕", col: C.red },
                ].map(opt => (
                  <button key={opt.v}
                    onClick={(e) => { e.stopPropagation(); updateDim(d.id, { status: s.status === opt.v ? "" : opt.v as Status }); }}
                    style={{
                      flex: 1, padding: "3px 0", fontSize: 11, fontWeight: 700,
                      background: s.status === opt.v ? opt.col : C.s2,
                      border: "none", borderRadius: 3,
                      color: s.status === opt.v ? "#000" : C.muted,
                      cursor: "pointer",
                    }}>
                    {opt.icon}
                  </button>
                ))}
              </div>
              {isExp && (
                <input value={s.note} onChange={e => { e.stopPropagation(); updateDim(d.id, { note: e.target.value }); }}
                  onClick={e => e.stopPropagation()}
                  placeholder={`Note ${d.label.toLowerCase()}...`}
                  style={{ width: "100%", marginTop: 4, padding: "3px 6px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 3, color: C.text, fontSize: 10, boxSizing: "border-box" }} />
              )}
              {!isExp && s.note && (
                <div style={{ fontSize: 9, color: C.muted, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.note}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function summarize(d: SqdcpData): string {
  return DIMENSIONS.map(dim => {
    const s = d[dim.id];
    const icon = s.status === "ok" ? "✓" : s.status === "alerte" ? "⚠" : s.status === "ko" ? "✕" : "·";
    return `${dim.id}${icon}`;
  }).join(" ");
}
