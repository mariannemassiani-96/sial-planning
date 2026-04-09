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

// ── Visuels inline SVG / mockups ─────────────────────────────────────────────

function MockupToggle() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginTop: 12 }}>
      <div style={{ position: "relative", display: "inline-flex", gap: 0, border: `2px solid ${T.bAccent}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "12px 28px", background: T.orange, color: "#000", fontWeight: 800, fontSize: 15 }}>
          Coulissants / Gal / Portes
        </div>
        <div style={{ padding: "12px 28px", background: T.card, color: T.muted, fontWeight: 600, fontSize: 15 }}>
          Frappes
        </div>
        {/* Flèche d'annotation */}
        <div style={{ position: "absolute", top: -36, left: 60, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: T.orange, fontWeight: 700, whiteSpace: "nowrap" }}>← Clique ici pour choisir</span>
          <span style={{ fontSize: 22, color: T.orange, lineHeight: 1 }}>↓</span>
        </div>
      </div>
      <div style={{ fontSize: 13, color: T.sec, fontStyle: "italic" }}>
        Le bouton sélectionné s'allume en orange
      </div>
    </div>
  );
}

function MockupAlertes() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12, maxWidth: 500 }}>
      <div style={{ background: `${T.red}22`, border: `2px solid ${T.red}`, borderRadius: 6, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 22 }}>🔴</span>
        <div>
          <div style={{ fontWeight: 700, color: T.red, fontSize: 14 }}>URGENT — Commande en retard</div>
          <div style={{ fontSize: 12, color: T.sec }}>Chantier Martin — livraison dépassée de 3 jours</div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 11, color: T.red, fontWeight: 700 }}>← ROUGE</div>
      </div>
      <div style={{ background: `${T.orange}22`, border: `2px solid ${T.orange}`, borderRadius: 6, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 22 }}>🟠</span>
        <div>
          <div style={{ fontWeight: 700, color: T.orange, fontSize: 14 }}>Attente vitrages depuis 4 jours</div>
          <div style={{ fontSize: 12, color: T.sec }}>3 cadres SIAL attendent ISULA</div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 11, color: T.orange, fontWeight: 700 }}>← ORANGE</div>
      </div>
      <div style={{ background: `${T.yellow}22`, border: `2px solid ${T.yellow}`, borderRadius: 6, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 22 }}>🟡</span>
        <div>
          <div style={{ fontWeight: 700, color: T.yellow, fontSize: 14 }}>Pièce spéciale en cours</div>
          <div style={{ fontSize: 12, color: T.sec }}>Coulissant 5m20 — poste C3 — 4h30 estimées</div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 11, color: T.yellow, fontWeight: 700 }}>← JAUNE</div>
      </div>
    </div>
  );
}

function MockupTaskCard() {
  return (
    <div style={{ marginTop: 12, maxWidth: 420 }}>
      <div style={{ background: T.panel, border: `2px solid ${T.bAccent}`, borderRadius: 8, padding: "14px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Chantier Dupont</div>
            <div style={{ fontSize: 13, color: T.sec }}>Montage — 3 coulissants PVC</div>
          </div>
          <div style={{ fontSize: 12, color: T.muted }}>≈ 2h30</div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {/* Bouton cible - entouré */}
          <div style={{ position: "relative" }}>
            <button style={{ padding: "10px 20px", background: T.blue, color: "#fff", border: "none", borderRadius: 6, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              ✓ Marquer terminé
            </button>
            {/* Cercle d'annotation */}
            <div style={{ position: "absolute", inset: -4, border: `3px solid ${T.red}`, borderRadius: 10, pointerEvents: "none" }} />
            <div style={{ position: "absolute", top: -28, left: 0, fontSize: 12, color: T.red, fontWeight: 700, whiteSpace: "nowrap" }}>
              ← Ce bouton !
            </div>
          </div>
          <button style={{ padding: "10px 16px", background: "transparent", color: T.muted, border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 13, cursor: "pointer" }}>
            Problème
          </button>
        </div>
      </div>
    </div>
  );
}

function MockupBloquer() {
  const [shown, setShown] = useState(false);
  return (
    <div style={{ marginTop: 12, maxWidth: 420 }}>
      <div style={{ background: T.panel, border: `2px solid ${T.bAccent}`, borderRadius: 8, padding: "14px 16px" }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Chantier Martin — Coupe profilés</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ padding: "10px 16px", background: T.blue, color: "#fff", border: "none", borderRadius: 6, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
            ✓ Marquer terminé
          </button>
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShown(!shown)}
              style={{ padding: "10px 16px", background: T.orange, color: "#000", border: "none", borderRadius: 6, fontWeight: 700, fontSize: 14, cursor: "pointer" }}
            >
              ⚠ Signaler un problème
            </button>
            <div style={{ position: "absolute", top: -28, left: 0, fontSize: 12, color: T.orange, fontWeight: 700, whiteSpace: "nowrap" }}>
              ← Bouton orange
            </div>
          </div>
        </div>
        {shown && (
          <div style={{ marginTop: 12, padding: "10px 12px", background: T.card, border: `1px solid ${T.amber}`, borderRadius: 6 }}>
            <div style={{ fontSize: 13, color: T.sec, marginBottom: 6 }}>Décris le problème en 2 mots :</div>
            <input
              readOnly
              value="joint manquant"
              style={{ width: "100%", padding: "8px 10px", background: T.bg, border: `1px solid ${T.bAccent}`, borderRadius: 4, color: T.text, fontSize: 14 }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button style={{ flex: 1, padding: "8px", background: T.orange, color: "#000", border: "none", borderRadius: 4, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                Confirmer
              </button>
              <button onClick={() => setShown(false)} style={{ padding: "8px 14px", background: "transparent", color: T.muted, border: `1px solid ${T.border}`, borderRadius: 4, fontSize: 12, cursor: "pointer" }}>
                Annuler
              </button>
            </div>
          </div>
        )}
        {!shown && (
          <div style={{ fontSize: 12, color: T.muted, marginTop: 8, fontStyle: "italic" }}>
            Clique sur "Signaler un problème" pour voir le formulaire →
          </div>
        )}
      </div>
    </div>
  );
}

function MockupPlanning() {
  const days = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
  const tasks = [
    { day: 0, label: "Dupont — Coupe", color: T.muted,   status: "⬜" },
    { day: 0, label: "Martin — Coupe", color: T.red,     status: "🔴" },
    { day: 1, label: "Durand — Montage", color: T.blue,  status: "🔵" },
    { day: 2, label: "Bernard — Vitrage", color: T.green,status: "🟢" },
    { day: 3, label: "Simon — Montage", color: T.muted,  status: "⬜" },
    { day: 4, label: "Blanc — Coupe", color: T.muted,    status: "⬜" },
  ];
  const charges = [85, 70, 60, 40, 50];
  return (
    <div style={{ marginTop: 12, overflowX: "auto" }}>
      <div style={{ display: "flex", gap: 6, minWidth: 500 }}>
        {days.map((d, i) => {
          const c = charges[i];
          const barColor = c > 90 ? T.red : c > 70 ? T.orange : T.green;
          return (
            <div key={d} style={{ flex: 1, background: T.panel, border: `1px solid ${T.bAccent}`, borderRadius: 6, padding: "8px 8px 10px", minWidth: 90 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.sec, marginBottom: 6, textAlign: "center" }}>{d}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {tasks.filter((t) => t.day === i).map((t, j) => (
                  <div key={j} style={{ background: T.card, border: `1px solid ${t.color}44`, borderLeft: `3px solid ${t.color}`, borderRadius: 3, padding: "4px 6px", fontSize: 10, color: T.text }}>
                    {t.status} {t.label}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 8 }}>
                <div style={{ height: 5, background: T.border, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${c}%`, height: "100%", background: barColor, borderRadius: 3 }} />
                </div>
                <div style={{ fontSize: 9, color: barColor, marginTop: 2, textAlign: "right" }}>{c}%</div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
        {[["⬜ Gris", "Pas encore démarré", T.muted], ["🔵 Bleu", "En cours", T.blue], ["🟢 Vert", "Prêt à livrer", T.green], ["🔴 Rouge", "En retard", T.red]].map(([emoji, label, color]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
            <span style={{ color: color as string }}>{emoji}</span>
            <span style={{ color: T.sec }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Contenu des 5 étapes ─────────────────────────────────────────────────────

interface Step {
  titre: string;
  sous_titre?: string;
  contenu: React.ReactNode;
  note?: React.ReactNode;
  visuel: React.ReactNode;
  boutonFinal?: string;
}

const STEPS: Step[] = [
  {
    titre: "Chaque matin : le tableau de bord",
    contenu: (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ margin: 0 }}>
          Quand tu arrives à l'atelier, ouvre l'appli et tu vois directement la page <strong style={{ color: T.orange }}>"Matin SIAL+ISULA"</strong>.
        </p>
        <p style={{ margin: 0 }}>
          <strong>Première chose à faire : choisir le mode du jour.</strong>
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 12, borderLeft: `3px solid ${T.bAccent}` }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ color: T.orange, fontWeight: 800, fontSize: 18, lineHeight: 1.2 }}>→</span>
            <span>Si aujourd'hui tu fais des <strong>coulissants, galandages ou portes</strong> : clique sur <strong style={{ color: T.orange }}>[Coulissants / Gal / Portes]</strong></span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ color: T.orange, fontWeight: 800, fontSize: 18, lineHeight: 1.2 }}>→</span>
            <span>Si aujourd'hui tu fais des <strong>frappes</strong> : clique sur <strong style={{ color: T.orange }}>[Frappes]</strong></span>
          </div>
        </div>
        <p style={{ margin: 0 }}>
          L'appli va alors t'afficher les bons postes pour la journée.
        </p>
      </div>
    ),
    note: (
      <div style={{ background: `${T.amber}18`, border: `1px solid ${T.amber}`, borderRadius: 6, padding: "10px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span style={{ fontSize: 18 }}>⚠</span>
        <span style={{ fontSize: 14, color: T.amber }}>
          <strong>Mercredi et vendredi :</strong> ISULA ne travaille pas. La section ISULA disparaît automatiquement ces jours-là.
        </span>
      </div>
    ),
    visuel: <MockupToggle />,
  },
  {
    titre: "Les alertes en rouge et orange : agis en premier",
    contenu: (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ margin: 0 }}>En haut de la page, tu vois les alertes du jour.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ fontSize: 20 }}>🔴</span>
            <div>
              <strong style={{ color: T.red }}>ROUGE = urgent, ça bloque une livraison</strong>
              <div style={{ color: T.sec, fontSize: 14, marginTop: 3 }}>Commandes en retard · Stock de profilés ou de vitrages trop bas</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ fontSize: 20 }}>🟠</span>
            <div>
              <strong style={{ color: T.orange }}>ORANGE = attention, à surveiller</strong>
              <div style={{ color: T.sec, fontSize: 14, marginTop: 3 }}>Des cadres SIAL attendent les vitrages ISULA depuis trop longtemps</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ fontSize: 20 }}>🟡</span>
            <div>
              <strong style={{ color: T.yellow }}>JAUNE = pièces spéciales en cours cette semaine</strong>
              <div style={{ color: T.sec, fontSize: 14, marginTop: 3 }}>Coulissants ou galandages &gt; 4m qui prennent beaucoup de temps sur un poste</div>
            </div>
          </div>
        </div>
        <p style={{ margin: 0, color: T.sec, fontSize: 14 }}>
          Si tu vois une alerte que tu ne comprends pas ou que tu ne peux pas régler seul : <strong style={{ color: T.text }}>appelle Marianne.</strong>
        </p>
      </div>
    ),
    visuel: <MockupAlertes />,
  },
  {
    titre: "Un lot est fini ? Tu coches ici",
    contenu: (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ margin: 0 }}>
          Dans la section <strong style={{ color: T.orange }}>"Aujourd'hui — SIAL"</strong>, tu vois les postes actifs du jour et les commandes à traiter sur chaque poste.
        </p>
        <p style={{ margin: 0 }}>Quand un lot est terminé sur un poste :</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            ["1", "Trouve la commande dans la liste du poste"],
            ["2", <>Clique sur le bouton bleu <strong style={{ color: T.blue }}>"Marquer terminé"</strong></> ],
            ["3", "L'appli te demande combien de minutes ça a pris (optionnel — tu peux laisser vide si tu ne sais pas)"],
            ["4", <>La commande passe en <strong style={{ color: T.green }}>vert ✓</strong></> ],
          ].map(([n, text]) => (
            <div key={String(n)} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: T.blue, color: "#fff", fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {n}
              </div>
              <div style={{ paddingTop: 3, fontSize: 15 }}>{text}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 14, color: T.muted, fontStyle: "italic" }}>C'est tout. Pas besoin de faire autre chose.</div>
      </div>
    ),
    note: (
      <div style={{ background: `${T.red}15`, border: `1px solid ${T.red}55`, borderRadius: 6, padding: "10px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span style={{ fontSize: 18 }}>❗</span>
        <span style={{ fontSize: 14, color: T.sec }}>
          Si tu ne marques pas les tâches terminées, <strong style={{ color: T.text }}>Marianne ne peut pas voir l'avancement réel</strong> et les plannings seront faux.
        </span>
      </div>
    ),
    visuel: <MockupTaskCard />,
  },
  {
    titre: "Quelque chose ne va pas : bouton orange",
    contenu: (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ margin: 0 }}>
          Si tu ne peux pas avancer sur une tâche <span style={{ color: T.sec }}>(pièce manquante, machine en panne, défaut sur un profil…)</span> :
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            ["1", <>Clique sur <strong style={{ color: T.orange }}>"Signaler un problème"</strong> (bouton orange)</> ],
            ["2", <>Écris en 2 mots ce qui bloque <span style={{ color: T.muted }}>(ex: "joint manquant", "machine coupe en panne")</span></> ],
            ["3", "Clique Confirmer"],
          ].map(([n, text]) => (
            <div key={String(n)} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: T.orange, color: "#000", fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {n}
              </div>
              <div style={{ paddingTop: 3, fontSize: 15 }}>{text}</div>
            </div>
          ))}
        </div>
        <p style={{ margin: 0, padding: "10px 14px", background: T.card, border: `1px solid ${T.bAccent}`, borderRadius: 6, fontSize: 14, color: T.sec }}>
          La commande passe en statut <strong style={{ color: T.red }}>"Bloqué"</strong> et Marianne est prévenue automatiquement.<br /><br />
          Tu n'as pas besoin de chercher comment débloquer — <strong style={{ color: T.text }}>c'est Marianne qui gère la suite.</strong>
        </p>
      </div>
    ),
    visuel: <MockupBloquer />,
  },
  {
    titre: "Le planning de la semaine",
    contenu: (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ margin: 0 }}>
          Tu veux voir tout ce qui est prévu cette semaine ? Clique sur l'onglet <strong style={{ color: T.orange }}>"Planning semaine"</strong> en haut.
        </p>
        <p style={{ margin: 0 }}>Tu vois un calendrier avec les 5 jours. <strong>Chaque carte = une tâche planifiée sur un poste.</strong></p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {[
            ["⬜ Gris", "Pas encore démarré", T.muted],
            ["🔵 Bleu", "En cours", T.blue],
            ["🟢 Vert", "Prêt à livrer", T.green],
            ["🔴 Rouge", "En retard", T.red],
          ].map(([icon, label, color]) => (
            <div key={label} style={{ display: "flex", gap: 8, alignItems: "center", background: T.card, border: `1px solid ${T.border}`, borderRadius: 4, padding: "6px 10px" }}>
              <span style={{ fontSize: 16 }}>{icon}</span>
              <span style={{ fontSize: 13, color: T.sec }}>{label}</span>
            </div>
          ))}
        </div>
        <div style={{ background: T.card, border: `1px solid ${T.bAccent}`, borderRadius: 6, padding: "10px 14px", fontSize: 14 }}>
          <strong>La barre en bas de chaque jour :</strong>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}><div style={{ width: 30, height: 8, background: T.green, borderRadius: 3 }} /> <span style={{ color: T.sec }}>Vert = OK, bon rythme</span></div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}><div style={{ width: 30, height: 8, background: T.orange, borderRadius: 3 }} /> <span style={{ color: T.sec }}>Orange = attention, c'est chargé</span></div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}><div style={{ width: 30, height: 8, background: T.red, borderRadius: 3 }} /> <span style={{ color: T.sec }}>Rouge = trop chargé, parle à Marianne</span></div>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 14, color: T.sec }}>
          Tu peux <strong style={{ color: T.text }}>déplacer une carte d'un jour à l'autre en la faisant glisser.</strong> L'appli vérifiera si c'est possible.
        </p>
      </div>
    ),
    visuel: <MockupPlanning />,
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
