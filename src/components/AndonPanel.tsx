// ═══════════════════════════════════════════════════════════════════════
// ANDON — Signal de problème en temps réel par l'opérateur.
//
// Référence : Toyota Production System — Andon = corde / lampe que tire
// l'opérateur quand il rencontre un problème, ce qui alerte immédiatement
// le management. Ici : bouton "🚨 Signaler un problème" + liste des
// problèmes ouverts visibles en temps réel.
//
// Stockage : table MemoAction avec type="andon" (modèle existant).
// ═══════════════════════════════════════════════════════════════════════

"use client";
import { useState, useEffect, useCallback } from "react";
import { C } from "@/lib/sial-data";

interface Andon {
  id: string;
  auteur: string;
  texte: string;
  type: string;
  priorite: string;
  statut: string;
  poste: string | null;
  commandeId: string | null;
  createdAt: string;
}

const ANDON_RAISONS = [
  { id: "panne_machine",     label: "Panne machine",        icon: "⚙",  priorite: "urgente" },
  { id: "manque_materiel",   label: "Manque matériel",      icon: "📦", priorite: "urgente" },
  { id: "defaut_qualite",    label: "Défaut qualité",       icon: "⚠",  priorite: "urgente" },
  { id: "info_manquante",    label: "Info manquante",       icon: "❓", priorite: "normale" },
  { id: "outillage",         label: "Outillage défectueux", icon: "🔧", priorite: "normale" },
  { id: "securite",          label: "Sécurité",             icon: "🚨", priorite: "critique" },
  { id: "autre",             label: "Autre",                icon: "📝", priorite: "normale" },
];

export default function AndonPanel({ poste }: { poste?: string }) {
  const [andons, setAndons] = useState<Andon[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ raison: "panne_machine", texte: "", poste: poste || "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/memos?statut=ouvert");
      if (!r.ok) return;
      const data = await r.json();
      const list = Array.isArray(data) ? data : [];
      // Filtrer les andon (type="andon") et trier par priorité puis date
      const andonList = list
        .filter((m: Andon) => m.type === "andon")
        .sort((a: Andon, b: Andon) => {
          const prio = (p: string) => p === "critique" ? 0 : p === "urgente" ? 1 : 2;
          const dp = prio(a.priorite) - prio(b.priorite);
          if (dp !== 0) return dp;
          return b.createdAt.localeCompare(a.createdAt);
        });
      setAndons(andonList);
    } catch {}
  }, []);

  useEffect(() => {
    load();
    // Rafraîchir toutes les 30s
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const submit = async () => {
    if (!draft.texte.trim() || saving) return;
    setSaving(true);
    const raison = ANDON_RAISONS.find(r => r.id === draft.raison)!;
    try {
      const res = await fetch("/api/memos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texte: `${raison.icon} ${raison.label} — ${draft.texte}`,
          type: "andon",
          priorite: raison.priorite,
          statut: "ouvert",
          poste: draft.poste || null,
          metadata: { raison: draft.raison },
        }),
      });
      if (res.ok) {
        await load();
        setDraft({ raison: "panne_machine", texte: "", poste: poste || "" });
        setAdding(false);
      }
    } catch {}
    setSaving(false);
  };

  const resolve = async (id: string) => {
    try {
      await fetch(`/api/memos`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, statut: "fait" }),
      });
      await load();
    } catch {}
  };

  const hasAndons = andons.length > 0;
  const critique = andons.some(a => a.priorite === "critique");
  const urgent = andons.some(a => a.priorite === "urgente");

  return (
    <div style={{
      background: critique ? C.red + "15" : urgent ? C.orange + "12" : C.s1,
      border: `1px solid ${critique ? C.red : urgent ? C.orange : C.border}`,
      borderRadius: 6, padding: "10px 14px", marginBottom: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: hasAndons || adding ? 8 : 0 }}>
        <span style={{ fontSize: 14 }}>🚨</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: critique ? C.red : urgent ? C.orange : C.text }}>
          Andon — Problèmes signalés
        </span>
        {hasAndons && (
          <span style={{
            fontSize: 11, fontWeight: 700,
            padding: "1px 8px", borderRadius: 3,
            background: critique ? C.red + "33" : urgent ? C.orange + "33" : C.s2,
            color: critique ? C.red : urgent ? C.orange : C.sec,
          }}>
            {andons.length} ouvert{andons.length > 1 ? "s" : ""}
          </span>
        )}
        <span style={{ fontSize: 10, color: C.muted, flex: 1 }}>
          Signale immédiatement un blocage pour que la cause soit traitée
        </span>
        {!adding && (
          <button onClick={() => setAdding(true)} style={{
            padding: "5px 12px", fontSize: 11, fontWeight: 700,
            background: C.red, border: "none", borderRadius: 4,
            color: "#fff", cursor: "pointer",
          }}>
            🚨 Signaler
          </button>
        )}
      </div>

      {adding && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", padding: "8px 0 0", borderTop: `1px solid ${C.border}` }}>
          <select value={draft.raison} onChange={e => setDraft(p => ({ ...p, raison: e.target.value }))}
            style={{ padding: "5px 8px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 3, color: C.text, fontSize: 11 }}>
            {ANDON_RAISONS.map(r => <option key={r.id} value={r.id}>{r.icon} {r.label}</option>)}
          </select>
          <input value={draft.poste} onChange={e => setDraft(p => ({ ...p, poste: e.target.value }))}
            placeholder="Poste (ex: C3, F2…)" style={{ padding: "5px 8px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 3, color: C.text, fontSize: 11, width: 100 }} />
          <input value={draft.texte} onChange={e => setDraft(p => ({ ...p, texte: e.target.value }))}
            placeholder="Détail du problème..." autoFocus
            onKeyDown={e => { if (e.key === "Enter") submit(); }}
            style={{ flex: 1, minWidth: 200, padding: "5px 10px", background: C.bg, border: `1px solid ${C.red}`, borderRadius: 3, color: C.text, fontSize: 11 }} />
          <button onClick={submit} disabled={!draft.texte.trim() || saving}
            style={{ padding: "5px 14px", fontSize: 11, fontWeight: 700, background: !draft.texte.trim() ? C.s2 : C.red, border: "none", borderRadius: 4, color: !draft.texte.trim() ? C.muted : "#fff", cursor: !draft.texte.trim() ? "default" : "pointer" }}>
            Envoyer
          </button>
          <button onClick={() => setAdding(false)} style={{ padding: "5px 8px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, fontSize: 11, cursor: "pointer" }}>
            ✕
          </button>
        </div>
      )}

      {hasAndons && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: adding ? 6 : 0 }}>
          {andons.map(a => {
            const prioColor = a.priorite === "critique" ? C.red : a.priorite === "urgente" ? C.orange : C.sec;
            return (
              <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, padding: "5px 8px", background: C.bg, borderRadius: 3, borderLeft: `3px solid ${prioColor}` }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: prioColor, textTransform: "uppercase", minWidth: 60 }}>
                  {a.priorite}
                </span>
                {a.poste && <span style={{ fontWeight: 700, color: C.text, minWidth: 35 }}>{a.poste}</span>}
                <span style={{ flex: 1, color: C.text }}>{a.texte}</span>
                <span style={{ fontSize: 9, color: C.muted }}>{a.auteur}</span>
                <span style={{ fontSize: 9, color: C.muted }}>
                  {new Date(a.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
                <button onClick={() => resolve(a.id)} title="Marquer résolu"
                  style={{ padding: "2px 8px", fontSize: 10, fontWeight: 700, background: C.green + "22", border: `1px solid ${C.green}`, borderRadius: 3, color: C.green, cursor: "pointer" }}>
                  ✓
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
