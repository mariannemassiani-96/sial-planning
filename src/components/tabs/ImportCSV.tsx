"use client";
import { useState, useRef } from "react";
import { C } from "@/lib/sial-data";
import { H, Card } from "@/components/ui";

export default function ImportCSV({ onRefresh }: { onRefresh: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [skipDelivered, setSkipDelivered] = useState(true);
  const [skipAnnule, setSkipAnnule] = useState(true);
  const [result, setResult] = useState<{ imported: number; skipped: number; dupes: number; errors: number; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
    setResult(null);
    setError(null);
  };

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Try UTF-8 first, then latin-1 as fallback
      let text = await file.text();
      // If we see garbled characters (common with Excel CSV latin-1), re-read as latin-1
      if (text.includes("Ã") || text.includes("â€")) {
        const buf = await file.arrayBuffer();
        text = new TextDecoder("latin-1").decode(buf);
      }

      const res = await fetch("/api/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text, skipDelivered, skipAnnule }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Erreur import");
        return;
      }

      const data = await res.json();
      setResult(data);
      if (data.imported > 0) onRefresh();
    } catch (e: any) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const inp = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "7px 11px", color: C.text, fontSize: 13, cursor: "pointer" };
  const chk = { width: 14, height: 14, cursor: "pointer", accentColor: C.orange };

  return (
    <div>
      <H c={C.orange}>Import commandes — Fichier Excel (CSV)</H>

      <Card>
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: C.sec, margin: "0 0 10px" }}>
            Importez vos commandes depuis un export CSV Excel (encodage UTF-8 ou Latin-1, séparateur <code>;</code> ou <code>,</code>).
            Les doublons (même client + chantier déjà en base) sont automatiquement ignorés.
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button
              onClick={() => fileRef.current?.click()}
              style={{ ...inp, padding: "8px 16px", border: `1px solid ${C.orange}66`, color: C.orange, fontWeight: 700, fontSize: 12 }}
            >
              📂 Choisir fichier CSV
            </button>
            <span style={{ fontSize: 12, color: file ? C.text : C.muted }}>
              {file ? file.name : "Aucun fichier sélectionné"}
            </span>
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} style={{ display: "none" }} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 20, marginBottom: 16, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: C.sec, cursor: "pointer" }}>
            <input type="checkbox" checked={skipDelivered} onChange={e => setSkipDelivered(e.target.checked)} style={chk} />
            Ignorer les commandes Livrées / Facturées
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: C.sec, cursor: "pointer" }}>
            <input type="checkbox" checked={skipAnnule} onChange={e => setSkipAnnule(e.target.checked)} style={chk} />
            Ignorer les commandes Annulées
          </label>
        </div>

        <button
          onClick={handleImport}
          disabled={!file || loading}
          style={{
            padding: "9px 24px", background: file && !loading ? C.orange : C.s2,
            border: "none", borderRadius: 5, color: file && !loading ? "#fff" : C.muted,
            cursor: file && !loading ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 700,
          }}
        >
          {loading ? "⏳ Import en cours…" : "⬆ Importer"}
        </button>
      </Card>

      {error && (
        <div style={{ marginTop: 12, padding: "10px 14px", background: C.red + "22", border: `1px solid ${C.red}55`, borderRadius: 5, fontSize: 12, color: C.red }}>
          ❌ {error}
        </div>
      )}

      {result && (
        <Card style={{ marginTop: 12, border: `1px solid ${C.teal}44` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.teal, marginBottom: 10 }}>✅ Import terminé</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
            {[
              { label: "Total lignes CSV", val: result.total, c: C.sec },
              { label: "Importées", val: result.imported, c: C.teal },
              { label: "Doublons ignorés", val: result.dupes, c: C.blue },
              { label: "Filtrées (statut)", val: result.skipped, c: C.orange },
              { label: "Erreurs", val: result.errors, c: result.errors > 0 ? C.red : C.muted },
            ].map(item => (
              <div key={item.label} style={{ background: C.s2, borderRadius: 5, padding: "8px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: item.c }}>{item.val}</div>
                <div style={{ fontSize: 10, color: C.sec, marginTop: 2 }}>{item.label}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div style={{ marginTop: 20, padding: "12px 16px", background: C.s2, borderRadius: 6, fontSize: 11, color: C.sec }}>
        <strong style={{ color: C.text }}>Colonnes reconnues dans le CSV :</strong>
        <div style={{ marginTop: 6, lineHeight: 1.7 }}>
          <code>Clients</code> → Client &nbsp;|&nbsp;
          <code>Chantiers</code> → Réf. chantier &nbsp;|&nbsp;
          <code>Type</code> → Type commande &nbsp;|&nbsp;
          <code>Statut</code> → Statut &nbsp;|&nbsp;
          <code>Zone De Livraison</code> → Zone &nbsp;|&nbsp;
          <code>CA</code> → Montant HT &nbsp;|&nbsp;
          <code>AR LIVRAISON</code> → Date livraison &nbsp;|&nbsp;
          <code>Semaine Montage</code> → Semaine théorique &nbsp;|&nbsp;
          <code>Nbre Châssis</code> → Quantité &nbsp;|&nbsp;
          <code>Chauffeur</code> → Transporteur &nbsp;|&nbsp;
          <code>Commande Alu/PVC</code> → Cde alu/pvc passée &nbsp;|&nbsp;
          <code>Commentaires</code> / <code>MATIERE</code> / <code>COULEUR</code> → Notes
        </div>
      </div>
    </div>
  );
}
