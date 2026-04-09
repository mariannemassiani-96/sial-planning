/* eslint-disable react/no-unescaped-entities */
"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";

// ── Thème spécifique tutoriel (fond plus sombre #0D1B2A comme spec) ──────────
const T = {
  bg:      "#0D1B2A",
  panel:   "#112233",
  card:    "#0F2030",
  border:  "#1E3A50",
  bAccent: "#1A4A6A",
  text:    "#F0F0F0",
  sec:     "#A8C4D8",
  muted:   "#5A7A90",
  orange:  "#FFA726",
  blue:    "#42A5F5",
  green:   "#66BB6A",
  red:     "#EF5350",
  yellow:  "#FFCA28",
  amber:   "#FFB300",
};

// ── Visuels inline — mockups ─────────────────────────────────────────────────

function MockupMatin() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
      {/* Toggle mode */}
      <div style={{ display: "flex", gap: 0, border: `1px solid ${T.bAccent}`, borderRadius: 6, overflow: "hidden", alignSelf: "flex-start" }}>
        <div style={{ padding: "9px 18px", background: T.orange, color: "#000", fontWeight: 800, fontSize: 13 }}>
          Coulissants / Gal / Portes ✓
        </div>
        <div style={{ padding: "9px 18px", background: T.card, color: T.muted, fontSize: 13 }}>
          Frappes
        </div>
      </div>
      {/* Alertes */}
      <div style={{ background: `${T.red}20`, border: `1px solid ${T.red}88`, borderRadius: 5, padding: "8px 12px", display: "flex", gap: 8, alignItems: "center" }}>
        <span>🔴</span>
        <span style={{ fontSize: 13, color: T.red, fontWeight: 700 }}>Retard — Chantier Martin (3j)</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: T.red }}>Règle en premier →</span>
      </div>
      {/* Postes SIAL */}
      <div style={{ background: T.panel, border: `1px solid ${T.bAccent}`, borderRadius: 5, padding: "8px 12px" }}>
        <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>SIAL — postes actifs aujourd'hui</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {[["C1 — Coupe", "Dupont (3h) · Blanc (2h30)"], ["M2 — Montage", "Martin (4h)"]].map(([poste, cmd]) => (
            <div key={poste} style={{ display: "flex", gap: 8, alignItems: "center", background: T.card, borderRadius: 4, padding: "5px 8px" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: T.orange, width: 80 }}>{poste}</span>
              <span style={{ fontSize: 11, color: T.sec }}>{cmd}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MockupAffectation() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8, maxWidth: 380 }}>
      {/* Carte commande ouverte */}
      <div style={{ background: T.panel, border: `1px solid ${T.bAccent}`, borderRadius: 6, padding: "12px 14px" }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
          Chantier Dupont — Coupe profilés
        </div>
        {/* Tâches avec sélecteur opérateur */}
        {[
          { label: "Coupe alu", op: "Laurent" },
          { label: "Coupe PVC", op: "" },
        ].map((t, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 12, flex: 1, color: T.text }}>{t.label}</span>
            <div style={{ position: "relative" }}>
              <select
                disabled
                style={{ padding: "4px 24px 4px 8px", background: t.op ? T.card : T.bg, border: `1px solid ${t.op ? T.green : T.amber}`, borderRadius: 4, color: t.op ? T.green : T.amber, fontSize: 12, cursor: "pointer", appearance: "none" }}
              >
                <option>{t.op || "— choisir —"}</option>
              </select>
              <span style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: T.muted, pointerEvents: "none" }}>▼</span>
            </div>
          </div>
        ))}
        {/* Annotation */}
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: T.green, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: T.green }}>Laurent — affecté</span>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: T.amber, flexShrink: 0, marginLeft: 10 }} />
          <span style={{ fontSize: 11, color: T.amber }}>À affecter</span>
        </div>
      </div>
      <div style={{ fontSize: 11, color: T.muted, fontStyle: "italic" }}>
        La liste ne propose que les opérateurs formés sur ce poste
      </div>
    </div>
  );
}

function MockupAlertesSurveillance() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
      <div style={{ background: `${T.red}20`, border: `2px solid ${T.red}`, borderRadius: 6, padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 18 }}>🔴</span>
          <strong style={{ color: T.red, fontSize: 14 }}>Commande Petit — livraison demain</strong>
        </div>
        <div style={{ fontSize: 12, color: T.sec, paddingLeft: 26 }}>3 tâches encore en attente · à traiter en priorité</div>
      </div>
      <div style={{ background: `${T.orange}20`, border: `2px solid ${T.orange}`, borderRadius: 6, padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 18 }}>🟠</span>
          <strong style={{ color: T.orange, fontSize: 14 }}>Chantier Simon — attente vitrage ISULA</strong>
        </div>
        <div style={{ fontSize: 12, color: T.sec, paddingLeft: 26 }}>En attente depuis 4 jours → contacter ISULA</div>
      </div>
      <div style={{ background: T.card, border: `1px solid ${T.bAccent}`, borderRadius: 5, padding: "8px 12px", fontSize: 12, color: T.sec }}>
        💡 Si un opérateur vient te voir avec un problème : clique "Signaler un problème" sur sa tâche pour que ça reste tracé.
      </div>
    </div>
  );
}

function MockupCloture() {
  const taches = [
    { label: "Coupe alu — Dupont", poste: "C1", done: true },
    { label: "Montage coulissant — Martin", poste: "M2", done: true },
    { label: "Vitrage — Blanc", poste: "V1", done: false },
  ];
  return (
    <div style={{ marginTop: 8, maxWidth: 380 }}>
      <div style={{ background: T.panel, border: `1px solid ${T.bAccent}`, borderRadius: 6, padding: "12px 14px" }}>
        <div style={{ fontSize: 12, color: T.muted, marginBottom: 8 }}>Tâches du jour à clôturer :</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {taches.map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: T.card, borderRadius: 5, border: `1px solid ${t.done ? T.green + "55" : T.border}` }}>
              <div style={{ width: 20, height: 20, borderRadius: 4, background: t.done ? T.green : T.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>
                {t.done ? "✓" : ""}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: t.done ? T.green : T.text }}>{t.label}</div>
                <div style={{ fontSize: 10, color: T.muted }}>{t.poste}</div>
              </div>
              {t.done ? (
                <span style={{ fontSize: 11, color: T.green }}>Terminé</span>
              ) : (
                <button style={{ padding: "4px 10px", background: T.blue, color: "#fff", border: "none", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  Marquer terminé
                </button>
              )}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: T.muted, marginTop: 8, fontStyle: "italic" }}>
          Ce qui n'est pas coché reste automatiquement pour demain
        </div>
      </div>
    </div>
  );
}

function MockupPlanningSemaine() {
  const days = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
  const tasks = [
    { day: 0, label: "Dupont", color: T.muted,   special: false },
    { day: 0, label: "Martin", color: T.red,     special: false },
    { day: 1, label: "Bernard", color: T.blue,   special: false },
    { day: 1, label: "Grand format", color: T.amber, special: true },
    { day: 2, label: "Durand", color: T.green,   special: false },
    { day: 3, label: "Simon",  color: T.muted,   special: false },
    { day: 4, label: "Blanc",  color: T.muted,   special: false },
  ];
  const charges = [92, 80, 55, 40, 45];
  return (
    <div style={{ marginTop: 8, overflowX: "auto" }}>
      <div style={{ display: "flex", gap: 5, minWidth: 460 }}>
        {days.map((d, i) => {
          const c = charges[i];
          const barColor = c > 90 ? T.red : c > 70 ? T.orange : T.green;
          return (
            <div key={d} style={{ flex: 1, background: T.panel, border: `1px solid ${i === 0 ? T.red : T.bAccent}`, borderRadius: 5, padding: "7px 6px 8px", minWidth: 80 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: i === 0 ? T.red : T.sec, marginBottom: 5, textAlign: "center" }}>{d}{i === 0 ? " ⚠" : ""}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {tasks.filter((t) => t.day === i).map((t, j) => (
                  <div key={j} style={{ background: T.card, borderLeft: `3px solid ${t.color}`, borderRadius: 3, padding: "3px 5px", fontSize: 9, color: T.text, display: "flex", alignItems: "center", gap: 4 }}>
                    {t.label}
                    {t.special && <span style={{ background: T.amber, color: "#000", fontSize: 8, fontWeight: 700, padding: "0 3px", borderRadius: 2 }}>SPÉCIAL</span>}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 6 }}>
                <div style={{ height: 4, background: T.border, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${c}%`, height: "100%", background: barColor, borderRadius: 2 }} />
                </div>
                <div style={{ fontSize: 8, color: barColor, marginTop: 1, textAlign: "right" }}>{c}%</div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: T.sec, marginTop: 8 }}>
        Glisse une carte pour la déplacer d'un jour à l'autre →
      </div>
    </div>
  );
}

// ── Contenu des 5 étapes ─────────────────────────────────────────────────────

interface Step {
  titre: string;
  contenu: React.ReactNode;
  note?: React.ReactNode;
  visuel: React.ReactNode;
  boutonFinal?: string;
}

const STEPS: Step[] = [
  // ── Étape 1 ──────────────────────────────────────────────────────────────
  {
    titre: "Matin — tu prépares la journée",
    contenu: (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ margin: 0 }}>
          Ouvre l'appli sur <strong style={{ color: T.orange }}>"Matin SIAL+ISULA"</strong>. C'est de là que tu organises la journée.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            {
              n: "1",
              titre: "Choisis le mode du jour",
              detail: "Coulissants / Galandages / Portes — ou — Frappes. L'appli affiche les bons postes selon ton choix.",
            },
            {
              n: "2",
              titre: "Regarde les alertes en haut",
              detail: "Si quelque chose est en rouge, règle-le avant de commencer à affecter.",
            },
            {
              n: "3",
              titre: "Dans la section SIAL, tu vois les postes actifs",
              detail: "Pour chaque poste : tu vois les commandes planifiées du jour. Tu peux alors assigner les opérateurs.",
            },
          ].map((item) => (
            <div key={item.n} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: T.orange, color: "#000", fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {item.n}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{item.titre}</div>
                <div style={{ fontSize: 13, color: T.sec, lineHeight: 1.5 }}>{item.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    note: (
      <div style={{ background: `${T.amber}18`, border: `1px solid ${T.amber}`, borderRadius: 6, padding: "10px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span style={{ fontSize: 16 }}>⚠</span>
        <span style={{ fontSize: 13, color: T.amber }}>
          <strong>Mercredi et vendredi :</strong> ISULA ne travaille pas. La section ISULA disparaît automatiquement ces jours-là.
        </span>
      </div>
    ),
    visuel: <MockupMatin />,
  },

  // ── Étape 2 ──────────────────────────────────────────────────────────────
  {
    titre: "Qui fait quoi aujourd'hui ?",
    contenu: (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ margin: 0 }}>
          Sur chaque commande, tu choisis <strong>quel opérateur travaille dessus aujourd'hui.</strong>
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 12, borderLeft: `3px solid ${T.bAccent}` }}>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ color: T.orange, fontWeight: 800 }}>→</span>
            <span style={{ fontSize: 15 }}>Clique sur une commande dans la liste du poste</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ color: T.orange, fontWeight: 800 }}>→</span>
            <span style={{ fontSize: 15 }}>Dans le détail, tu vois les tâches du jour</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ color: T.orange, fontWeight: 800 }}>→</span>
            <span style={{ fontSize: 15 }}>Pour chaque tâche : sélectionne l'opérateur dans la liste déroulante</span>
          </div>
        </div>
        <div style={{ background: T.card, border: `1px solid ${T.bAccent}`, borderRadius: 6, padding: "10px 14px", fontSize: 14, color: T.sec }}>
          La liste ne propose que les opérateurs formés sur ce poste.
          <br />
          <strong style={{ color: T.text }}>Si quelqu'un est absent :</strong> ne l'affecte pas, et préviens Marianne pour qu'elle ajuste le planning.
        </div>
      </div>
    ),
    visuel: <MockupAffectation />,
  },

  // ── Étape 3 ──────────────────────────────────────────────────────────────
  {
    titre: "Dans la journée — les alertes",
    contenu: (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ margin: 0 }}>
          Tu n'as pas besoin de rester sur l'appli toute la journée. Mais si tu vois quelque chose changer :
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ fontSize: 18 }}>🔴</span>
            <div>
              <strong style={{ color: T.red }}>Une commande passe en rouge</strong>
              <div style={{ color: T.sec, fontSize: 14, marginTop: 2 }}>Retard sur la date de livraison — à traiter en priorité</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ fontSize: 18 }}>🟠</span>
            <div>
              <strong style={{ color: T.orange }}>"En attente vitrage" depuis trop longtemps</strong>
              <div style={{ color: T.sec, fontSize: 14, marginTop: 2 }}>Contacter directement ISULA pour débloquer</div>
            </div>
          </div>
        </div>
        <div style={{ background: T.card, border: `1px solid ${T.bAccent}`, borderRadius: 6, padding: "10px 14px", fontSize: 14, color: T.sec }}>
          <strong style={{ color: T.text }}>Si un opérateur vient te signaler un problème :</strong>
          <br />
          Clique sur sa tâche → "Signaler un problème" → note ce qui bloque en 2 mots. C'est tracé, Marianne est prévenue.
        </div>
      </div>
    ),
    visuel: <MockupAlertesSurveillance />,
  },

  // ── Étape 4 ──────────────────────────────────────────────────────────────
  {
    titre: "Soir — tu coches ce qui est fait",
    contenu: (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ margin: 0 }}>
          Avant de partir, <strong>prends 5 minutes</strong> pour marquer les tâches terminées de la journée.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            ["1", <>Ouvre chaque poste actif de la journée</>],
            ["2", <>Pour chaque tâche faite : clique <strong style={{ color: T.blue }}>"Marquer terminé"</strong></>],
            ["3", "Si une tâche n'est pas finie : laisse-la telle quelle, elle reste pour demain"],
          ].map(([n, text]) => (
            <div key={String(n)} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: T.blue, color: "#fff", fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {n}
              </div>
              <div style={{ paddingTop: 4, fontSize: 15 }}>{text}</div>
            </div>
          ))}
        </div>
        <div style={{ background: `${T.blue}15`, border: `1px solid ${T.blue}55`, borderRadius: 6, padding: "10px 14px", fontSize: 14, color: T.sec }}>
          C'est ces informations qui permettent à Marianne de voir <strong style={{ color: T.text }}>l'avancement réel</strong> et de préparer les stats du lendemain.
        </div>
      </div>
    ),
    visuel: <MockupCloture />,
  },

  // ── Étape 5 ──────────────────────────────────────────────────────────────
  {
    titre: "Organiser la semaine à l'avance",
    contenu: (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ margin: 0 }}>
          Dans l'onglet <strong style={{ color: T.orange }}>"Planning semaine"</strong>, tu vois les 5 jours avec toutes les commandes planifiées.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { icon: "↔", label: "Déplace une commande d'un jour à l'autre en la faisant glisser" },
            { icon: "📊", label: "Barre rouge sous un jour = poste surchargé, à rééquilibrer" },
            { icon: "⚠", label: "Badge SPÉCIAL en amber = grand format qui bloque un poste toute la journée — à anticiper" },
          ].map((item) => (
            <div key={item.label} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: T.card, borderRadius: 5, padding: "8px 10px" }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
              <span style={{ fontSize: 14, color: T.text }}>{item.label}</span>
            </div>
          ))}
        </div>
        <div style={{ background: `${T.green}15`, border: `1px solid ${T.green}44`, borderRadius: 6, padding: "10px 14px", fontSize: 14 }}>
          <strong style={{ color: T.green }}>Conseil :</strong>
          <span style={{ color: T.sec }}> Regarde le planning <strong style={{ color: T.text }}>le vendredi</strong> pour organiser la semaine suivante et détecter les surcharges à l'avance.</span>
        </div>
      </div>
    ),
    visuel: <MockupPlanningSemaine />,
    boutonFinal: "J'ai compris, je commence →",
  },
];

// ── Composant principal ──────────────────────────────────────────────────────

const STORAGE_KEY = "tuto_aj_seen";

interface TutoAJProps {
  onClose?: () => void;
  onFinish?: () => void;
}

export function TutoAJModal({ onClose, onFinish }: TutoAJProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const close = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "true");
    onClose?.();
  }, [onClose]);

  const finish = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "true");
    onFinish?.();
  }, [onFinish]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20,
    }}>
      <div style={{
        background: T.bg, border: `1px solid ${T.bAccent}`,
        borderRadius: 12, width: "100%", maxWidth: 780,
        maxHeight: "90vh", overflow: "hidden",
        display: "flex", flexDirection: "column",
        boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
      }}>
        {/* Header */}
        <div style={{ background: T.panel, borderBottom: `1px solid ${T.bAccent}`, padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: T.orange }}>Guide atelier</div>
            <div style={{ fontSize: 13, color: T.muted }}>pour Ange-Joseph</div>
          </div>
          <button
            onClick={close}
            style={{ padding: "6px 14px", background: "transparent", border: `1px solid ${T.bAccent}`, borderRadius: 6, color: T.sec, cursor: "pointer", fontSize: 13 }}
          >
            Fermer
          </button>
        </div>

        {/* Stepper indicateur */}
        <div style={{ background: T.panel, borderBottom: `1px solid ${T.border}`, padding: "12px 24px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {STEPS.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={() => setStep(i)}
                style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: i === step ? T.orange : i < step ? T.green : T.card,
                  border: `2px solid ${i === step ? T.orange : i < step ? T.green : T.border}`,
                  color: i <= step ? "#000" : T.muted,
                  fontWeight: 800, fontSize: 13, cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {i < step ? "✓" : i + 1}
              </button>
              {i < STEPS.length - 1 && (
                <div style={{ width: 40, height: 2, background: i < step ? T.green : T.border, borderRadius: 1 }} />
              )}
            </div>
          ))}
          <div style={{ marginLeft: "auto", fontSize: 12, color: T.muted }}>
            Étape {step + 1} / {STEPS.length}
          </div>
        </div>

        {/* Contenu */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Titre de l'étape */}
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 4 }}>
              {current.titre}
            </div>
          </div>

          {/* Layout : contenu + visuel côte à côte si assez large */}
          <div style={{ display: "flex", gap: 28, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 300px", fontSize: 16, lineHeight: 1.65, color: T.text }}>
              {current.contenu}
              {current.note && (
                <div style={{ marginTop: 16 }}>
                  {current.note}
                </div>
              )}
            </div>
            <div style={{ flex: "1 1 280px" }}>
              {current.visuel}
            </div>
          </div>
        </div>

        {/* Footer navigation */}
        <div style={{ background: T.panel, borderTop: `1px solid ${T.bAccent}`, padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <button
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
            style={{
              padding: "10px 24px", fontSize: 15, fontWeight: 600, borderRadius: 6, cursor: step === 0 ? "not-allowed" : "pointer",
              background: step === 0 ? "transparent" : T.card,
              border: `1px solid ${step === 0 ? T.border : T.bAccent}`,
              color: step === 0 ? T.muted : T.text,
            }}
          >
            ← Précédent
          </button>

          <div style={{ fontSize: 12, color: T.muted }}>
            {step + 1} / {STEPS.length}
          </div>

          {isLast ? (
            <button
              onClick={finish}
              style={{ padding: "12px 32px", fontSize: 16, fontWeight: 800, borderRadius: 6, cursor: "pointer", background: T.green, border: "none", color: "#000" }}
            >
              {current.boutonFinal ?? "J'ai compris, je commence →"}
            </button>
          ) : (
            <button
              onClick={() => setStep((s) => s + 1)}
              style={{ padding: "12px 32px", fontSize: 16, fontWeight: 800, borderRadius: 6, cursor: "pointer", background: T.orange, border: "none", color: "#000" }}
            >
              Suivant →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Wrapper avec déclencheur automatique + bouton "?" ────────────────────────

interface TutoAJProps2 {
  onGoToDashboard?: () => void;
}

export default function TutoAJ({ onGoToDashboard }: TutoAJProps2) {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);

  // Ouverture automatique au premier login d'Ange-Joseph
  useEffect(() => {
    if (status !== "authenticated") return;
    const userName = (session?.user as { name?: string })?.name ?? "";
    const isAJ = userName.toLowerCase().includes("ange") || userName.toLowerCase().includes("achilli");
    const seen = localStorage.getItem(STORAGE_KEY);
    if (isAJ && !seen) {
      // Petit délai pour laisser le temps à la page de charger
      const t = setTimeout(() => setOpen(true), 800);
      return () => clearTimeout(t);
    }
  }, [status, session]);

  const handleFinish = useCallback(() => {
    setOpen(false);
    onGoToDashboard?.();
  }, [onGoToDashboard]);

  return (
    <>
      {/* Bouton "?" fixe en bas à droite */}
      <button
        onClick={() => setOpen(true)}
        title="Aide — Guide atelier"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 8000,
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: T.orange,
          border: "none",
          color: "#000",
          fontSize: 22,
          fontWeight: 800,
          cursor: "pointer",
          boxShadow: "0 4px 20px rgba(255,167,38,0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "transform 0.15s, box-shadow 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.12)";
          (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 28px rgba(255,167,38,0.6)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
          (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 20px rgba(255,167,38,0.45)";
        }}
      >
        ?
      </button>

      {/* Modal tutoriel */}
      {open && (
        <TutoAJModal
          onClose={() => setOpen(false)}
          onFinish={handleFinish}
        />
      )}
    </>
  );
}
