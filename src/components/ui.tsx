"use client";
import { C } from "@/lib/sial-data";

export function Card({ children, style = {}, accent, onClick }: {
  children: React.ReactNode; style?: React.CSSProperties;
  accent?: string; onClick?: () => void;
}) {
  return (
    <div onClick={onClick} style={{
      background: C.s1, border: `1px solid ${C.border}`,
      borderLeft: accent ? `3px solid ${accent}` : `1px solid ${C.border}`,
      borderRadius: 7, padding: 16, ...style, cursor: onClick ? "pointer" : "default"
    }}>
      {children}
    </div>
  );
}

export function H({ children, c = C.blue }: { children: React.ReactNode; c?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <div style={{ width: 2, height: 14, background: c, borderRadius: 1 }} />
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: c }}>{children}</span>
    </div>
  );
}

export function Bdg({ t, c = C.sec, sz = 10 }: { t: string; c?: string; sz?: number }) {
  return (
    <span style={{
      background: c + "22", color: c, border: `1px solid ${c}33`,
      borderRadius: 3, padding: "1px 7px", fontSize: sz, fontWeight: 600, whiteSpace: "nowrap"
    }}>{t}</span>
  );
}

export function Bar({ v, max, c = C.blue, h = 5 }: { v: number; max: number; c?: string; h?: number }) {
  const p = Math.min(100, max ? Math.round(v / max * 100) : 0);
  const col = p > 95 ? C.red : p > 80 ? C.orange : c;
  return (
    <div style={{ height: h, background: C.border, borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${p}%`, height: "100%", background: col, borderRadius: 3, transition: "width .3s" }} />
    </div>
  );
}
