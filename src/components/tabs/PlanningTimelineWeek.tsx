// ═══════════════════════════════════════════════════════════════════════
// Vue timeline horaire de la semaine — alternative à la grille
// demi-journée de PlanningAffectations.
//
// Affiche pour chaque poste actif × chaque jour ouvré une bande horaire
// 8h-17h avec les tâches placées en blocs proportionnels à leur durée.
//
// ÉDITION : drag horizontal sur le centre d'un bloc pour décaler l'heure
// de début ; drag sur le bord droit pour redimensionner la durée.
// Les overrides sont stockés par chantier dans `PlanningPoste` clé
// `timeline_${semaine}` (format JSON-clé-valeur).
// ═══════════════════════════════════════════════════════════════════════

"use client";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { C, JOURS_FERIES, hm, specialMultiplier, CommandeCC } from "@/lib/sial-data";
import { getRoutage, isulaInfoFromCmd } from "@/lib/routage-production";
import { postShortLabel, postColor } from "@/lib/work-posts";

interface CellData { ops: string[]; cmds: string[]; extras?: string[] }

/**
 * Override horaire par chantier × poste × jour.
 * Clé : `${pid}|${jourIdx}|${chantier}` — valeur : { startHour, durMin }
 * Stockage : PlanningPoste avec semaine = `timeline_${monday}`
 */
type TimelineOverrides = Record<string, { startHour: number; durMin: number }>;

export interface TimelineWeekProps {
  /** Affectations brutes (clé `pid|jourIdx|demi`). */
  aff: Record<string, CellData>;
  /** Lundi de la semaine "YYYY-MM-DD". */
  monday: string;
  /** Liste des postes à afficher (filtrée par les phases actives). */
  postIds: string[];
  /** Commandes (pour calculer les durées via getRoutage). */
  commandes: CommandeCC[];
  /** Index d'aujourd'hui dans la semaine (0..4) ou -1 si autre semaine. */
  todayIdx: number;
}

const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];

function localStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtHourCompact(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return mm === 0 ? `${hh}h` : `${hh}h${String(mm).padStart(2, "0")}`;
}

const HOUR_START = 8;
const HOUR_END = 17;
const HOUR_RANGE = HOUR_END - HOUR_START;
const PIXELS_PER_HOUR = 60;
const TIMELINE_WIDTH = HOUR_RANGE * PIXELS_PER_HOUR;

export default function PlanningTimelineWeek({
  aff, monday, postIds, commandes, todayIdx,
}: TimelineWeekProps) {
  // ── Overrides horaires (drag/resize) — chargés et sauvegardés ──
  const [overrides, setOverrides] = useState<TimelineOverrides>({});
  const overrideKey = `timeline_${monday}`;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`/api/planning/affectations?semaine=${encodeURIComponent(overrideKey)}`)
      .then(r => r.ok ? r.json() : {})
      .then((data: unknown) => {
        if (data && typeof data === "object" && !Array.isArray(data)) {
          setOverrides(data as TimelineOverrides);
        } else {
          setOverrides({});
        }
      })
      .catch(() => setOverrides({}));
  }, [overrideKey]);

  const persist = useCallback((next: TimelineOverrides) => {
    setOverrides(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/planning/affectations", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semaine: overrideKey, affectations: next }),
      }).catch(() => {});
    }, 600);
  }, [overrideKey]);

  // ── Drag state ──
  const [dragging, setDragging] = useState<{
    key: string; mode: "move" | "resize"; startX: number;
    initialStart: number; initialDur: number;
  } | null>(null);

  const onMouseDown = (e: React.MouseEvent, key: string, mode: "move" | "resize",
                      currentStart: number, currentDur: number) => {
    e.preventDefault(); e.stopPropagation();
    setDragging({ key, mode, startX: e.clientX, initialStart: currentStart, initialDur: currentDur });
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragging.startX;
      const deltaH = dx / PIXELS_PER_HOUR;
      // Snap à 5 minutes (1/12 d'heure)
      const snap = (h: number) => Math.round(h * 12) / 12;
      let newStart = dragging.initialStart;
      let newDur = dragging.initialDur;
      if (dragging.mode === "move") {
        newStart = snap(dragging.initialStart + deltaH);
        // Bornes : ne pas sortir de 8h-17h
        newStart = Math.max(HOUR_START, Math.min(newStart, HOUR_END - newDur / 60));
      } else {
        newDur = Math.max(15, snap(dragging.initialDur / 60 + deltaH) * 60);
        // Borner par fin de timeline
        const maxDur = (HOUR_END - dragging.initialStart) * 60;
        newDur = Math.min(newDur, maxDur);
      }
      setOverrides(prev => ({ ...prev, [dragging.key]: { startHour: newStart, durMin: newDur } }));
    };
    const onUp = () => {
      setDragging(null);
      // Persister la valeur courante
      persist({ ...overrides });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, overrides, persist]);

  const resetOverride = useCallback((key: string) => {
    const next = { ...overrides };
    delete next[key];
    persist(next);
  }, [overrides, persist]);

  // Index estimation chantier × poste (durée théorique).
  const timeByChantierPost = useMemo(() => {
    const map = new Map<string, number>();
    for (const cmd of commandes) {
      const a = cmd as any;
      const ch = a.ref_chantier || a.client || "";
      if (!ch) continue;
      const lignes = Array.isArray(a.lignes) && a.lignes.length > 0
        ? a.lignes
        : [{ type: cmd.type, quantite: cmd.quantite }];
      const isulaInfo = isulaInfoFromCmd(a);
      for (let li = 0; li < lignes.length; li++) {
        const ligne = lignes[li];
        const lType = ligne.type || cmd.type;
        if (lType === "intervention_chantier") continue;
        const lQte = parseInt(ligne.quantite) || cmd.quantite || 1;
        const lHs = lType === "hors_standard"
          ? { t_coupe: ligne.hs_t_coupe, t_montage: ligne.hs_t_montage, t_vitrage: ligne.hs_t_vitrage }
          : a.hsTemps;
        const lSf = specialMultiplier(parseFloat(ligne?.largeur_mm) || parseFloat(ligne?.largeur) || 0);
        const routage = getRoutage(lType, lQte, lHs as Record<string, unknown> | null, lSf, undefined,
          li === 0 ? isulaInfo : undefined);
        for (const e of routage) {
          const k = `${ch}|${e.postId}`;
          map.set(k, (map.get(k) || 0) + e.estimatedMin);
        }
      }
    }
    return map;
  }, [commandes]);

  // Pour chaque poste × jour, calculer les blocs horaires à partir des
  // affectations am/pm + durées estimées.
  interface Block { key: string; chantier: string; startHour: number; endHour: number; ops: string[]; isExtra: boolean; isOverride: boolean }
  const blocksByPostDay = useMemo(() => {
    const map = new Map<string, Block[]>();
    for (let j = 0; j < 5; j++) {
      for (const pid of postIds) {
        const blocks: Block[] = [];
        for (const demi of ["am", "pm"] as const) {
          const cell = aff[`${pid}|${j}|${demi}`];
          if (!cell) continue;
          const startBase = demi === "am" ? 8 : 13;
          const endBase = demi === "am" ? 12 : 17;
          const nbOps = Math.max(1, cell.ops?.length || 1);
          let cursor = startBase;
          for (const ch of (cell.cmds || [])) {
            const ovKey = `${pid}|${j}|${ch}`;
            const ov = overrides[ovKey];
            const est = timeByChantierPost.get(`${ch}|${pid}`) || 0;
            const rawDur = ov ? ov.durMin : Math.max(30, est / nbOps);
            const start = ov ? ov.startHour : cursor;
            const remaining = ov ? rawDur : Math.min(rawDur, (endBase - cursor) * 60);
            const end = start + remaining / 60;
            blocks.push({ key: ovKey, chantier: ch, startHour: start, endHour: end, ops: cell.ops || [], isExtra: false, isOverride: !!ov });
            if (!ov) {
              cursor = end;
              if (cursor >= endBase) break;
            }
          }
          for (const ext of (cell.extras || [])) {
            const ovKey = `${pid}|${j}|${ext}`;
            const ov = overrides[ovKey];
            const m = ext.match(/\((\d+)h(\d+)?\)/);
            const est = m ? parseInt(m[1]) * 60 + (parseInt(m[2]) || 0) : 60;
            const rawDur = ov ? ov.durMin : est / nbOps;
            const start = ov ? ov.startHour : cursor;
            const remainingMin = ov ? rawDur : Math.min(rawDur, (endBase - cursor) * 60);
            if (remainingMin <= 0) break;
            const end = start + remainingMin / 60;
            blocks.push({ key: ovKey, chantier: ext, startHour: start, endHour: end, ops: cell.ops || [], isExtra: true, isOverride: !!ov });
            if (!ov) {
              cursor = end;
              if (cursor >= endBase) break;
            }
          }
        }
        if (blocks.length > 0) map.set(`${pid}|${j}`, blocks);
      }
    }
    return map;
  }, [aff, postIds, timeByChantierPost, overrides]);

  // Postes actifs filtrés à ceux qui ont au moins un bloc cette semaine.
  const activePostIds = useMemo(() => {
    const set = new Set<string>();
    for (const k of Array.from(blocksByPostDay.keys())) {
      set.add(k.split("|")[0]);
    }
    return postIds.filter(p => set.has(p));
  }, [blocksByPostDay, postIds]);

  if (activePostIds.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 30, color: C.sec, fontSize: 12 }}>
        Aucune tâche placée cette semaine. Ouvre la vue demi-journée pour planifier.
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto", paddingBottom: 8 }}>
      <table style={{ borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ position: "sticky", left: 0, zIndex: 2, background: C.s2, border: `1px solid ${C.border}`, padding: "6px 10px", minWidth: 120, textAlign: "left", fontSize: 10, color: C.sec }}>
              POSTE
            </th>
            {Array.from({ length: 5 }, (_, j) => {
              const d = new Date(monday + "T00:00:00");
              d.setDate(d.getDate() + j);
              const ds = localStr(d);
              const ferie = JOURS_FERIES[ds];
              const isToday = j === todayIdx;
              return (
                <th key={j} colSpan={1} style={{
                  border: `1px solid ${C.border}`,
                  background: isToday ? C.orange + "22" : ferie ? C.s2 + "88" : C.s2,
                  padding: "6px 8px", fontSize: 10, color: isToday ? C.orange : ferie ? C.purple : C.sec,
                  fontWeight: 700, minWidth: TIMELINE_WIDTH, position: "relative",
                }}>
                  <div>{JOURS[j]} <span style={{ fontWeight: 400, opacity: 0.7 }}>{d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</span></div>
                  {ferie && <div style={{ fontSize: 8, color: C.purple, fontWeight: 400 }}>{ferie}</div>}
                  {/* Échelle horaire */}
                  <div style={{ display: "flex", marginTop: 4, fontSize: 8, color: C.muted, fontWeight: 400 }}>
                    {Array.from({ length: HOUR_RANGE + 1 }, (_, h) => (
                      <div key={h} style={{ width: PIXELS_PER_HOUR, textAlign: "left", marginLeft: h === 0 ? 0 : -10 }}>
                        {h % 2 === 0 ? `${HOUR_START + h}h` : ""}
                      </div>
                    ))}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {activePostIds.map(pid => {
            const color = postColor(pid);
            return (
              <tr key={pid}>
                <td style={{
                  position: "sticky", left: 0, zIndex: 1, background: C.s1, border: `1px solid ${C.border}`,
                  padding: "8px 10px", verticalAlign: "middle", borderLeft: `3px solid ${color}`,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: color }}>{pid}</div>
                  <div style={{ fontSize: 9, color: C.sec }}>{postShortLabel(pid)}</div>
                </td>
                {Array.from({ length: 5 }, (_, j) => {
                  const d = new Date(monday + "T00:00:00");
                  d.setDate(d.getDate() + j);
                  const ds = localStr(d);
                  const ferie = !!JOURS_FERIES[ds];
                  const blocks = blocksByPostDay.get(`${pid}|${j}`) || [];
                  return (
                    <td key={j} style={{
                      border: `1px solid ${C.border}`,
                      background: ferie ? C.s2 + "44" : C.bg,
                      padding: 0, position: "relative", height: 50, verticalAlign: "middle",
                    }}>
                      <div style={{ position: "relative", width: TIMELINE_WIDTH, height: 50 }}>
                        {/* Lignes verticales heures (chaque heure) */}
                        {Array.from({ length: HOUR_RANGE + 1 }, (_, h) => (
                          <div key={h} style={{
                            position: "absolute", top: 0, bottom: 0,
                            left: h * PIXELS_PER_HOUR,
                            width: 1,
                            background: h % 2 === 0 ? C.border : C.border + "55",
                          }} />
                        ))}
                        {/* Pause déjeuner 12h-13h (zone grisée) */}
                        <div style={{
                          position: "absolute", top: 4, bottom: 4,
                          left: (12 - HOUR_START) * PIXELS_PER_HOUR,
                          width: PIXELS_PER_HOUR, background: C.s2 + "66", borderRadius: 2,
                        }} />
                        {/* Blocs (draggables) */}
                        {blocks.map((b, idx) => {
                          const left = (b.startHour - HOUR_START) * PIXELS_PER_HOUR;
                          const width = (b.endHour - b.startHour) * PIXELS_PER_HOUR;
                          const dur = Math.round((b.endHour - b.startHour) * 60);
                          const isBeingDragged = dragging?.key === b.key;
                          return (
                            <div key={idx}
                              title={`${b.chantier}\n${fmtHourCompact(b.startHour)} → ${fmtHourCompact(b.endHour)} (${hm(dur)})\n${b.ops.length} op${b.ops.length > 1 ? "s" : ""} : ${b.ops.join(", ") || "—"}\n\nGlisser pour décaler · bord droit pour redimensionner${b.isOverride ? " · double-clic pour réinitialiser" : ""}`}
                              onMouseDown={(e) => onMouseDown(e, b.key, "move", b.startHour, dur)}
                              onDoubleClick={(e) => { e.stopPropagation(); if (b.isOverride) resetOverride(b.key); }}
                              style={{
                                position: "absolute", top: 6, bottom: 6,
                                left, width: Math.max(20, width),
                                background: b.isExtra ? color + "22" : color + "44",
                                border: `${b.isOverride ? "2px" : "1px"} solid ${color}`,
                                borderRadius: 3, padding: "2px 4px",
                                overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                                fontSize: 9, color: C.text, fontWeight: 600,
                                display: "flex", flexDirection: "column", justifyContent: "center",
                                cursor: "grab",
                                userSelect: "none",
                                opacity: isBeingDragged ? 0.7 : 1,
                                boxShadow: isBeingDragged ? "0 2px 8px rgba(0,0,0,0.3)" : "none",
                              }}>
                              <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                                {b.isOverride ? "✎ " : ""}{b.chantier}
                              </div>
                              <div style={{ fontSize: 8, color: C.sec, fontWeight: 400 }}>{fmtHourCompact(b.startHour)}–{fmtHourCompact(b.endHour)}</div>
                              {/* Poignée de redimensionnement à droite */}
                              <div
                                onMouseDown={(e) => onMouseDown(e, b.key, "resize", b.startHour, dur)}
                                style={{
                                  position: "absolute", right: 0, top: 0, bottom: 0, width: 6,
                                  cursor: "ew-resize", background: color + "88",
                                }}
                                title="Glisser pour redimensionner"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ marginTop: 8, fontSize: 10, color: C.muted }}>
        💡 <b>Glisser un bloc</b> pour décaler son heure de début ·{" "}
        <b>poignée droite</b> pour redimensionner ·{" "}
        <b>double-clic</b> sur un bloc modifié (✎) pour rétablir l&apos;heure auto.
        Snap aux 5 min. Les overrides sont sauvegardés automatiquement.
      </div>
    </div>
  );
}
