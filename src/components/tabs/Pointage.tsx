"use client";
import { useState, useMemo } from "react";
import { C, fmtDate, CommandeCC } from "@/lib/sial-data";
import { H, Card } from "@/components/ui";

type Etape = { id: "coupe" | "montage" | "vitrage" | "palette"; label: string; c: string };

const ETAPES: Etape[] = [
  { id: "coupe",   label: "Coupe",    c: C.blue   },
  { id: "montage", label: "Montage",  c: C.orange },
  { id: "vitrage", label: "Vitrage",  c: C.cyan   },
  { id: "palette", label: "Palette",  c: C.green  },
];

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function EtapeBadge({
  etape, done, date, onToggle,
}: {
  etape: Etape;
  done: boolean;
  date?: string | null;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      title={done ? `Terminé le ${fmtDate(date)}` : `Marquer ${etape.label} terminé`}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        padding: "6px 10px",
        background: done ? etape.c + "22" : C.s2,
        border: `1px solid ${done ? etape.c : C.border}`,
        borderRadius: 6,
        cursor: "pointer",
        minWidth: 70,
        transition: "background 0.1s",
      }}
    >
      <span style={{ fontSize: 16, lineHeight: 1 }}>{done ? "✅" : "⬜"}</span>
      <span style={{ fontSize: 10, fontWeight: 700, color: done ? etape.c : C.sec }}>{etape.label}</span>
      {done && date && (
        <span style={{ fontSize: 8, color: C.muted }}>{fmtDate(date)}</span>
      )}
    </button>
  );
}

export default function Pointage({
  commandes,
  onPatch,
}: {
  commandes: CommandeCC[];
  onPatch: (id: string, updates: Record<string, unknown>) => void;
}) {
  const [search, setSearch] = useState("");
  const [filtre, setFiltre] = useState<"actif" | "tout">("actif");

  const filtered = useMemo(() => {
    let list = commandes.filter(c => (c as any).statut !== "livre");
    if (filtre === "actif") {
      list = list.filter(c => !(c as any).etape_palette_ok);
    }
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(c =>
        (c.client || "").toLowerCase().includes(s) ||
        ((c as any).ref_chantier || "").toLowerCase().includes(s) ||
        ((c as any).num_commande || "").toLowerCase().includes(s)
      );
    }
    // Sort: critique → retard → priorite → date livraison
    return list.sort((a, b) => {
      const pa = (a as any).priorite === "critique" ? 0 : (a as any).priorite === "haute" ? 1 : 2;
      const pb = (b as any).priorite === "critique" ? 0 : (b as any).priorite === "haute" ? 1 : 2;
      if (pa !== pb) return pa - pb;
      return ((a as any).date_livraison_souhaitee || "9999") < ((b as any).date_livraison_souhaitee || "9999") ? -1 : 1;
    });
  }, [commandes, search, filtre]);

  const handleToggle = (cmd: CommandeCC, etape: Etape) => {
    const okKey = `etape_${etape.id}_ok` as keyof CommandeCC;
    const dateKey = `etape_${etape.id}_date` as keyof CommandeCC;
    const isDone = !!(cmd as any)[okKey];
    onPatch(String(cmd.id), {
      [okKey]: !isDone,
      [dateKey]: !isDone ? todayISO() : null,
    });
  };

  const stats = useMemo(() => {
    const active = commandes.filter(c => (c as any).statut !== "livre");
    return {
      coupe:   active.filter(c => (c as any).etape_coupe_ok).length,
      montage: active.filter(c => (c as any).etape_montage_ok).length,
      vitrage: active.filter(c => (c as any).etape_vitrage_ok).length,
      palette: active.filter(c => (c as any).etape_palette_ok).length,
      total:   active.length,
    };
  }, [commandes]);

  return (
    <div>
      <H c={C.green}>Pointage Production</H>

      {/* Stats */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        {ETAPES.map(e => (
          <Card key={e.id} style={{ padding: "10px 16px", flex: "1 1 auto", minWidth: 100, textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: e.c }}>
              {stats[e.id]}<span style={{ fontSize: 12, color: C.sec, fontWeight: 400 }}>/{stats.total}</span>
            </div>
            <div style={{ fontSize: 10, color: C.sec, marginTop: 2 }}>{e.label} terminé</div>
          </Card>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          placeholder="Rechercher client / chantier / commande…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: "6px 10px", background: C.s1, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontSize: 12 }}
        />
        {(["actif", "tout"] as const).map(f => (
          <button key={f}
            onClick={() => setFiltre(f)}
            style={{
              padding: "6px 12px",
              background: filtre === f ? C.blue + "22" : C.s1,
              border: `1px solid ${filtre === f ? C.blue : C.border}`,
              borderRadius: 4, color: filtre === f ? C.blue : C.sec,
              fontSize: 11, fontWeight: filtre === f ? 700 : 400, cursor: "pointer",
            }}
          >
            {f === "actif" ? "En cours" : "Toutes"}
          </button>
        ))}
        <span style={{ fontSize: 11, color: C.muted }}>{filtered.length} commande(s)</span>
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: C.muted }}>Aucune commande à afficher</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(cmd => {
            const prio = (cmd as any).priorite;
            const prioColor = prio === "critique" ? C.red : prio === "haute" ? C.orange : C.border;
            const allDone = (cmd as any).etape_coupe_ok && (cmd as any).etape_montage_ok &&
                            (cmd as any).etape_vitrage_ok && (cmd as any).etape_palette_ok;
            return (
              <Card key={cmd.id} style={{
                padding: "12px 16px",
                borderLeft: `3px solid ${allDone ? C.green : prioColor}`,
                opacity: allDone ? 0.7 : 1,
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  {/* Info commande */}
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                      {cmd.client || "—"}
                    </div>
                    <div style={{ fontSize: 11, color: C.sec, marginTop: 1 }}>
                      {(cmd as any).ref_chantier || ""}{(cmd as any).num_commande ? ` · N°${(cmd as any).num_commande}` : ""}
                    </div>
                    <div style={{ fontSize: 11, color: C.sec, marginTop: 2 }}>
                      {cmd.quantite}× {cmd.type}
                    </div>
                    {(cmd as any).date_livraison_souhaitee && (
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>
                        Livraison souhaitée : {fmtDate((cmd as any).date_livraison_souhaitee)}
                      </div>
                    )}
                    {prio && prio !== "normale" && (
                      <span style={{
                        display: "inline-block", marginTop: 4,
                        fontSize: 9, fontWeight: 700, padding: "1px 6px",
                        background: prioColor + "22", border: `1px solid ${prioColor}`,
                        borderRadius: 3, color: prioColor,
                      }}>
                        {prio.toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Étapes */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {ETAPES.map(etape => (
                      <EtapeBadge
                        key={etape.id}
                        etape={etape}
                        done={!!(cmd as any)[`etape_${etape.id}_ok`]}
                        date={(cmd as any)[`etape_${etape.id}_date`]}
                        onToggle={() => handleToggle(cmd, etape)}
                      />
                    ))}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
