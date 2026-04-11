/* eslint-disable react/no-unescaped-entities */
"use client";
import { useState, useEffect, useCallback } from "react";
import { C } from "@/lib/sial-data";

// ── Types ────────────────────────────────────────────────────────────────────

interface Skill {
  id: string;
  operatorId: string;
  workPostId: string | null;
  menuiserieType: string | null;
  level: number;
  updatedAt: string;
  updatedBy: string | null;
  workPost: { id: string; label: string; atelier: string } | null;
}

interface Operator {
  id: string;
  name: string;
  weekHours: number;
  posts: string[];
  workingDays: number[];
  notes: string | null;
  active: boolean;
  skills: Skill[];
}

// ── Constantes postes ─────────────────────────────────────────────────────────

const POST_GROUPS = [
  { label: "Coupe & Prépa", ids: ["C1","C2","C3","C4","C5","C6"] },
  { label: "Montage", ids: ["M1","M2","M3","F1","F2","F3","MHS"] },
  { label: "Vitrage", ids: ["V1","V2","V3"] },
  { label: "Logistique", ids: ["L1","L2","L3","L4","L5","L6","L7"] },
  { label: "ISULA", ids: ["IL","IB","I3","I4"] },
  { label: "Autre", ids: ["AUT"] },
];
const ALL_POST_IDS = POST_GROUPS.flatMap((g) => g.ids);

// ── Familles de produits ──────────────────────────────────────────────────────


const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function levelBadge(level: number): React.ReactNode {
  if (level === 0) return <span style={{ color: C.muted, fontSize: 13 }}>—</span>;
  const cfg = [
    { n: 1, bg: C.muted,   label: "①" },
    { n: 2, bg: C.orange,  label: "②" },
    { n: 3, bg: C.green,   label: "③" },
  ][level - 1];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: "50%", background: cfg.bg, color: "#fff", fontSize: 12, fontWeight: 800 }}>
      {cfg.label}
    </span>
  );
}

function levelLabel(level: number): string {
  return ["Aucun", "① Supervision", "② Autonome", "③ Expert"][level] ?? "—";
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const toast = useCallback((m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 2500);
  }, []);
  return { msg, toast };
}

// ── Popup édition niveau ──────────────────────────────────────────────────────

interface LevelPopupProps {
  operatorName: string;
  targetLabel: string;
  currentLevel: number;
  onSelect: (level: number) => void;
  onClose: () => void;
}
function LevelPopup({ operatorName, targetLabel, currentLevel, onSelect, onClose }: LevelPopupProps) {
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 8, padding: "20px 24px", minWidth: 280, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{operatorName}</div>
        <div style={{ fontSize: 12, color: C.sec, marginBottom: 16 }}>{targetLabel}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[0, 1, 2, 3].map((lvl) => (
            <button
              key={lvl}
              onClick={() => onSelect(lvl)}
              style={{
                padding: "10px 16px", borderRadius: 6, cursor: "pointer", textAlign: "left", fontSize: 14, fontWeight: 600,
                background: currentLevel === lvl ? C.orange : C.s2,
                color:      currentLevel === lvl ? "#000" : C.text,
                border:     `1px solid ${currentLevel === lvl ? C.orange : C.border}`,
              }}
            >
              {levelLabel(lvl)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Fiche opérateur ───────────────────────────────────────────────────────────

interface FicheProps {
  operator: Operator;
  onClose: () => void;
  onSaved: (op: Operator) => void;
}
function FicheOperateur({ operator, onClose, onSaved }: FicheProps) {
  const [notes, setNotes] = useState(operator.notes ?? "");
  const [saving, setSaving] = useState(false);
  const { toast, msg } = useToast();

  const saveNotes = async () => {
    setSaving(true);
    const res = await fetch(`/api/operators/${operator.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    if (res.ok) {
      const updated = await res.json() as Operator;
      onSaved(updated);
      toast("Notes enregistrées");
    }
    setSaving(false);
  };

  const postSkills  = operator.skills.filter((s) => s.workPostId !== null);

  return (
    <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 360, background: C.s1, borderLeft: `1px solid ${C.border}`, zIndex: 5000, overflowY: "auto", display: "flex", flexDirection: "column" }}>
      {msg && (
        <div style={{ position: "fixed", top: 16, right: 16, background: C.green, color: "#000", padding: "8px 16px", borderRadius: 6, fontSize: 13, fontWeight: 700, zIndex: 9999 }}>{msg}</div>
      )}
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>{operator.name}</div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.sec, cursor: "pointer", fontSize: 18 }}>✕</button>
      </div>
      <div style={{ padding: "16px 20px", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Infos */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 5, padding: "8px 12px" }}>
            <div style={{ fontSize: 10, color: C.muted }}>Heures/semaine</div>
            <div style={{ fontWeight: 700 }}>{operator.weekHours > 0 ? `${operator.weekHours}h` : "—"}</div>
          </div>
          <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 5, padding: "8px 12px" }}>
            <div style={{ fontSize: 10, color: C.muted }}>Jours</div>
            <div style={{ fontWeight: 700, fontSize: 12 }}>
              {operator.workingDays.length > 0 ? operator.workingDays.map((d) => JOURS[d]).join(", ") : "—"}
            </div>
          </div>
        </div>

        {/* Compétences postes */}
        {postSkills.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: C.sec, marginBottom: 6, fontWeight: 700 }}>Compétences postes</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {postSkills.map((s) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 5, background: C.s2, border: `1px solid ${C.border}`, borderRadius: 4, padding: "4px 8px" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.orange }}>{s.workPostId}</span>
                  {levelBadge(s.level)}
                </div>
              ))}
            </div>
          </div>
        )}


        {postSkills.length === 0 && (
          <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic" }}>Aucune compétence enregistrée — à configurer via l'étape 0 du guide</div>
        )}

        {/* Historique dernières modifs */}
        {operator.skills.filter((s) => s.updatedBy).length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: C.sec, marginBottom: 4, fontWeight: 700 }}>Dernières modifications</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {operator.skills
                .filter((s) => s.updatedBy)
                .slice(0, 5)
                .map((s) => (
                  <div key={s.id} style={{ fontSize: 10, color: C.muted }}>
                    {s.workPostId ?? s.menuiserieType} → {levelLabel(s.level)} par {s.updatedBy}
                    {" — "}{new Date(s.updatedAt).toLocaleDateString("fr-FR")}
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <div style={{ fontSize: 11, color: C.sec, marginBottom: 4, fontWeight: 700 }}>Notes</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder='Ex: "absent le vendredi", "en formation galandage"…'
            rows={3}
            style={{ width: "100%", padding: "8px 10px", background: C.s2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
          />
          <button
            onClick={saveNotes}
            disabled={saving}
            style={{ marginTop: 6, padding: "7px 16px", background: C.orange, border: "none", borderRadius: 4, color: "#000", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
          >
            {saving ? "…" : "Enregistrer les notes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function GestionCompetences() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading]     = useState(true);
  const [ficheOp, setFicheOp]     = useState<Operator | null>(null);
  const [popup, setPopup]         = useState<{
    operator: Operator;
    targetId: string;
    targetLabel: string;
    currentLevel: number;
    isProduct: boolean;
  } | null>(null);
  const { msg, toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/operators");
    if (res.ok) setOperators(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const getLevel = (op: Operator, key: string, isProduct: boolean): number => {
    if (isProduct) {
      return op.skills.find((s) => s.menuiserieType === key && s.workPostId === null)?.level ?? 0;
    }
    return op.skills.find((s) => s.workPostId === key && s.menuiserieType === null)?.level ?? 0;
  };

  const handleCellClick = (op: Operator, targetId: string, targetLabel: string, isProduct: boolean) => {
    // Tous les utilisateurs authentifiés peuvent modifier les compétences
    setPopup({ operator: op, targetId, targetLabel, currentLevel: getLevel(op, targetId, isProduct), isProduct });
  };

  const handleLevelSelect = async (level: number) => {
    if (!popup) return;
    const { operator, targetId, isProduct } = popup;
    setPopup(null);

    const url = isProduct
      ? `/api/skills/${operator.id}/product/${targetId}`
      : `/api/skills/${operator.id}/${targetId}`;

    const res = await fetch(url, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level }),
    });

    if (res.ok) {
      toast("Compétence mise à jour");
      await load();
      // Mettre à jour la fiche si ouverte
      if (ficheOp?.id === operator.id) {
        const updatedOps = await fetch("/api/operators").then((r) => r.json()) as Operator[];
        const updated = updatedOps.find((o) => o.id === operator.id);
        if (updated) setFicheOp(updated);
      }
    } else {
      toast("Erreur lors de la mise à jour");
    }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: C.sec }}>⏳ Chargement…</div>;
  }

  const LEVEL_LEGEND = [
    { level: 1, color: C.muted,  label: "① Supervision" },
    { level: 2, color: C.orange, label: "② Autonome" },
    { level: 3, color: C.green,  label: "③ Expert" },
  ];

  const renderMatrix = (keys: { id: string; label: string }[], isProduct: boolean) => (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: "max-content" }}>
        <thead>
          <tr>
            <th style={{ padding: "8px 12px", textAlign: "left", color: C.sec, fontWeight: 700, borderBottom: `1px solid ${C.border}`, minWidth: 120, position: "sticky", left: 0, background: C.s1 }}>
              Opérateur
            </th>
            {keys.map((k) => (
              <th key={k.id} style={{ padding: "8px 8px", textAlign: "center", color: C.orange, fontWeight: 700, borderBottom: `1px solid ${C.border}`, minWidth: 56, whiteSpace: "nowrap" }}>
                {k.id}
              </th>
            ))}
          </tr>
          {!isProduct && (
            <tr>
              <td style={{ position: "sticky", left: 0, background: C.s1 }} />
              {keys.map((k) => (
                <td key={k.id} style={{ padding: "2px 8px", textAlign: "center", color: C.muted, fontSize: 9, borderBottom: `1px solid ${C.border}` }}>
                  {k.label}
                </td>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {operators.map((op) => (
            <tr key={op.id} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td
                style={{ padding: "6px 12px", fontWeight: 700, color: C.text, position: "sticky", left: 0, background: C.s1, cursor: "pointer", whiteSpace: "nowrap" }}
                onClick={() => setFicheOp(ficheOp?.id === op.id ? null : op)}
              >
                {op.name}
                <span style={{ fontSize: 10, color: C.muted, marginLeft: 6 }}>↗</span>
              </td>
              {keys.map((k) => {
                const lvl = getLevel(op, k.id, isProduct);
                return (
                  <td
                    key={k.id}
                    style={{ padding: "6px 4px", textAlign: "center", cursor: "pointer" }}
                    title={`Clic pour modifier — ${op.name} / ${k.label}`}
                    onClick={() => handleCellClick(op, k.id, k.label, isProduct)}
                  >
                    {levelBadge(lvl)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const POST_LABELS: Record<string, string> = {
    C1:"Déchargement",C2:"Prép. barres",C3:"Coupe LMT 65",C4:"Coupe 2 têtes",C5:"Coupe acier",C6:"Soudure PVC",
    M1:"Dorm. couliss.",M2:"Dorm. galand.",M3:"Portes ALU",F1:"Dorm. frappe",F2:"Ouv. frappe",F3:"Mise en bois",
    MHS:"Montage HS",
    V1:"Vitr. Frappe",V2:"Vitr. Coul/Gal",V3:"Emballage",
    L1:"Décharg. fourn.",L2:"Rang. profilés",L3:"Rang. access.",L4:"Prépa acc. fab.",L5:"Prépa acc. livr.",L6:"Réal. palettes",L7:"Charg. palettes",
    IL:"Coupe Lisec",IB:"Coupe Bottero",I3:"Coupe interc.",I4:"Assemblage VI",
    AUT:"Autre",
  };
  const postKeys = ALL_POST_IDS.map((id) => ({ id, label: POST_LABELS[id] ?? id }));


  return (
    <div style={{ padding: "0 0 40px" }}>
      {msg && (
        <div style={{ position: "fixed", top: 16, right: ficheOp ? 376 : 16, background: C.green, color: "#000", padding: "8px 16px", borderRadius: 6, fontSize: 13, fontWeight: 700, zIndex: 9999 }}>{msg}</div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>
          Compétences opérateurs
          <span style={{ fontSize: 12, color: C.muted, marginLeft: 8 }}>{operators.length} opérateurs</span>
        </div>
        <div style={{ fontSize: 12, color: C.sec }}>Clic sur une case pour modifier le niveau</div>
      </div>

      {/* Légende */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        {LEVEL_LEGEND.map((l) => (
          <div key={l.level} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            {levelBadge(l.level)}
            <span style={{ color: C.sec }}>{l.label}</span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <span style={{ color: C.muted, fontSize: 13 }}>—</span>
          <span style={{ color: C.sec }}>Pas de compétence</span>
        </div>
      </div>

      {/* Matrice compétences par poste */}
      <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6, padding: 16, marginBottom: 12 }}>
        {POST_GROUPS.map((g) => (
            <div key={g.label} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.orange, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                {g.label}
              </div>
              {renderMatrix(postKeys.filter((k) => g.ids.includes(k.id)), false)}
            </div>
          ))}
        </div>

      {/* Popup édition niveau */}
      {popup && (
        <LevelPopup
          operatorName={popup.operator.name}
          targetLabel={popup.targetLabel}
          currentLevel={popup.currentLevel}
          onSelect={handleLevelSelect}
          onClose={() => setPopup(null)}
        />
      )}

      {/* Fiche opérateur */}
      {ficheOp && (
        <FicheOperateur
          operator={ficheOp}
          onClose={() => setFicheOp(null)}
          onSaved={(op) => {
            setFicheOp(op);
            setOperators((prev) => prev.map((o) => o.id === op.id ? op : o));
          }}
        />
      )}
    </div>
  );
}
