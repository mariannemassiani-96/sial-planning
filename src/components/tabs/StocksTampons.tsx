"use client";
import { STOCKS_DEF, C } from "@/lib/sial-data";
import { H, Bdg, Bar, Card } from "@/components/ui";

const inp = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "7px 11px", color: C.text, fontSize: 13, outline: "none" };

export default function StocksTampons({
  stocksTampons,
  onUpdate,
}: {
  stocksTampons: Record<string, { actuel: number }>;
  onUpdate: (id: string, v: { actuel: string }) => void;
}) {
  return (
    <div>
      <H c={C.teal}>Stocks tampons inter-postes</H>
      {Object.entries(STOCKS_DEF).map(([id, st]) => {
        const actuel = parseFloat(String(stocksTampons[id]?.actuel)) || 0;
        const statut = actuel < st.min ? "rupture" : actuel > st.max * 0.9 ? "plein" : "ok";
        const sc = ({ rupture: C.red, plein: C.orange, ok: C.green } as Record<string, string>)[statut];
        return (
          <Card key={id} accent={st.c} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{st.label}</span>
                  <Bdg t={({ rupture: "INSUFFISANT", plein: "SURSTOCKAGE", ok: "OK" } as Record<string, string>)[statut]} c={sc} />
                </div>
                <div style={{ fontSize: 11, color: C.sec, marginBottom: 6 }}>📍 {st.localisation}</div>
                <Bar v={actuel} max={st.max} c={st.c} h={8} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginTop: 3 }}>
                  <span style={{ color: C.red }}>Min:{st.min}</span>
                  <span style={{ color: st.c }} className="mono">{actuel} {st.unite}</span>
                  <span style={{ color: C.orange }}>Max:{st.max}</span>
                </div>
                <div style={{ marginTop: 5, fontSize: 10, color: C.muted, fontStyle: "italic" }}>💡 {st.raison}</div>
              </div>
              <div style={{ textAlign: "center", minWidth: 90 }}>
                <div style={{ fontSize: 9, color: C.sec, marginBottom: 3 }}>ACTUEL</div>
                <input
                  type="number" min={0} step={0.5}
                  style={{ ...inp, width: 80, textAlign: "center", fontSize: 16, fontWeight: 700, color: sc }}
                  value={stocksTampons[id]?.actuel || ""}
                  onChange={e => onUpdate(id, { actuel: e.target.value })}
                />
                <div style={{ fontSize: 9, color: C.sec, marginTop: 2 }}>{st.unite}</div>
                <div style={{ marginTop: 6, fontSize: 10, color: C.teal, fontWeight: 600 }}>Cible:{st.cible}</div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
