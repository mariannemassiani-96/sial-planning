"use client";
import { useState, useMemo } from "react";
import { C, JOURS_FERIES, calcCheminCritique, CommandeCC, TYPES_MENUISERIE } from "@/lib/sial-data";
import { H } from "@/components/ui";

// ── Date helpers ────────────────────────────────────────────────────────────
function localStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function addDays(s: string, n: number): string {
  const d = new Date(s+"T00:00:00");
  d.setDate(d.getDate()+n);
  return localStr(d);
}
function getMondayOf(s: string): string {
  const d = new Date(s+"T00:00:00");
  const day = d.getDay();
  d.setDate(d.getDate()-(day===0?6:day-1));
  return localStr(d);
}
function getWeekNum(s: string): number {
  const d = new Date(s+"T00:00:00");
  const jan4 = new Date(d.getFullYear(),0,4);
  const w1 = new Date(jan4);
  w1.setDate(jan4.getDate()-((jan4.getDay()||7)-1));
  return Math.ceil((d.getTime()-w1.getTime())/(7*86400000))+1;
}

// ── Postes config ────────────────────────────────────────────────────────────
const POSTES = [
  { id: "coupe",      label: "Coupe",              c: "#42A5F5" },
  { id: "frappes",    label: "Montage Frappes",    c: "#FFA726" },
  { id: "coulissant", label: "Coulissant / Gland.", c: "#66BB6A" },
  { id: "vitrage",    label: "Vitrage",            c: "#26C6DA" },
  { id: "palette",    label: "Palette / Contrôle", c: "#4DB6AC" },
];

const JOURS_LABEL = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi"];

// ── Etape → Poste mapping ────────────────────────────────────────────────────
function etapeToPoste(etapeId: string, cmdType: string): string | null {
  if (etapeId === "coupe") return "coupe";
  if (etapeId === "vitrage") return "vitrage";
  if (etapeId === "palette") return "palette";
  if (etapeId === "montage") {
    const famille = TYPES_MENUISERIE[cmdType]?.famille;
    if (famille === "coulissant" || famille === "glandage") return "coulissant";
    return "frappes";
  }
  return null;
}

export default function PlanningCalendrier({ commandes }: { commandes: CommandeCC[] }) {
  const today = localStr(new Date());
  const [anchor, setAnchor] = useState(today);

  // ── Filter to SIAL commandes only ──────────────────────────────────────────
  const sialCommandes = useMemo(() =>
    commandes.filter(c => (c as any).atelier === "SIAL" || !(c as any).atelier),
    [commandes]
  );

  // ── Compute critical paths ─────────────────────────────────────────────────
  const chemins = useMemo(() =>
    sialCommandes.map(c => ({ cmd: c, cc: calcCheminCritique(c) })).filter(x => x.cc),
    [sialCommandes]
  );

  // ── Week navigation ────────────────────────────────────────────────────────
  const monday = getMondayOf(anchor);
  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(monday, i));
  const weekNum = getWeekNum(monday);

  const navigate = (delta: number) => {
    setAnchor(addDays(anchor, delta * 7));
  };
  const goThisWeek = () => setAnchor(today);

  // ── Build cell data: posteId × day → list of commandes ────────────────────
  const cellData = useMemo(() => {
    // cellData[posteId][dayStr] = array of commande summaries
    const data: Record<string, Record<string, Array<{ num_commande: string; client: string; ref_chantier: string; priorite: string }>>> = {};
    for (const p of POSTES) {
      data[p.id] = {};
      for (const day of weekDays) {
        data[p.id][day] = [];
      }
    }

    for (const { cmd, cc } of chemins) {
      if (!cc) continue;
      for (const etape of cc.etapes) {
        if (!etape.debut || !etape.fin) continue;
        if ((etape.duree_min ?? 0) <= 0) continue;
        const posteId = etapeToPoste(etape.id, cmd.type);
        if (!posteId) continue;
        for (const day of weekDays) {
          if (day >= etape.debut && day <= etape.fin) {
            data[posteId][day].push({
              num_commande: (cmd as any).num_commande ?? String(cmd.id),
              client: cmd.client ?? "",
              ref_chantier: (cmd as any).ref_chantier ?? "",
              priorite: (cmd as any).priorite ?? "normal",
            });
          }
        }
      }
    }

    return data;
  }, [chemins, weekDays]);

  // ── Priority color ─────────────────────────────────────────────────────────
  function priorityStyle(priorite: string): React.CSSProperties {
    if (priorite === "urgente") {
      return { border: `1px solid ${C.orange}`, background: C.orange+"22" };
    }
    if (priorite === "critique") {
      return { border: `1px solid ${C.red}`, background: C.red+"22" };
    }
    return { border: `1px solid ${C.border}`, background: C.s2 };
  }

  // ── Format day label ───────────────────────────────────────────────────────
  function formatDayLabel(dayStr: string, index: number): string {
    const d = new Date(dayStr+"T00:00:00");
    const dd = String(d.getDate()).padStart(2,"0");
    const mm = String(d.getMonth()+1).padStart(2,"0");
    return `${JOURS_LABEL[index]} ${dd}/${mm}`;
  }

  return (
    <div>
      <H c={C.blue}>Planning Calendrier Ateliers — Semaine {weekNum}</H>

      {/* Navigation */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button
          onClick={() => navigate(-1)}
          style={{ padding: "5px 14px", background: C.s1, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, cursor: "pointer", fontSize: 15 }}
        >←</button>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text, minWidth: 220, textAlign: "center" }}>
          {`Semaine ${weekNum} — du `}
          {(() => { const d = new Date(weekDays[0]+"T00:00:00"); return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`; })()}
          {" au "}
          {(() => { const d = new Date(weekDays[4]+"T00:00:00"); return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`; })()}
        </span>
        <button
          onClick={() => navigate(1)}
          style={{ padding: "5px 14px", background: C.s1, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, cursor: "pointer", fontSize: 15 }}
        >→</button>
        <button
          onClick={goThisWeek}
          style={{ padding: "5px 12px", background: C.orange+"22", border: `1px solid ${C.orange}44`, borderRadius: 4, color: C.orange, cursor: "pointer", fontSize: 11, fontWeight: 700 }}
        >Cette semaine</button>
      </div>

      {sialCommandes.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: C.sec }}>Aucune commande SIAL — ajoutez des commandes d&apos;abord.</div>
      )}

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 110 }} />
            {POSTES.map(p => <col key={p.id} />)}
          </colgroup>

          {/* Header row */}
          <thead>
            <tr>
              <th style={{ padding: "8px 6px", background: C.s2, border: `1px solid ${C.border}`, fontSize: 11, color: C.sec, fontWeight: 700, textAlign: "center" }}>Jour</th>
              {POSTES.map(p => (
                <th key={p.id} style={{ padding: "8px 6px", background: p.c+"33", border: `1px solid ${C.border}`, fontSize: 11, fontWeight: 700, textAlign: "center", color: p.c }}>
                  {p.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {weekDays.map((day, dayIdx) => {
              const isFerie = !!JOURS_FERIES[day];
              const isToday = day === today;

              return (
                <tr key={day}>
                  {/* Day label cell */}
                  <td style={{
                    padding: "6px 8px",
                    background: isFerie ? C.s2 : isToday ? C.orange+"22" : C.s1,
                    border: `1px solid ${C.border}`,
                    fontWeight: 700,
                    fontSize: 11,
                    color: isToday ? C.orange : isFerie ? C.sec : C.text,
                    verticalAlign: "top",
                    minHeight: 60,
                    whiteSpace: "nowrap",
                  }}>
                    {formatDayLabel(day, dayIdx)}
                    {isFerie && (
                      <div style={{ fontSize: 9, color: C.sec, fontWeight: 400, marginTop: 2 }}>
                        {JOURS_FERIES[day]}
                      </div>
                    )}
                  </td>

                  {/* Poste cells */}
                  {POSTES.map(p => {
                    const items = cellData[p.id]?.[day] ?? [];

                    if (isFerie) {
                      return (
                        <td key={p.id} style={{
                          padding: "6px 4px",
                          background: C.s2,
                          border: `1px solid ${C.border}`,
                          minHeight: 60,
                          textAlign: "center",
                          color: C.muted,
                          fontSize: 10,
                          fontStyle: "italic",
                          verticalAlign: "middle",
                        }}>
                          Férié
                        </td>
                      );
                    }

                    return (
                      <td key={p.id} style={{
                        padding: 4,
                        background: items.length > 0 ? p.c+"11" : C.s1,
                        border: `1px solid ${C.border}`,
                        minHeight: 60,
                        verticalAlign: "top",
                      }}>
                        {items.map((item, idx) => (
                          <div key={idx} style={{
                            fontSize: 10,
                            padding: "2px 4px",
                            borderRadius: 3,
                            marginBottom: 2,
                            lineHeight: 1.4,
                            ...priorityStyle(item.priorite),
                          }}>
                            <span style={{ fontWeight: 700, color: C.text }}>{item.client}</span>
                            {item.ref_chantier && (
                              <span style={{ color: C.sec }}>{" — "}{item.ref_chantier}</span>
                            )}
                            {item.num_commande && (
                              <div style={{ fontSize: 9, color: C.muted, fontFamily: "monospace" }}>{item.num_commande}</div>
                            )}
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div style={{ marginTop: 14, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: C.sec, fontWeight: 700 }}>Postes :</span>
        {POSTES.map(p => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: C.sec }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: p.c+"55", border: `1px solid ${p.c}` }} />
            {p.label}
          </div>
        ))}
        <span style={{ fontSize: 10, color: C.sec, fontWeight: 700, marginLeft: 12 }}>Priorité :</span>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: C.sec }}>
          <div style={{ width: 12, height: 12, borderRadius: 2, background: C.orange+"22", border: `1px solid ${C.orange}` }} />
          Urgente
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: C.sec }}>
          <div style={{ width: 12, height: 12, borderRadius: 2, background: C.red+"22", border: `1px solid ${C.red}` }} />
          Critique
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: C.sec }}>
          <div style={{ width: 12, height: 12, borderRadius: 2, background: C.s2, border: `1px solid ${C.border}` }} />
          Normal
        </div>
      </div>
    </div>
  );
}
