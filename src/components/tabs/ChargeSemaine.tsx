"use client";
import { useMemo } from "react";
import { calcChargeSemaine, calcLogistique, T, C, hm, CommandeCalc } from "@/lib/sial-data";
import { H, Bdg, Bar, Card } from "@/components/ui";

const POSTE_INFO = {
  coupe:      { l: "Coupe / Soudure",       who: "Julien · Laurent · Mateo", c: C.blue },
  coulissant: { l: "Coulissant / Glandage", who: "Alain (30h/sem)",          c: C.green },
  frappes:    { l: "Montage Frappes",       who: "Michel · Jean-François",   c: C.orange },
  vitrage_ov: { l: "Vitrage Ouvrants",      who: "Quentin",                  c: C.cyan },
} as const;

const minSemaine = { coupe: 8*60*3*5*0.8, coulissant: 8*60*4, frappes: 8*60*2*5, vitrage_ov: 8*60*5 };

export default function ChargeSemaine({ commandes }: { commandes: CommandeCalc[] }) {
  const charge = useMemo(() => calcChargeSemaine(commandes), [commandes]);
  const logi = useMemo(() => calcLogistique(commandes), [commandes]);

  return (
    <div>
      <H c={C.orange}>Charge semaine & logistique</H>
      <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
        {(Object.keys(POSTE_INFO) as Array<keyof typeof POSTE_INFO>).map(p => {
          const info = POSTE_INFO[p];
          const v = charge[p] || 0;
          const max = minSemaine[p];
          const pct = Math.min(100, Math.round(v / max * 100));
          return (
            <Card key={p} accent={info.c}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: info.c }}>{info.l}</span>
                  <span style={{ fontSize: 11, color: C.sec, marginLeft: 8 }}>{info.who}</span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="mono" style={{ fontSize: 16, fontWeight: 700, color: pct > 95 ? C.red : C.text }}>{hm(v)}</span>
                  <span style={{ color: C.sec, fontSize: 11 }}>/ {hm(max)}</span>
                  <Bdg t={`${pct}%`} c={pct > 95 ? C.red : pct > 80 ? C.orange : C.green} />
                </div>
              </div>
              <Bar v={v} max={max} c={info.c} h={8} />
              {p === "coupe" && <div style={{ marginTop: 6, fontSize: 10, color: C.yellow }}>
                Inclut {hm(T.prep_deballage_joints_sem)} prépa/joints + {hm(T.coupe_double_tete_sem)} double tête/renfort acier
              </div>}
            </Card>
          );
        })}
      </div>

      <Card>
        <H c={C.cyan}>Logistique — Besoins calculés</H>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          {[
            { l: "Chariots profilés", v: logi.chariots_profils, detail: `${logi.total_pieces_coupe} profils · 80/chariot`, c: C.blue },
            { l: "Chariots vitrages", v: logi.chariots_vitrages, detail: `${logi.ouvrantsCoul} ouvrants · 15/chariot`, c: C.cyan },
            { l: "Palettes livraison", v: logi.palettes, detail: `${logi.pieces} pièces · 6 ouvrants/palette`, c: C.orange },
          ].map((x, i) => (
            <div key={i} style={{ textAlign: "center", padding: 14, background: C.bg, borderRadius: 6 }}>
              <div className="mono" style={{ fontSize: 32, fontWeight: 800, color: x.c }}>{x.v}</div>
              <div style={{ fontSize: 12, color: C.text, marginBottom: 4 }}>{x.l}</div>
              <div style={{ fontSize: 10, color: C.muted }}>{x.detail}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
