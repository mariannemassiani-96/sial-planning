"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { C, getWeekNum } from "@/lib/sial-data";
import { H, Card } from "@/components/ui";

// ═════════════════════════════════════════════════════════════════════════
// Planning AJ — reproduction visuelle du fichier Excel du chef d'atelier.
//
// Layout Excel :
//   Semaine SXX 2026
//   ┌────────┬───────────────────────────────┬───────────────────────────────┐
//   │        │ LUNDI                         │ MARDI                         │ ...
//   │        │ Étape │ Nom │ Qté │ Réalisé  │ Étape │ Nom │ Qté │ Réalisé  │
//   │ Slot 1 │ ...   │ ... │  4  │    4     │ ...
//   │ Slot 2 │ ...
//   └────────┴───────────────────────────────┴───────────────────────────────┘
//
// N semaines empilées à l'écran → drag&drop inter-semaines sans naviguer.
// Panneau backlog à gauche (tâches à positionner).
// ═════════════════════════════════════════════════════════════════════════

const DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi"] as const;
type Day = typeof DAYS[number];
const DAY_LABEL: Record<Day, string> = {
  lundi: "Lundi", mardi: "Mardi", mercredi: "Mercredi",
  jeudi: "Jeudi", vendredi: "Vendredi",
};

const DEFAULT_ETAPES = [
  "Coupe LMT", "Coupe LMT/DT", "Renfort", "Soudure",
  "Montage PVC", "Montage ALU", "Vitrage", "ISULA", "Emballage",
];

interface CellItem {
  etape: string;              // nouveau : l'étape est dans l'item
  chantier: string;
  qte_theo: number | string;
  qte_reel: number | string;
  note: string;
  color?: string;
  backlogId?: string;
}

// Structure du data JSON persisté par semaine
interface PlanningData {
  etapes: string[];                              // liste de choix pour dropdown
  cells: Record<Day | string, CellItem[]>;       // NOUVEAU : indexé par jour
}

interface BacklogItem {
  id: string;
  etape: string;
  chantier: string;
  qte: number | null;
  note: string | null;
  ordre: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function currentIsoSemaine(d: Date = new Date()): string {
  const w = getWeekNum(d);
  return `S${w} ${d.getFullYear()}`;
}

function isoSemaineDelta(current: string, delta: number): string {
  const m = current.match(/^S(\d+)\s+(\d{4})$/);
  if (!m) return current;
  let w = parseInt(m[1]) + delta;
  let y = parseInt(m[2]);
  while (w < 1) { y -= 1; w += 52; }
  while (w > 52) { y += 1; w -= 52; }
  return `S${w} ${y}`;
}

function colorForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) & 0xffffff;
  }
  return `hsl(${h % 360}, 55%, 45%)`;
}

/**
 * Convertit un ancien format (cells indexé par "Etape|jour") vers le
 * nouveau (cells indexé par "jour" avec `etape` dans l'item).
 * Rétro-compat pour les 3 semaines déjà en BDD.
 */
function normalizeData(raw: any): PlanningData {
  const etapes: string[] = Array.isArray(raw?.etapes) && raw.etapes.length
    ? raw.etapes : DEFAULT_ETAPES;
  const oldCells: Record<string, CellItem[]> = raw?.cells || {};
  // Détecter format ancien : au moins une clé contient "|"
  const isOld = Object.keys(oldCells).some(k => k.includes("|"));
  if (!isOld) {
    return { etapes, cells: oldCells };
  }
  const newCells: Record<string, CellItem[]> = {};
  for (const day of DAYS) newCells[day] = [];
  for (const [k, arr] of Object.entries(oldCells)) {
    const [etape, day] = k.split("|");
    if (!DAYS.includes(day as Day)) continue;
    for (const it of arr) {
      newCells[day].push({ ...it, etape: (it as any).etape || etape });
    }
  }
  return { etapes, cells: newCells };
}

function emptyData(): PlanningData {
  const cells: Record<string, CellItem[]> = {};
  for (const d of DAYS) cells[d] = [];
  return { etapes: DEFAULT_ETAPES, cells };
}

// ── Composant ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function PlanningAJ(_props: { commandes?: unknown[] } = {}) {
  const [firstSemaine, setFirstSemaine] = useState<string>(currentIsoSemaine());
  const [nbSemaines, setNbSemaines] = useState<number>(3);
  const [weeks, setWeeks] = useState<Record<string, PlanningData>>({});
  const [backlog, setBacklog] = useState<BacklogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirtyWeeks, setDirtyWeeks] = useState<Set<string>>(new Set());
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showBacklog, setShowBacklog] = useState(true);
  const [filterEtape, setFilterEtape] = useState<string>("");
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Liste des semaines à afficher (dans l'ordre)
  const semainesToShow = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < nbSemaines; i++) out.push(isoSemaineDelta(firstSemaine, i));
    return out;
  }, [firstSemaine, nbSemaines]);

  // ── Chargement / rechargement quand la fenêtre de semaines change ─────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(
      semainesToShow.map(sem =>
        fetch(`/api/planning-aj?semaine=${encodeURIComponent(sem)}`)
          .then(r => r.ok ? r.json() : null)
          .then(res => ({ sem, data: normalizeData(res?.data) }))
          .catch(() => ({ sem, data: emptyData() }))
      )
    ).then(all => {
      if (cancelled) return;
      const map: Record<string, PlanningData> = {};
      for (const { sem, data } of all) map[sem] = data;
      setWeeks(map);
      setDirtyWeeks(new Set());
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [semainesToShow]);

  // ── Chargement backlog ──────────────────────────────────────────────
  const loadBacklog = useCallback(() => {
    fetch("/api/planning-aj/backlog")
      .then(r => r.ok ? r.json() : [])
      .then((data: BacklogItem[]) => setBacklog(Array.isArray(data) ? data : []))
      .catch(() => setBacklog([]));
  }, []);
  useEffect(() => { loadBacklog(); }, [loadBacklog]);

  // ── Sauvegarde par semaine, debounced ────────────────────────────────
  const saveWeek = useCallback((sem: string, next: PlanningData) => {
    if (saveTimers.current[sem]) clearTimeout(saveTimers.current[sem]);
    saveTimers.current[sem] = setTimeout(async () => {
      try {
        const r = await fetch("/api/planning-aj", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ semaine: sem, data: next }),
        });
        if (r.ok) {
          setLastSaved(new Date());
          setDirtyWeeks(prev => {
            const s = new Set(prev); s.delete(sem); return s;
          });
        }
      } catch (e) { console.error("[PlanningAJ save]", sem, e); }
    }, 500);
  }, []);

  const updateWeek = useCallback((sem: string, next: PlanningData) => {
    setWeeks(prev => ({ ...prev, [sem]: next }));
    setDirtyWeeks(prev => new Set(prev).add(sem));
    saveWeek(sem, next);
  }, [saveWeek]);

  // ── Actions grille par semaine ────────────────────────────────────────

  const addRow = (sem: string, day: Day) => {
    const w = weeks[sem]; if (!w) return;
    const newItem: CellItem = {
      etape: w.etapes[0] || "Coupe LMT",
      chantier: "",
      qte_theo: "",
      qte_reel: "",
      note: "",
    };
    const cells = { ...w.cells, [day]: [...(w.cells[day] || []), newItem] };
    updateWeek(sem, { ...w, cells });
  };

  const updateItem = (sem: string, day: Day, idx: number, patch: Partial<CellItem>) => {
    const w = weeks[sem]; if (!w) return;
    const arr = [...(w.cells[day] || [])];
    if (!arr[idx]) return;
    const merged = { ...arr[idx], ...patch };
    if (patch.chantier !== undefined) merged.color = colorForName(patch.chantier);
    arr[idx] = merged;
    updateWeek(sem, { ...w, cells: { ...w.cells, [day]: arr } });
  };

  const deleteItem = (sem: string, day: Day, idx: number) => {
    const w = weeks[sem]; if (!w) return;
    const arr = w.cells[day] || [];
    const item = arr[idx];
    const newArr = arr.filter((_, i) => i !== idx);
    updateWeek(sem, { ...w, cells: { ...w.cells, [day]: newArr } });
    // Si venait du backlog, on l'y remet
    if (item?.backlogId) {
      fetch("/api/planning-aj/backlog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          etape: item.etape,
          chantier: item.chantier,
          qte: typeof item.qte_theo === "number" ? item.qte_theo
            : (item.qte_theo && !isNaN(parseInt(String(item.qte_theo))) ? parseInt(String(item.qte_theo)) : null),
        }),
      }).then(r => r.ok ? r.json() : null)
        .then(newItem => { if (newItem) setBacklog(prev => [...prev, newItem]); })
        .catch(() => {});
    }
  };

  const addEtapeToLibrary = (sem: string) => {
    const nom = prompt("Nouvelle étape (ex : « Contrôle qualité »)")?.trim();
    if (!nom) return;
    const w = weeks[sem]; if (!w) return;
    if (w.etapes.includes(nom)) { alert("Déjà existante."); return; }
    updateWeek(sem, { ...w, etapes: [...w.etapes, nom] });
  };

  const copyFromPrev = async (sem: string) => {
    const prev = isoSemaineDelta(sem, -1);
    if (!confirm(`Copier la semaine ${prev} vers ${sem} ? (les "Réalisé" seront vidés)`)) return;
    const r = await fetch("/api/planning-aj/copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: prev, to: sem }),
    });
    if (r.ok) {
      const rr = await fetch(`/api/planning-aj?semaine=${encodeURIComponent(sem)}`);
      const d = await rr.json();
      setWeeks(prev => ({ ...prev, [sem]: normalizeData(d.data) }));
    } else {
      const err = await r.json().catch(() => ({}));
      alert(`Impossible : ${err.error || r.statusText}`);
    }
  };

  // ── Actions backlog ──────────────────────────────────────────────────

  const addBacklogItem = async () => {
    const etape = prompt("Étape (ex : Coupe LMT, Renfort, Vitrage…)")?.trim();
    if (!etape) return;
    const chantier = prompt("Chantier / produit (ex : Ranch Algelec)")?.trim();
    if (!chantier) return;
    const qteStr = prompt("Quantité (nombre ou laisser vide)")?.trim();
    const qte = qteStr ? parseInt(qteStr) : null;
    try {
      const r = await fetch("/api/planning-aj/backlog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etape, chantier, qte }),
      });
      if (r.ok) {
        const item = await r.json();
        setBacklog(prev => [...prev, item]);
      } else { alert("Erreur création tâche"); }
    } catch { alert("Erreur réseau"); }
  };

  const removeBacklogItem = async (id: string) => {
    if (!confirm("Supprimer cette tâche du backlog ?")) return;
    try {
      const r = await fetch(`/api/planning-aj/backlog/${id}`, { method: "DELETE" });
      if (r.ok) setBacklog(prev => prev.filter(x => x.id !== id));
    } catch { /* silent */ }
  };

  const updateBacklogQte = async (id: string, qte: number | null) => {
    setBacklog(prev => prev.map(x => x.id === id ? { ...x, qte } : x));
    try {
      await fetch(`/api/planning-aj/backlog/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qte }),
      });
    } catch { /* silent */ }
  };

  // ── Drop ─────────────────────────────────────────────────────────────

  const onDrop = async (sem: string, day: Day, e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/plain");
    if (!raw) return;

    // Depuis le backlog
    if (raw.startsWith("backlog:")) {
      const id = raw.slice("backlog:".length);
      const b = backlog.find(x => x.id === id);
      if (!b) return;
      const w = weeks[sem]; if (!w) return;
      const item: CellItem = {
        etape: b.etape,
        chantier: b.chantier,
        qte_theo: b.qte != null ? b.qte : "",
        qte_reel: "",
        note: b.note || "",
        color: colorForName(b.chantier),
        backlogId: b.id,
      };
      const cells = { ...w.cells, [day]: [...(w.cells[day] || []), item] };
      updateWeek(sem, { ...w, cells });
      // Ajouter l'étape à la bibliothèque si inconnue
      if (!w.etapes.includes(b.etape)) {
        updateWeek(sem, { ...w, etapes: [...w.etapes, b.etape], cells });
      }
      try {
        await fetch(`/api/planning-aj/backlog/${id}`, { method: "DELETE" });
      } catch { /* silent */ }
      setBacklog(prev => prev.filter(x => x.id !== id));
      return;
    }

    // Déplacement entre cellules (peut être inter-semaines)
    if (raw.startsWith("move:")) {
      const [, fromSem, fromDay, idxStr] = raw.split(":");
      const idx = parseInt(idxStr);
      const wFrom = weeks[fromSem]; if (!wFrom) return;
      const item = wFrom.cells[fromDay as Day]?.[idx];
      if (!item) return;
      // Si même case (semaine + jour), on ignore
      if (fromSem === sem && fromDay === day) return;
      // Retirer de la source
      const newFromArr = wFrom.cells[fromDay as Day].filter((_, i) => i !== idx);
      const nextFrom = { ...wFrom, cells: { ...wFrom.cells, [fromDay]: newFromArr } };
      // Ajouter à la destination
      const wTo = fromSem === sem ? nextFrom : weeks[sem]; if (!wTo) return;
      const newToArr = [...(wTo.cells[day] || []), item];
      const nextTo = { ...wTo, cells: { ...wTo.cells, [day]: newToArr } };
      // Sauvegarder les deux
      if (fromSem === sem) {
        updateWeek(sem, nextTo);
      } else {
        updateWeek(fromSem, nextFrom);
        updateWeek(sem, nextTo);
      }
    }
  };

  // ── Backlog filtré ────────────────────────────────────────────────────

  const backlogFiltered = useMemo(() => {
    if (!filterEtape) return backlog;
    return backlog.filter(b => b.etape === filterEtape);
  }, [backlog, filterEtape]);

  const backlogByEtape = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of backlog) map.set(b.etape, (map.get(b.etape) || 0) + 1);
    return map;
  }, [backlog]);

  // Liste globale des étapes connues (union de toutes les semaines + backlog)
  const allEtapes = useMemo(() => {
    const set = new Set<string>(DEFAULT_ETAPES);
    for (const w of Object.values(weeks)) for (const e of w.etapes) set.add(e);
    for (const b of backlog) set.add(b.etape);
    return Array.from(set);
  }, [weeks, backlog]);

  if (loading) {
    return <Card><div style={{ padding: 20, color: C.sec }}>Chargement…</div></Card>;
  }

  const nbDirty = dirtyWeeks.size;

  return (
    <Card>
      {/* ══ HEADER ═══════════════════════════════════════════════════════════ */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setFirstSemaine(isoSemaineDelta(firstSemaine, -1))} style={btnNav}>← Reculer</button>
          <H c={C.cyan}>📋 Planning AJ</H>
          <span style={{ fontSize: 12, color: C.sec }}>
            Fenêtre : {firstSemaine} → {isoSemaineDelta(firstSemaine, nbSemaines - 1)}
          </span>
          <button onClick={() => setFirstSemaine(isoSemaineDelta(firstSemaine, 1))} style={btnNav}>Avancer →</button>
          <select value={nbSemaines} onChange={e => setNbSemaines(parseInt(e.target.value))}
            style={{ ...btnNav, cursor: "pointer" }}>
            <option value={1}>1 semaine</option>
            <option value={2}>2 semaines</option>
            <option value={3}>3 semaines</option>
            <option value={4}>4 semaines</option>
            <option value={5}>5 semaines</option>
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <button onClick={addBacklogItem} style={btnAction}>+ Tâche (backlog)</button>
          <button onClick={() => setShowBacklog(v => !v)} style={btnAction}>
            {showBacklog ? "◀ Masquer" : "▶ Voir"} backlog ({backlog.length})
          </button>
          <div style={{ fontSize: 10, color: nbDirty > 0 ? C.orange : C.green, minWidth: 100, textAlign: "right" }}>
            {nbDirty > 0 ? `💾 ${nbDirty} sauv…` : lastSaved ? `✓ ${lastSaved.toLocaleTimeString().slice(0, 5)}` : "✓ Sauvé"}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: showBacklog ? "250px 1fr" : "1fr", gap: 10 }}>
        {/* ══ PANNEAU BACKLOG ══════════════════════════════════════════════ */}
        {showBacklog && (
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, maxHeight: 800, overflowY: "auto", position: "sticky", top: 10, alignSelf: "start" }}>
            <div style={{ fontSize: 10, color: C.orange, fontWeight: 700, marginBottom: 6, letterSpacing: "0.05em" }}>
              À POSITIONNER ({backlog.length})
            </div>

            {backlog.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 6 }}>
                <button onClick={() => setFilterEtape("")}
                  style={{ ...pillBtn, ...(filterEtape === "" ? pillActive : {}) }}>
                  Tout ({backlog.length})
                </button>
                {Array.from(backlogByEtape.entries()).map(([et, n]) => (
                  <button key={et} onClick={() => setFilterEtape(et === filterEtape ? "" : et)}
                    style={{ ...pillBtn, ...(filterEtape === et ? pillActive : {}) }}>
                    {et} ({n})
                  </button>
                ))}
              </div>
            )}

            {backlogFiltered.length === 0 ? (
              <div style={{ fontSize: 10, color: C.muted, fontStyle: "italic", padding: 8 }}>
                {backlog.length === 0
                  ? "Aucune tâche. Clique « + Tâche »."
                  : "Aucune tâche pour ce filtre."}
              </div>
            ) : (
              backlogFiltered.map(b => {
                const color = colorForName(b.chantier);
                return (
                  <div key={b.id}
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.setData("text/plain", `backlog:${b.id}`);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    style={{
                      padding: "4px 6px",
                      marginBottom: 3,
                      background: color + "15",
                      border: `1px solid ${color}66`,
                      borderLeft: `4px solid ${color}`,
                      borderRadius: 3,
                      cursor: "grab",
                      fontSize: 11,
                    }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: C.sec, background: C.s2, padding: "1px 5px", borderRadius: 2 }}>
                        {b.etape}
                      </span>
                      <button onClick={() => removeBacklogItem(b.id)}
                        style={{ background: "none", border: "none", color: C.red, fontSize: 11, cursor: "pointer", padding: "0 2px" }}
                        title="Supprimer">✕</button>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                      <span style={{ fontWeight: 700, color: C.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {b.chantier}
                      </span>
                      <input type="number" min={0}
                        defaultValue={b.qte ?? ""}
                        placeholder="Qté"
                        onBlur={e => {
                          const v = e.target.value.trim();
                          const n = v === "" ? null : parseInt(v);
                          if (n !== b.qte) updateBacklogQte(b.id, Number.isFinite(n as number) ? n : null);
                        }}
                        style={{
                          width: 46, padding: "1px 4px", fontSize: 10, textAlign: "right",
                          background: C.bg, border: `1px solid ${C.border}`, borderRadius: 2, color: C.text,
                        }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ══ EMPILEMENT DE SEMAINES ═════════════════════════════════════ */}
        <div>
          {semainesToShow.map(sem => (
            <WeekTable key={sem}
              semaine={sem}
              data={weeks[sem] || emptyData()}
              allEtapes={allEtapes}
              isDirty={dirtyWeeks.has(sem)}
              onDrop={onDrop}
              onUpdate={patch => updateItem(sem, patch.day, patch.idx, patch.patch)}
              onDelete={(day, idx) => deleteItem(sem, day, idx)}
              onAddRow={day => addRow(sem, day)}
              onAddEtape={() => addEtapeToLibrary(sem)}
              onCopyFromPrev={() => copyFromPrev(sem)}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}

// ── Table pour UNE semaine ─────────────────────────────────────────────────

function WeekTable({
  semaine, data, allEtapes, isDirty,
  onDrop, onUpdate, onDelete, onAddRow, onAddEtape, onCopyFromPrev,
}: {
  semaine: string;
  data: PlanningData;
  allEtapes: string[];
  isDirty: boolean;
  onDrop: (sem: string, day: Day, e: React.DragEvent) => void;
  onUpdate: (p: { day: Day; idx: number; patch: Partial<CellItem> }) => void;
  onDelete: (day: Day, idx: number) => void;
  onAddRow: (day: Day) => void;
  onAddEtape: () => void;
  onCopyFromPrev: () => void;
}) {
  // Nombre de lignes = max des items par jour, plus une ligne "+ Ajouter"
  const maxRows = Math.max(1, ...DAYS.map(d => (data.cells[d] || []).length));

  return (
    <div style={{ marginBottom: 20, border: `1px solid ${C.border}`, borderRadius: 4, overflow: "hidden" }}>
      {/* Bandeau semaine */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "5px 10px", background: isDirty ? C.orange + "22" : C.s2,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: C.cyan }}>Semaine {semaine}</span>
          <span style={{ fontSize: 10, color: C.muted }}>
            {DAYS.reduce((s, d) => s + (data.cells[d] || []).length, 0)} chantier(s) posé(s)
          </span>
          {isDirty && <span style={{ fontSize: 9, color: C.orange }}>• modifié</span>}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={onCopyFromPrev} style={miniActionBtn}>📋 Copier semaine −1</button>
          <button onClick={onAddEtape} style={miniActionBtn}>+ Étape</button>
        </div>
      </div>

      {/* Grille */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed", minWidth: 900 }}>
          <colgroup>
            {DAYS.map(() => (
              <>
                <col style={{ width: "9%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "6%" }} />
                <col style={{ width: "6%" }} />
              </>
            ))}
          </colgroup>
          <thead>
            <tr>
              {DAYS.map(d => (
                <th key={d} colSpan={4} style={{
                  padding: "3px 6px", background: C.s2, borderRight: `1px solid ${C.border}`,
                  borderBottom: `1px solid ${C.border}`, fontSize: 11, color: C.text, fontWeight: 700,
                }}>
                  {DAY_LABEL[d]}
                </th>
              ))}
            </tr>
            <tr>
              {DAYS.flatMap(d => [
                <th key={`${d}-et`} style={thSub}>Étape</th>,
                <th key={`${d}-nm`} style={thSub}>Nom</th>,
                <th key={`${d}-qt`} style={{ ...thSub, textAlign: "center" }}>Qté</th>,
                <th key={`${d}-rl`} style={{ ...thSub, textAlign: "center", borderRight: `1px solid ${C.border}` }}>Réalisé</th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxRows }).map((_, rowIdx) => (
              <tr key={rowIdx}>
                {DAYS.map(day => {
                  const items = data.cells[day] || [];
                  const it = items[rowIdx];
                  return (
                    <ItemRow key={day + rowIdx}
                      semaine={semaine}
                      day={day}
                      idx={rowIdx}
                      item={it}
                      etapesChoices={allEtapes}
                      onDrop={e => onDrop(semaine, day, e)}
                      onUpdate={patch => onUpdate({ day, idx: rowIdx, patch })}
                      onDelete={() => onDelete(day, rowIdx)}
                    />
                  );
                })}
              </tr>
            ))}
            {/* Ligne "+ Ajouter" par jour */}
            <tr>
              {DAYS.map(day => (
                <td key={"add-" + day} colSpan={4} style={{ padding: 2, borderRight: `1px solid ${C.border}`, borderTop: `1px dashed ${C.border}` }}>
                  <button onClick={() => onAddRow(day)}
                    style={{
                      width: "100%", padding: "3px 0", background: "none", border: `1px dashed ${C.border}`,
                      borderRadius: 2, color: C.muted, fontSize: 10, cursor: "pointer",
                    }}>
                    + ligne {DAY_LABEL[day]}
                  </button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Une ligne d'item dans la grille ────────────────────────────────────────

function ItemRow({
  semaine, day, idx, item, etapesChoices,
  onDrop, onUpdate, onDelete,
}: {
  semaine: string;
  day: Day;
  idx: number;
  item: CellItem | undefined;
  etapesChoices: string[];
  onDrop: (e: React.DragEvent) => void;
  onUpdate: (patch: Partial<CellItem>) => void;
  onDelete: () => void;
}) {
  const empty = !item;
  const color = item ? (item.color || colorForName(item.chantier)) : undefined;
  const qteReelRed = item && item.qte_theo !== "" && item.qte_reel !== "" &&
    String(item.qte_reel).trim() !== String(item.qte_theo).trim();

  const cellBase: React.CSSProperties = {
    padding: "1px 3px",
    borderRight: `1px solid ${C.border}`,
    borderBottom: `1px solid ${C.border}`,
    background: color ? color + "10" : "transparent",
    fontSize: 10,
    verticalAlign: "middle",
  };

  return (
    <>
      {/* Étape */}
      <td
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
        onDrop={onDrop}
        style={{ ...cellBase, borderLeft: color ? `3px solid ${color}` : undefined }}>
        {empty ? (
          <span style={{ color: C.muted, fontSize: 9, fontStyle: "italic" }}>—</span>
        ) : (
          <select value={item.etape}
            onChange={e => onUpdate({ etape: e.target.value })}
            style={cellInputSelect}>
            {etapesChoices.map(et => <option key={et} value={et}>{et}</option>)}
          </select>
        )}
      </td>
      {/* Nom (draggable) */}
      <td
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
        onDrop={onDrop}
        draggable={!empty}
        onDragStart={!empty ? e => {
          e.dataTransfer.setData("text/plain", `move:${semaine}:${day}:${idx}`);
          e.dataTransfer.effectAllowed = "move";
        } : undefined}
        style={{
          ...cellBase,
          cursor: empty ? "cell" : "grab",
        }}>
        {empty ? (
          <span style={{ color: C.muted, fontSize: 9 }}>déposer ici</span>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <input type="text" value={item.chantier}
              onChange={e => onUpdate({ chantier: e.target.value })}
              placeholder="Nom chantier"
              style={{ ...cellInput, flex: 1 }} />
            <button onClick={onDelete}
              style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 10, padding: 0 }}
              title="Retirer (retourne au backlog si venait de là)">✕</button>
          </div>
        )}
      </td>
      {/* Qté théo */}
      <td
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
        onDrop={onDrop}
        style={{ ...cellBase, textAlign: "center" }}>
        {empty ? <span style={{ color: C.muted }}>—</span> : (
          <input type="text" inputMode="numeric" value={String(item.qte_theo)}
            onChange={e => onUpdate({ qte_theo: e.target.value })}
            style={{ ...cellInput, textAlign: "center", width: "100%" }} />
        )}
      </td>
      {/* Qté réel */}
      <td
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
        onDrop={onDrop}
        style={{ ...cellBase, textAlign: "center", borderRight: `1px solid ${C.border}` }}>
        {empty ? <span style={{ color: C.muted }}>—</span> : (
          <input type="text" value={String(item.qte_reel)}
            onChange={e => onUpdate({ qte_reel: e.target.value })}
            style={{
              ...cellInput, textAlign: "center", width: "100%",
              color: qteReelRed ? C.red : (String(item.qte_reel).trim() ? C.green : C.text),
              fontWeight: qteReelRed ? 700 : 400,
            }}
            title={item.note || undefined} />
        )}
      </td>
    </>
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
const miniActionBtn: React.CSSProperties = {
  padding: "2px 8px", background: "none", border: `1px solid ${C.border}`,
  borderRadius: 3, color: C.sec, fontSize: 10, cursor: "pointer",
};
const thSub: React.CSSProperties = {
  padding: "2px 4px", background: C.bg, borderBottom: `1px solid ${C.border}`,
  borderRight: `1px solid ${C.border}22`, fontSize: 9, color: C.muted,
  fontWeight: 600, textAlign: "left",
};
const cellInput: React.CSSProperties = {
  background: "transparent", border: "none", outline: "none",
  color: C.text, fontSize: 10, padding: "1px 2px", width: "100%",
};
const cellInputSelect: React.CSSProperties = {
  ...cellInput, cursor: "pointer",
};
const pillBtn: React.CSSProperties = {
  fontSize: 9, padding: "2px 6px", borderRadius: 10,
  background: C.s2, border: `1px solid ${C.border}`, color: C.sec,
  cursor: "pointer", whiteSpace: "nowrap",
};
const pillActive: React.CSSProperties = {
  background: C.cyan + "22", border: `1px solid ${C.cyan}`, color: C.cyan, fontWeight: 700,
};
