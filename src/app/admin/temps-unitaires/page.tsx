"use client";
import { useEffect, useState } from "react";

interface Tache {
  id: string;
  nom: string;
  temps_unitaire: number;
  unite: string;
  categorie: string;
  parallelisable: boolean;
  ordre: number;
  actif: boolean;
}

export default function TempsUnitairesAdmin() {
  const [items, setItems] = useState<Tache[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");

  const reload = async () => {
    setLoading(true);
    const res = await fetch("/api/taches");
    if (res.ok) setItems(await res.json());
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  const update = (id: string, patch: Partial<Tache>) => {
    setItems(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
  };

  const save = async (t: Tache) => {
    setSavingId(t.id);
    setFeedback("");
    try {
      const res = await fetch(`/api/taches/${t.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          temps_unitaire: t.temps_unitaire,
          unite: t.unite,
          parallelisable: t.parallelisable,
          actif: t.actif,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setFeedback(`Erreur : ${err.error || res.statusText}`);
      } else {
        setFeedback(`✓ ${t.nom} mis à jour`);
      }
    } finally {
      setSavingId(null);
      setTimeout(() => setFeedback(""), 3000);
    }
  };

  const reset = async () => {
    if (!confirm("Réinitialiser TOUS les temps aux valeurs par défaut ?")) return;
    const res = await fetch("/api/taches/reset", { method: "POST" });
    if (res.ok) {
      setFeedback("✓ Réinitialisé aux valeurs par défaut");
      reload();
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20, marginBottom: 6 }}>Temps unitaires (calibration)</h1>
      <p style={{ fontSize: 13, color: "#777", marginBottom: 16 }}>
        Modifie ici les durées de référence utilisées par l&apos;algorithme de
        planification. Les valeurs s&apos;appliquent immédiatement.
      </p>
      {feedback && (
        <div style={{ padding: 8, background: "#e3f2fd", border: "1px solid #2196f3", borderRadius: 4, marginBottom: 12, fontSize: 13 }}>
          {feedback}
        </div>
      )}
      {loading ? (
        <div>Chargement…</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f4f4f4" }}>
              <th style={{ textAlign: "left", padding: 8 }}>Nom</th>
              <th style={{ textAlign: "right", padding: 8 }}>Temps</th>
              <th style={{ textAlign: "left", padding: 8 }}>Unité</th>
              <th style={{ textAlign: "center", padding: 8 }}>Parallélisable</th>
              <th style={{ textAlign: "center", padding: 8 }}>Actif</th>
              <th style={{ textAlign: "center", padding: 8 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map(t => (
              <tr key={t.id} style={{ borderTop: "1px solid #ddd" }}>
                <td style={{ padding: 8, fontFamily: "monospace" }}>{t.nom}</td>
                <td style={{ padding: 8, textAlign: "right" }}>
                  <input type="number" value={t.temps_unitaire} step={0.5} min={0}
                    onChange={e => update(t.id, { temps_unitaire: parseFloat(e.target.value) || 0 })}
                    style={{ width: 80, padding: "4px 6px", textAlign: "right" }} />
                </td>
                <td style={{ padding: 8 }}>
                  <input type="text" value={t.unite}
                    onChange={e => update(t.id, { unite: e.target.value })}
                    style={{ width: 60, padding: "4px 6px" }} />
                </td>
                <td style={{ padding: 8, textAlign: "center" }}>
                  <input type="checkbox" checked={t.parallelisable}
                    onChange={e => update(t.id, { parallelisable: e.target.checked })} />
                </td>
                <td style={{ padding: 8, textAlign: "center" }}>
                  <input type="checkbox" checked={t.actif}
                    onChange={e => update(t.id, { actif: e.target.checked })} />
                </td>
                <td style={{ padding: 8, textAlign: "center" }}>
                  <button onClick={() => save(t)} disabled={savingId === t.id}
                    style={{ padding: "4px 12px", cursor: "pointer" }}>
                    {savingId === t.id ? "…" : "Enregistrer"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{ marginTop: 24 }}>
        <button onClick={reset} style={{ padding: "8px 16px", background: "#fff3e0", border: "1px solid #ff9800", color: "#e65100", cursor: "pointer", borderRadius: 4 }}>
          Réinitialiser aux valeurs par défaut
        </button>
      </div>
    </div>
  );
}
