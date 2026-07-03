"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { C, getWeekNum } from "@/lib/sial-data";
import { H, Card } from "@/components/ui";

// ═════════════════════════════════════════════════════════════════════════
// Planning AJ — remplacement de l'Excel du chef d'atelier.
//
// Grille très simple : lignes = étapes (personnalisables), colonnes = jours
// (Lun→Ven). Chaque cellule accepte plusieurs chantiers empilés (drop cible).
// Drag & drop natif HTML5 (pas de dépendance).
//
// Sauvegarde debounced sur PUT /api/planning-aj.
// ═════════════════════════════════════════════════════════════════════════

const DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi"] as const;
type Day = typeof DAYS[number];

const DEFAULT_ETAPES = [
  "Coupe LMT",
  "Coupe LMT/DT",
  "Renfort",
  "Soudure",
  "Montage PVC",
  "Montage ALU",
  "Vitrage",
  "ISULA",
  "Emballage",
];

interface CellItem {
  chantier: string;
  qte_theo: number | string;   // "" quand vide
  qte_reel: number | string;   // "" quand vide, ou string avec commentaires ("0 Fini")
  note: string;
  color?: string;              // hex — attribué automatiquement par hash
}

interface PlanningData {
  etapes: string[];
  chantiers_extra: string[];
  cells: Record<string, CellItem[]>;   // clé "Etape|jour"
}

interface Commande {
  id: string;
  client: string;
  ref_chantier?: string | null;
  statut?: string;
  quantite?: number;
  date_livraison_souhaitee?: string | null;
  priorite?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Semaine ISO courante pour un cursor Date. */
function currentIsoSemaine(d: Date = new Date()): string {
  const w = getWeekNum(d);
  return `S${w} ${d.getFullYear()}`;
}

function isoSemaineDelta(current: string, delta: number): string {
  // "S25 2026" → +N semaines
  const m = current.match(/^S(\d+)\s+(\d{4})$/);
  if (!m) return current;
  let w = parseInt(m[1]) + delta;
  let y = parseInt(m[2]);
  // Approximation simple : gestion basique dépassement 52/53.
  while (w < 1) { y -= 1; w += 52; }
  while (w > 52) { y += 1; w -= 52; }
  return `S${w} ${y}`;
}

/** Couleur stable par nom (hash simple → HSL agréable). */
function colorForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) & 0xffffff;
  }
  const hue = h % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

function cellKey(etape: string, day: Day): string {
  return `${etape}|${day}`;
}

// ── Composant ──────────────────────────────────────────────────────────────

export default function PlanningAJ({ commandes }: { commandes: Commande[] }) {
  const [semaine, setSemaine] = useState<string>(currentIsoSemaine());
  const [data, setData] = useState<PlanningData>({
    etapes: DEFAULT_ETAPES,
    chantiers_extra: [],
    cells: {},
  });
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showRestant, setShowRestant] = useState(true);
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Chargement de la semaine ─────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    fetch(`/api/planning-aj?semaine=${encodeURIComponent(semaine)}`)
      .then(r => r.ok ? r.json() : { data: { etapes: DEFAULT_ETAPES, chantiers_extra: [], cells: {} } })
      .then(res => {
        const d = res.data || { etapes: DEFAULT_ETAPES, chantiers_extra: [], cells: {} };
        // Sécurité
        if (!Array.isArray(d.etapes) || d.etapes.length === 0) d.etapes = DEFAULT_ETAPES;
        if (!Array.isArray(d.chantiers_extra)) d.chantiers_extra = [];
        if (!d.cells) d.cells = {};
        setData(d);
        setDirty(false);
      })
      .finally(() => setLoading(false));
  }, [semaine]);

  // ── Sauvegarde debounced ──────────────────────────────────────────────
  const save = useCallback((next: PlanningData) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const r = await fetch("/api/planning-aj", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ semaine, data: next }),
        });
        if (r.ok) {
          setLastSaved(new Date());
          setDirty(false);
        }
      } catch (e) {
        console.error("[PlanningAJ save]", e);
      }
    }, 500);
  }, [semaine]);

  const update = useCallback((next: PlanningData) => {
    setData(next);
    setDirty(true);
    save(next);
  }, [save]);

  // ── Actions ───────────────────────────────────────────────────────────

  const addEtape = () => {
    const nom = prompt("Nom de l'étape (ex : « Contrôle qualité »)")?.trim();
    if (!nom) return;
    if (data.etapes.includes(nom)) {
      alert("Cette étape existe déjà.");
      return;
    }
    update({ ...data, etapes: [...data.etapes, nom] });
  };

  const renameEtape = (old: string) => {
    const nom = prompt(`Renommer « ${old} » en :`, old)?.trim();
    if (!nom || nom === old) return;
    if (data.etapes.includes(nom)) {
      alert("Ce nom existe déjà.");
      return;
    }
    // Renommer partout dans les clés
    const newCells: Record<string, CellItem[]> = {};
    for (const [k, v] of Object.entries(data.cells)) {
      const [ep, d] = k.split("|");
      if (ep === old) newCells[`${nom}|${d}`] = v;
      else newCells[k] = v;
    }
    update({
      ...data,
      etapes: data.etapes.map(e => e === old ? nom : e),
      cells: newCells,
    });
  };

  const deleteEtape = (etape: string) => {
    if (!confirm(`Supprimer l'étape « ${etape} » et tous ses chantiers posés ?`)) return;
    const newCells: Record<string, CellItem[]> = {};
    for (const [k, v] of Object.entries(data.cells)) {
      if (!k.startsWith(etape + "|")) newCells[k] = v;
    }
    update({
      ...data,
      etapes: data.etapes.filter(e => e !== etape),
      cells: newCells,
    });
  };

  const addChantierExtra = () => {
    const nom = prompt("Nom du chantier (ex : « Villa Ottavi »)")?.trim();
    if (!nom) return;
    if (data.chantiers_extra.includes(nom)) {
      alert("Ce chantier est déjà dans la liste.");
      return;
    }
    update({ ...data, chantiers_extra: [...data.chantiers_extra, nom] });
  };

  const removeChantierExtra = (nom: string) => {
    if (!confirm(`Retirer « ${nom} » de la liste (les cellules qui l'utilisent restent) ?`)) return;
    update({ ...data, chantiers_extra: data.chantiers_extra.filter(c => c !== nom) });
  };

  const copyFromPrev = async () => {
    const prev = isoSemaineDelta(semaine, -1);
    if (!confirm(`Copier la semaine ${prev} vers ${semaine} ? Les quantités "réalisées" seront remises à zéro.`)) return;
    const r = await fetch("/api/planning-aj/copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: prev, to: semaine }),
    });
    if (r.ok) {
      // Recharger
      const rr = await fetch(`/api/planning-aj?semaine=${encodeURIComponent(semaine)}`);
      const d = await rr.json();
      setData(d.data);
      setDirty(false);
    } else {
      const err = await r.json().catch(() => ({}));
      alert(`Impossible : ${err.error || r.statusText}`);
    }
  };

  // ── Drop dans une cellule ─────────────────────────────────────────────

  const onDrop = (etape: string, day: Day, dataTransfer: DataTransfer) => {
    const raw = dataTransfer.getData("text/plain");
    if (!raw) return;
    // Format : "chantier:<nom>" pour un nouveau drop
    // Format : "move:<fromKey>:<idx>:<nom>" pour un déplacement
    const key = cellKey(etape, day);

    if (raw.startsWith("move:")) {
      const [, fromKey, idxStr] = raw.split(":");
      const idx = parseInt(idxStr);
      const from = data.cells[fromKey] || [];
      if (fromKey === key) return; // pas de move sur la même cell
      const item = from[idx];
      if (!item) return;
      const newFrom = from.filter((_, i) => i !== idx);
      const newTo = [...(data.cells[key] || []), item];
      const cells = { ...data.cells, [fromKey]: newFrom, [key]: newTo };
      // Nettoyage : supprimer les clés vides
      if (newFrom.length === 0) delete cells[fromKey];
      update({ ...data, cells });
      return;
    }

    if (raw.startsWith("chantier:")) {
      const nom = raw.slice("chantier:".length);
      const existing = data.cells[key] || [];
      const item: CellItem = {
        chantier: nom,
        qte_theo: "",
        qte_reel: "",
        note: "",
        color: colorForName(nom),
      };
      update({ ...data, cells: { ...data.cells, [key]: [...existing, item] } });
    }
  };

  const updateItem = (key: string, idx: number, patch: Partial<CellItem>) => {
    const arr = [...(data.cells[key] || [])];
    if (!arr[idx]) return;
    arr[idx] = { ...arr[idx], ...patch };
    update({ ...data, cells: { ...data.cells, [key]: arr } });
  };

  const deleteItem = (key: string, idx: number) => {
    const arr = (data.cells[key] || []).filter((_, i) => i !== idx);
    const cells = { ...data.cells };
    if (arr.length === 0) delete cells[key];
    else cells[key] = arr;
    update({ ...data, cells });
  };

  // ── Chantiers actifs = commandes non livrées + chantiers_extra ────────
  type ChantierRow = {
    nom: string; qte: number; priorite: string; deadline: string;
    source: "commande" | "extra";
  };
  const chantiersActifs = useMemo<ChantierRow[]>(() => {
    const fromCommandes: ChantierRow[] = commandes
      .filter(c => !["livre", "terminee", "annulee"].includes(String(c.statut)))
      .map(c => ({
        nom: (c.ref_chantier || c.client) as string,
        qte: c.quantite || 0,
        priorite: c.priorite || "normale",
        deadline: c.date_livraison_souhaitee || "",
        source: "commande",
      }));
    const fromExtra: ChantierRow[] = data.chantiers_extra.map(nom => ({
      nom, qte: 0, priorite: "normale", deadline: "",
      source: "extra",
    }));
    const seen = new Set<string>();
    const merged: ChantierRow[] = [];
    for (const c of [...fromExtra, ...fromCommandes]) {
      if (!c.nom || seen.has(c.nom)) continue;
      seen.add(c.nom);
      merged.push(c);
    }
    return merged;
  }, [commandes, data.chantiers_extra]);

  // ── Étapes posées par chantier (pour le compteur "reste à positionner") ──
  const etapesPosees = useMemo(() => {
    const map = new Map<string, Set<string>>();  // chantier → set of "Etape|day"
    for (const [key, items] of Object.entries(data.cells)) {
      for (const it of items) {
        if (!map.has(it.chantier)) map.set(it.chantier, new Set());
        map.get(it.chantier)!.add(key);
      }
    }
    return map;
  }, [data.cells]);

  // Chantiers non posés du tout cette semaine
  const chantiersNonPoses = useMemo(() => {
    return chantiersActifs.filter(c => !etapesPosees.has(c.nom));
  }, [chantiersActifs, etapesPosees]);

  if (loading) {
    return <Card><div style={{ padding: 20, color: C.sec }}>Chargement…</div></Card>;
  }

  return (
    <Card>
      {/* ══ HEADER ═══════════════════════════════════════════════════════════ */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setSemaine(isoSemaineDelta(semaine, -1))}
            style={btnNav}>← Sem. précédente</button>
          <H c={C.cyan}>📋 Planning AJ — {semaine}</H>
          <button onClick={() => setSemaine(isoSemaineDelta(semaine, 1))}
            style={btnNav}>Sem. suivante →</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <button onClick={copyFromPrev} style={btnAction}>📋 Copier depuis sem. précédente</button>
          <button onClick={addEtape} style={btnAction}>+ Étape</button>
          <button onClick={addChantierExtra} style={btnAction}>+ Chantier</button>
          <button onClick={() => setShowRestant(v => !v)} style={btnAction}>
            {showRestant ? "◀ Masquer" : "▶ Voir"} restants
          </button>
          <div style={{ fontSize: 10, color: dirty ? C.orange : C.green, minWidth: 90, textAlign: "right" }}>
            {dirty ? "💾 Sauvegarde…" : lastSaved ? `✓ ${lastSaved.toLocaleTimeString().slice(0, 5)}` : "✓ Sauvé"}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: showRestant ? "260px 1fr" : "1fr", gap: 10 }}>
        {/* ══ PANNEAU CHANTIERS ═══════════════════════════════════════════ */}
        {showRestant && (
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, maxHeight: 780, overflowY: "auto" }}>
            <div style={{ fontSize: 10, color: C.orange, fontWeight: 700, marginBottom: 6, letterSpacing: "0.05em" }}>
              CHANTIERS ({chantiersActifs.length})
            </div>
            {chantiersNonPoses.length > 0 && (
              <div style={{ marginBottom: 8, padding: 6, background: C.red + "18", border: `1px solid ${C.red}`, borderRadius: 4 }}>
                <div style={{ fontSize: 10, color: C.red, fontWeight: 700, marginBottom: 4 }}>
                  ⚠ {chantiersNonPoses.length} PAS POSITIONNÉ(S)
                </div>
                <div style={{ fontSize: 9, color: C.sec }}>Tirez-les dans la grille →</div>
              </div>
            )}
            {chantiersActifs.map(c => {
              const posed = etapesPosees.get(c.nom);
              const nbPosed = posed?.size || 0;
              const color = colorForName(c.nom);
              return (
                <div key={c.nom}
                  draggable
                  onDragStart={e => {
                    e.dataTransfer.setData("text/plain", `chantier:${c.nom}`);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  style={{
                    padding: "6px 8px",
                    marginBottom: 4,
                    background: nbPosed === 0 ? "#fff" : color + "22",
                    border: `2px solid ${color}`,
                    borderLeftWidth: 5,
                    borderRadius: 4,
                    cursor: "grab",
                    fontSize: 11,
                  }}
                  title={`${c.qte ? c.qte + " unités · " : ""}${c.priorite}${c.deadline ? " · " + c.deadline : ""}${c.source === "extra" ? " · ad hoc" : ""}`}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
                    <span style={{ fontWeight: 700, color: C.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.nom}
                    </span>
                    <span style={{ fontSize: 9, color: nbPosed === 0 ? C.red : C.green, fontWeight: 700 }}>
                      {nbPosed === 0 ? "○" : `✓ ${nbPosed}`}
                    </span>
                  </div>
                  <div style={{ fontSize: 9, color: C.muted, display: "flex", justifyContent: "space-between" }}>
                    <span>{c.qte > 0 ? `${c.qte} unités` : ""}</span>
                    <span>
                      {c.priorite === "urgente" && "🔥 urgent"}
                      {c.priorite === "chantier_bloque" && "🔴 bloqué"}
                      {c.source === "extra" && (
                        <span onClick={() => removeChantierExtra(c.nom)}
                          style={{ cursor: "pointer", color: C.red, marginLeft: 6 }}>✕</span>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
            {chantiersActifs.length === 0 && (
              <div style={{ fontSize: 10, color: C.muted, fontStyle: "italic", padding: 8 }}>
                Aucun chantier actif. Cliquez « + Chantier » pour en ajouter un ad hoc.
              </div>
            )}
          </div>
        )}

        {/* ══ GRILLE ══════════════════════════════════════════════════════ */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: 700 }}>
            <colgroup>
              <col style={{ width: 130 }} />
              {DAYS.map(d => <col key={d} />)}
            </colgroup>
            <thead>
              <tr>
                <th style={thStyle}></th>
                {DAYS.map(d => (
                  <th key={d} style={{ ...thStyle, textTransform: "capitalize" }}>{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.etapes.map(etape => (
                <tr key={etape}>
                  <td style={{ ...tdEtape }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 11 }}>{etape}</span>
                      <span style={{ display: "flex", gap: 3 }}>
                        <button onClick={() => renameEtape(etape)} style={miniBtn} title="Renommer">✎</button>
                        <button onClick={() => deleteEtape(etape)} style={{ ...miniBtn, color: C.red }} title="Supprimer">✕</button>
                      </span>
                    </div>
                  </td>
                  {DAYS.map(day => {
                    const key = cellKey(etape, day);
                    const items = data.cells[key] || [];
                    const focused = selectedCell === key;
                    return (
                      <td key={day}
                        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                        onDrop={e => { e.preventDefault(); onDrop(etape, day, e.dataTransfer); }}
                        onClick={() => setSelectedCell(key)}
                        style={{
                          ...tdCell,
                          background: focused ? C.cyan + "0F" : "transparent",
                        }}>
                        {items.map((it, idx) => (
                          <CellItemCard key={`${idx}-${it.chantier}`}
                            item={it}
                            onEdit={patch => updateItem(key, idx, patch)}
                            onDelete={() => deleteItem(key, idx)}
                            onDragStart={e => {
                              e.dataTransfer.setData("text/plain",
                                `move:${key}:${idx}:${it.chantier}`);
                              e.dataTransfer.effectAllowed = "move";
                            }}
                          />
                        ))}
                        {items.length === 0 && (
                          <div style={{ height: 22, border: `1px dashed ${C.border}`, borderRadius: 3, background: focused ? C.cyan + "11" : "transparent" }} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

// ── Sous-composant : une card chantier dans une cellule ────────────────────

function CellItemCard({
  item, onEdit, onDelete, onDragStart,
}: {
  item: CellItem;
  onEdit: (patch: Partial<CellItem>) => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const color = item.color || colorForName(item.chantier);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      style={{
        borderLeft: `4px solid ${color}`,
        background: color + "15",
        padding: "3px 5px",
        marginBottom: 3,
        borderRadius: 3,
        fontSize: 10,
        cursor: "grab",
      }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
        <span style={{ fontWeight: 700, color: C.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          onClick={() => setExpanded(!expanded)} title={item.chantier}>
          {item.chantier}
        </span>
        <span style={{ display: "flex", gap: 2 }}>
          <input type="text" inputMode="numeric" value={String(item.qte_theo)}
            onChange={e => onEdit({ qte_theo: e.target.value })}
            placeholder="Th"
            style={inputMini} title="Quantité théorique" />
          <input type="text" value={String(item.qte_reel)}
            onChange={e => onEdit({ qte_reel: e.target.value })}
            placeholder="R"
            style={{ ...inputMini, color: item.qte_reel !== "" ? C.green : C.text }}
            title="Quantité réalisée (ou commentaire libre)" />
          <button onClick={onDelete} style={{ ...miniBtn, color: C.red }} title="Retirer">✕</button>
        </span>
      </div>
      {expanded && (
        <div style={{ marginTop: 3, display: "flex", gap: 3 }}>
          <input type="text" value={item.note}
            onChange={e => onEdit({ note: e.target.value })}
            placeholder="Note (ex. Manque paumelles)"
            style={{ ...inputMini, flex: 1, textAlign: "left" }} />
        </div>
      )}
      {!expanded && item.note && (
        <div style={{ fontSize: 9, color: C.orange, marginTop: 2, cursor: "pointer" }}
          onClick={() => setExpanded(true)}>💬 {item.note}</div>
      )}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const btnNav: React.CSSProperties = {
  padding: "5px 10px", background: C.s2, border: `1px solid ${C.border}`,
  borderRadius: 4, color: C.sec, fontSize: 11, cursor: "pointer",
};
const btnAction: React.CSSProperties = {
  padding: "5px 10px", background: C.cyan + "22", border: `1px solid ${C.cyan}`,
  borderRadius: 4, color: C.cyan, fontSize: 11, cursor: "pointer", fontWeight: 600,
};
const miniBtn: React.CSSProperties = {
  background: "none", border: "none", color: C.sec, fontSize: 10,
  cursor: "pointer", padding: "0 3px",
};
const inputMini: React.CSSProperties = {
  width: 28, padding: "1px 3px", fontSize: 10, textAlign: "center",
  background: C.bg, border: `1px solid ${C.border}`, borderRadius: 2,
  color: C.text, outline: "none",
};
const thStyle: React.CSSProperties = {
  padding: "4px 6px", background: C.s2, border: `1px solid ${C.border}`,
  fontSize: 11, color: C.sec, fontWeight: 700, textAlign: "left",
};
const tdEtape: React.CSSProperties = {
  padding: "3px 6px", background: C.s2, border: `1px solid ${C.border}`,
  verticalAlign: "top", color: C.text,
};
const tdCell: React.CSSProperties = {
  padding: 3, border: `1px solid ${C.border}`, verticalAlign: "top",
  minHeight: 40, cursor: "cell",
};
