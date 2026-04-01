"use client";
import { useState, useEffect, useMemo } from "react";
import { C, TACHES_FABRICATION, TACHES_RITUELLES_DEFAUT, fmtDate, CommandeCC } from "@/lib/sial-data";
import { H, Bdg } from "@/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

type SaisieAvancement = {
  id: string;
  tacheId: string;
  tacheLabel: string;
  commandeId?: string;
  quantite: number;
  quantiteCible?: number;
  operateur: string;
  createdAt: string;
};

type TacheJour = {
  id: string;
  label: string;
  commandeId?: string;
  commandeLabel?: string;
  quantiteCible?: number;
  source: "rituelle" | "planning" | "manuelle";
};

type OngletId = "today" | "historique" | "commandes";

// ── Fallback tâches rituelles (si import échoue) ───────────────────────────

const RITUELLES_FALLBACK = [
  { id: "nettoyage_soir", label: "Nettoyage du soir",                  fixe: true,  visible: true },
  { id: "charg_client_r", label: "Chargement camion client",           fixe: false, visible: true },
  { id: "dech_fourn_r",   label: "Déchargement camion fournisseur",    fixe: false, visible: true },
  { id: "rangement_r",    label: "Rangement stock",                    fixe: false, visible: true },
  { id: "maintenance",    label: "Maintenance",                         fixe: false, visible: true },
  { id: "prep_access_r",  label: "Préparation accessoires",            fixe: false, visible: true },
];

const RITUELLES = (() => {
  try { return TACHES_RITUELLES_DEFAUT ?? RITUELLES_FALLBACK; }
  catch { return RITUELLES_FALLBACK; }
})();

// ── Helpers ───────────────────────────────────────────────────────────────────

const OPERATEUR_DEFAUT = "ange-joseph";

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function fmtDateFR(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function fmtDateCourt(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short", day: "numeric", month: "short",
  });
}

function cuid(): string {
  return String(Date.now()) + Math.random().toString(36).slice(2, 6);
}

function lsGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

function lsSet(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
}

function getPerfColor(pct: number): string {
  if (pct >= 100) return C.green;
  if (pct >= 50)  return C.orange;
  return C.red;
}

function getPerfLabel(pct: number): string {
  if (pct >= 100) return "TERMINÉ ✓";
  if (pct > 0)    return "EN COURS";
  return "PAS COMMENCÉ";
}

function getSaisiesDate(date: string): SaisieAvancement[] {
  return lsGet<SaisieAvancement[]>(`avancement_${date}`, []);
}

function setSaisiesDate(date: string, saisies: SaisieAvancement[]): void {
  lsSet(`avancement_${date}`, saisies);
}

function totalRealise(tacheId: string, date: string): number {
  return getSaisiesDate(date)
    .filter(s => s.tacheId === tacheId)
    .reduce((acc, s) => acc + s.quantite, 0);
}

function getDatesSaisies(): string[] {
  if (typeof window === "undefined") return [];
  const dates: string[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().split("T")[0];
    if (localStorage.getItem(`avancement_${iso}`)) dates.push(iso);
  }
  return dates;
}

function getLundiSemaine(iso: string): string {
  const d = new Date(iso);
  const jour = d.getDay();
  const diff = jour === 0 ? -6 : 1 - jour;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

// ── Barre de progression ───────────────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }) {
  const col = getPerfColor(pct);
  return (
    <div style={{ height: 8, background: C.border, borderRadius: 4, overflow: "hidden", marginTop: 6 }}>
      <div style={{
        width: `${Math.min(100, pct)}%`, height: "100%",
        background: col, borderRadius: 4,
        transition: "width .35s ease",
      }} />
    </div>
  );
}

// ── Onglets navigation ─────────────────────────────────────────────────────

function OngletNav({ active, onChange }: { active: OngletId; onChange: (id: OngletId) => void }) {
  const onglets: { id: OngletId; label: string }[] = [
    { id: "today",      label: "Aujourd'hui" },
    { id: "historique", label: "Historique"  },
    { id: "commandes",  label: "Par commande" },
  ];
  return (
    <div style={{ display: "flex", gap: 4, background: C.s1, borderRadius: 8, padding: 4, marginBottom: 16 }}>
      {onglets.map(o => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          style={{
            flex: 1, minHeight: 44, border: "none", borderRadius: 6,
            background: active === o.id ? C.blue : "transparent",
            color: active === o.id ? "#fff" : C.sec,
            fontWeight: active === o.id ? 700 : 400,
            fontSize: 14, cursor: "pointer", transition: "all .2s",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Carte tâche du jour ───────────────────────────────────────────────────

function TacheCard({
  tache, date, onSaisie,
}: {
  tache: TacheJour;
  date: string;
  onSaisie: () => void;
}) {
  const [inputVal, setInputVal] = useState("");
  const [flash, setFlash]       = useState(false);
  const [realise, setRealise]   = useState(0);

  // Recharge le total réalisé à chaque render forcé par onSaisie
  useEffect(() => {
    setRealise(totalRealise(tache.id, date));
  });

  const cible  = tache.quantiteCible;
  const pct    = cible ? Math.round((realise / cible) * 100) : realise > 0 ? 100 : 0;
  const col    = getPerfColor(pct);
  const statut = getPerfLabel(pct);

  function valider() {
    const qte = parseFloat(inputVal);
    if (isNaN(qte) || qte <= 0) return;
    const saisies = getSaisiesDate(date);
    saisies.push({
      id: cuid(),
      tacheId: tache.id,
      tacheLabel: tache.label,
      commandeId: tache.commandeId,
      quantite: qte,
      quantiteCible: cible,
      operateur: OPERATEUR_DEFAUT,
      createdAt: new Date().toISOString(),
    });
    setSaisiesDate(date, saisies);
    setInputVal("");
    setFlash(true);
    setTimeout(() => setFlash(false), 1200);
    onSaisie();
  }

  return (
    <div style={{
      background: flash ? C.green + "18" : C.s1,
      border: `1px solid ${flash ? C.green : C.border}`,
      borderRadius: 10, padding: 16, marginBottom: 12,
      transition: "background .3s, border-color .3s",
    }}>
      {/* Header tâche */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ flex: 1, paddingRight: 10 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{tache.label}</div>
          {tache.commandeLabel && (
            <div style={{ fontSize: 12, color: C.sec, marginTop: 3 }}>{tache.commandeLabel}</div>
          )}
        </div>
        <Bdg t={statut} c={col} sz={11} />
      </div>

      {/* Quantités */}
      <div style={{ display: "flex", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
        {cible !== undefined && (
          <div style={{ fontSize: 13, color: C.sec }}>
            Cible : <span style={{ color: C.text, fontWeight: 600 }}>{cible}</span>
          </div>
        )}
        {realise > 0 && (
          <div style={{ fontSize: 13, color: C.sec }}>
            Réalisé : <span style={{ color: col, fontWeight: 700 }}>{realise}</span>
          </div>
        )}
        {cible !== undefined && (
          <div style={{ fontSize: 13, color: C.sec }}>
            Reste : <span style={{ color: C.text, fontWeight: 600 }}>{Math.max(0, cible - realise)}</span>
          </div>
        )}
      </div>

      {/* Barre de progression */}
      {(cible !== undefined || realise > 0) && <ProgressBar pct={pct} />}
      {cible !== undefined && (
        <div style={{ fontSize: 11, color: col, marginTop: 4, textAlign: "right" }}>{pct}%</div>
      )}

      {/* Saisie */}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          type="number"
          min="0"
          step="1"
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => e.key === "Enter" && valider()}
          placeholder="Qté réalisée"
          style={{
            flex: 1, height: 48, borderRadius: 8, border: `1px solid ${C.border}`,
            background: C.s2, color: C.text, fontSize: 18, fontWeight: 600,
            padding: "0 14px", outline: "none", textAlign: "center",
          }}
        />
        <button
          onClick={valider}
          style={{
            height: 48, minWidth: 110, borderRadius: 8, border: "none",
            background: C.green, color: "#fff",
            fontSize: 16, fontWeight: 700, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          ✓ Valider
        </button>
      </div>
      {flash && (
        <div style={{ marginTop: 8, fontSize: 13, color: C.green, fontWeight: 600, textAlign: "center" }}>
          Saisie enregistrée !
        </div>
      )}
    </div>
  );
}

// ── Onglet Aujourd'hui ────────────────────────────────────────────────────

function OngletAujourdhui({ commandes }: { commandes: CommandeCC[] }) {
  const date = todayISO();
  const [taches, setTaches]       = useState<TacheJour[]>([]);
  const [tick, setTick]           = useState(0);
  const [bibliothequeOpen, setBiblioOpen] = useState(false);

  useEffect(() => {
    const cle = `taches_jour_${date}`;
    const sauvegardees = lsGet<TacheJour[]>(cle, []);
    if (sauvegardees.length > 0) {
      setTaches(sauvegardees);
      return;
    }

    const resultat: TacheJour[] = [];

    // 1. Tâches rituelles fixes
    RITUELLES.filter(r => r.fixe && r.visible).forEach(r => {
      resultat.push({ id: r.id, label: r.label, source: "rituelle" });
    });

    // 2. Tâches planifiées depuis localStorage (planning_fab_<lundi>)
    const lundi = getLundiSemaine(date);
    const planning = lsGet<Record<string, { tacheId: string; commandeId?: string; quantiteCible?: number }[]>>(
      `planning_fab_${lundi}`, {}
    );
    const jourKey = new Date(date).toLocaleDateString("fr-FR", { weekday: "long" }).toLowerCase();
    const planJour = planning[jourKey] ?? planning[date] ?? [];
    planJour.forEach(p => {
      const tf = TACHES_FABRICATION.find(t => t.id === p.tacheId);
      if (!tf) return;
      const uid = p.tacheId + (p.commandeId ? `_${p.commandeId}` : "");
      if (resultat.find(r => r.id === uid)) return;
      const cmd = commandes.find(c => String(c.id) === String(p.commandeId));
      resultat.push({
        id: uid,
        label: tf.label,
        commandeId: p.commandeId ? String(p.commandeId) : undefined,
        commandeLabel: cmd ? `Cmd ${cmd.id ?? ""} — ${cmd.client ?? ""}` : undefined,
        quantiteCible: p.quantiteCible,
        source: "planning",
      });
    });

    lsSet(cle, resultat);
    setTaches(resultat);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  function addDepuiBibliotheque(r: typeof RITUELLES[0]) {
    const cle = `taches_jour_${date}`;
    if (taches.find(t => t.id === r.id)) return;
    const nouvelles: TacheJour[] = [...taches, { id: r.id, label: r.label, source: "manuelle" }];
    setTaches(nouvelles);
    lsSet(cle, nouvelles);
  }

  const bibliotheque = RITUELLES.filter(r => !r.fixe && r.visible && !taches.find(t => t.id === r.id));

  return (
    <div>
      <H c={C.blue}>Tâches du {fmtDateCourt(date)}</H>

      {taches.length === 0 && (
        <div style={{ color: C.sec, fontSize: 15, textAlign: "center", padding: "32px 0" }}>
          Aucune tâche planifiée. Ajoutez-en depuis la bibliothèque ci-dessous.
        </div>
      )}

      {taches.map(t => (
        <TacheCard key={t.id} tache={t} date={date} onSaisie={() => setTick(x => x + 1)} />
      ))}

      {/* Bibliothèque */}
      <div style={{ marginTop: 20 }}>
        <button
          onClick={() => setBiblioOpen(v => !v)}
          style={{
            width: "100%", minHeight: 48, borderRadius: 8,
            background: C.s2, border: `1px dashed ${C.border}`,
            color: C.sec, fontSize: 15, fontWeight: 600,
            cursor: "pointer", display: "flex", alignItems: "center",
            justifyContent: "center", gap: 8,
          }}
        >
          <span style={{ fontSize: 18 }}>{bibliothequeOpen ? "▲" : "▼"}</span>
          Bibliothèque de tâches ({bibliotheque.length})
        </button>

        {bibliothequeOpen && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            {bibliotheque.length === 0 && (
              <div style={{ color: C.sec, fontSize: 13, textAlign: "center", padding: 16 }}>
                Toutes les tâches ont déjà été ajoutées.
              </div>
            )}
            {bibliotheque.map(r => (
              <div
                key={r.id}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: C.s1, border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: "12px 16px",
                }}
              >
                <span style={{ fontSize: 15, color: C.text }}>{r.label}</span>
                <button
                  onClick={() => addDepuiBibliotheque(r)}
                  style={{
                    width: 44, height: 44, borderRadius: 8, border: "none",
                    background: C.blue, color: "#fff",
                    fontSize: 24, fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  +
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* tick utilisé pour forcer le re-render des cartes après saisie */}
      <span style={{ display: "none" }} aria-hidden>{tick}</span>
    </div>
  );
}

// ── Onglet Historique ──────────────────────────────────────────────────────

type PeriodeHisto = "semaine" | "mois";

function OngletHistorique() {
  const [periode, setPeriode] = useState<PeriodeHisto>("semaine");
  const [dates, setDates]     = useState<string[]>([]);

  useEffect(() => { setDates(getDatesSaisies()); }, []);

  const today  = todayISO();
  const cutoff = useMemo(() => {
    const d = new Date();
    if (periode === "semaine") d.setDate(d.getDate() - 7);
    else d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  }, [periode]);

  const datesFiltrees = dates
    .filter(d => d >= cutoff && d <= today)
    .sort((a, b) => b.localeCompare(a));

  return (
    <div>
      <H c={C.cyan}>Historique des saisies</H>

      {/* Sélecteur période */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {(["semaine", "mois"] as PeriodeHisto[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriode(p)}
            style={{
              flex: 1, height: 44, borderRadius: 8,
              background: periode === p ? C.cyan : C.s1,
              color: periode === p ? "#fff" : C.sec,
              fontWeight: periode === p ? 700 : 400,
              fontSize: 15, cursor: "pointer",
              border: `1px solid ${periode === p ? C.cyan : C.border}`,
            } as React.CSSProperties}
          >
            {p === "semaine" ? "7 derniers jours" : "30 derniers jours"}
          </button>
        ))}
      </div>

      {datesFiltrees.length === 0 && (
        <div style={{ color: C.sec, fontSize: 15, textAlign: "center", padding: "32px 0" }}>
          Aucune saisie sur cette période.
        </div>
      )}

      {datesFiltrees.map(d => {
        const saisies = getSaisiesDate(d);
        if (saisies.length === 0) return null;

        // Agrégation par tâche pour ce jour
        const parTache = new Map<string, { label: string; total: number; cible?: number }>();
        saisies.forEach(s => {
          const ex = parTache.get(s.tacheId);
          if (ex) { ex.total += s.quantite; }
          else { parTache.set(s.tacheId, { label: s.tacheLabel, total: s.quantite, cible: s.quantiteCible }); }
        });

        // Score journalier global
        const entries = Array.from(parTache.values());
        const scoreTotal = entries.reduce((acc, v) => {
          if (!v.cible) return acc + 100;
          return acc + Math.min(100, Math.round((v.total / v.cible) * 100));
        }, 0);
        const scoreMoyen = entries.length ? Math.round(scoreTotal / entries.length) : 0;
        const scoreCol   = getPerfColor(scoreMoyen);

        return (
          <div key={d} style={{ marginBottom: 24 }}>
            {/* En-tête du jour */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 10, paddingBottom: 8,
              borderBottom: `1px solid ${C.border}`,
            }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: C.blue }}>
                {fmtDateCourt(d)}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: C.sec }}>{entries.length} tâche{entries.length > 1 ? "s" : ""}</span>
                <Bdg t={`${scoreMoyen}%`} c={scoreCol} sz={12} />
              </div>
            </div>

            {entries.map((info, idx) => {
              const pct = info.cible ? Math.round((info.total / info.cible) * 100) : 100;
              const col = getPerfColor(pct);
              return (
                <div
                  key={idx}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 0", borderBottom: `1px solid ${C.s2}`,
                  }}
                >
                  <div style={{
                    width: 10, height: 10, borderRadius: "50%",
                    background: col, flexShrink: 0, marginTop: 2,
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, color: C.text }}>{info.label}</div>
                    {info.cible !== undefined && <ProgressBar pct={pct} />}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: col }}>{info.total}</span>
                    {info.cible !== undefined && (
                      <span style={{ fontSize: 12, color: C.sec }}>/{info.cible}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Saisie rapide (onglet commandes) ──────────────────────────────────────

function SaisieRapideCommande({ commande, today }: { commande: CommandeCC; today: string }) {
  const [tacheId, setTacheId]   = useState("");
  const [quantite, setQuantite] = useState("");
  const [flash, setFlash]       = useState(false);

  const tachesDisponibles = TACHES_FABRICATION;

  function valider() {
    const qte = parseFloat(quantite);
    if (!tacheId || isNaN(qte) || qte <= 0) return;
    const tf = tachesDisponibles.find(t => t.id === tacheId);
    if (!tf) return;
    const saisies = getSaisiesDate(today);
    saisies.push({
      id: cuid(),
      tacheId,
      tacheLabel: tf.label,
      commandeId: String(commande.id ?? ""),
      quantite: qte,
      operateur: OPERATEUR_DEFAUT,
      createdAt: new Date().toISOString(),
    });
    setSaisiesDate(today, saisies);
    setTacheId("");
    setQuantite("");
    setFlash(true);
    setTimeout(() => setFlash(false), 1200);
  }

  return (
    <div style={{
      marginTop: 12, padding: 12, borderRadius: 8,
      background: C.s2, border: `1px solid ${C.border}`,
    }}>
      <div style={{ fontSize: 12, color: C.sec, marginBottom: 8, fontWeight: 600 }}>
        Saisie rapide — {commande.client ?? `Cmd ${commande.id ?? ""}`}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <select
          value={tacheId}
          onChange={e => setTacheId(e.target.value)}
          style={{
            height: 44, borderRadius: 6, border: `1px solid ${C.border}`,
            background: C.s1, color: tacheId ? C.text : C.sec,
            fontSize: 14, padding: "0 10px",
          }}
        >
          <option value="">— Choisir une tâche —</option>
          {tachesDisponibles.map(t => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="number" min="0" step="1"
            value={quantite}
            onChange={e => setQuantite(e.target.value)}
            onKeyDown={e => e.key === "Enter" && valider()}
            placeholder="Quantité"
            style={{
              flex: 1, height: 44, borderRadius: 6, border: `1px solid ${C.border}`,
              background: C.s1, color: C.text, fontSize: 16,
              padding: "0 12px", textAlign: "center",
            }}
          />
          <button
            onClick={valider}
            style={{
              height: 44, minWidth: 90, borderRadius: 6, border: "none",
              background: C.green, color: "#fff",
              fontSize: 15, fontWeight: 700, cursor: "pointer",
            }}
          >
            ✓ OK
          </button>
        </div>
      </div>
      {flash && (
        <div style={{ marginTop: 6, fontSize: 13, color: C.green, fontWeight: 600 }}>
          Saisie enregistrée !
        </div>
      )}
    </div>
  );
}

// ── Onglet Par commande ────────────────────────────────────────────────────

function OngletCommandes({ commandes }: { commandes: CommandeCC[] }) {
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set());
  const today = todayISO();

  const actives = useMemo(
    () => commandes.filter(c => c.id !== undefined && c.id !== null),
    [commandes]
  );

  function toggle(id: string) {
    setOuvertes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function getSaisiesCommande(commandeId: string): SaisieAvancement[] {
    const toutes: SaisieAvancement[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split("T")[0];
      getSaisiesDate(iso)
        .filter(s => s.commandeId === commandeId)
        .forEach(s => toutes.push(s));
    }
    return toutes;
  }

  if (actives.length === 0) {
    return (
      <div>
        <H c={C.purple}>Par commande</H>
        <div style={{ color: C.sec, fontSize: 15, textAlign: "center", padding: "32px 0" }}>
          Aucune commande active.
        </div>
      </div>
    );
  }

  return (
    <div>
      <H c={C.purple}>Par commande</H>

      {actives.map(cmd => {
        const cmdId  = String(cmd.id ?? "");
        const ouvert = ouvertes.has(cmdId);
        const saisies = getSaisiesCommande(cmdId);

        // Agrégation par tâche
        const parTache = new Map<string, { label: string; total: number; cible?: number }>();
        saisies.forEach(s => {
          const ex = parTache.get(s.tacheId);
          if (ex) ex.total += s.quantite;
          else parTache.set(s.tacheId, { label: s.tacheLabel, total: s.quantite, cible: s.quantiteCible });
        });

        const totalTaches = parTache.size;
        const terminees   = Array.from(parTache.values()).filter(v => v.cible == null || v.total >= v.cible).length;
        const pctGlobal   = totalTaches > 0 ? Math.round((terminees / totalTaches) * 100) : 0;
        const colGlobal   = getPerfColor(pctGlobal);

        return (
          <div
            key={cmdId}
            style={{
              background: C.s1, border: `1px solid ${C.border}`,
              borderRadius: 10, marginBottom: 12, overflow: "hidden",
            }}
          >
            {/* Header commande */}
            <button
              onClick={() => toggle(cmdId)}
              style={{
                width: "100%", minHeight: 60, background: "transparent", border: "none",
                padding: "14px 16px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 12, textAlign: "left",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                  <span style={{ fontSize: 17, fontWeight: 700, color: C.text }}>
                    Cmd {cmdId}
                  </span>
                  {cmd.client && <Bdg t={cmd.client} c={C.blue} sz={12} />}
                  {cmd.priorite && <Bdg t={cmd.priorite} c={C.orange} sz={11} />}
                  {cmd.date_livraison_souhaitee && (
                    <Bdg t={`Livr. ${fmtDate(cmd.date_livraison_souhaitee)}`} c={C.sec} sz={11} />
                  )}
                </div>
                <ProgressBar pct={pctGlobal} />
                <div style={{ fontSize: 12, color: colGlobal, marginTop: 4 }}>
                  {terminees}/{totalTaches} tâches saisies · {pctGlobal}%
                </div>
              </div>
              <span style={{ fontSize: 20, color: C.sec, flexShrink: 0 }}>
                {ouvert ? "▲" : "▼"}
              </span>
            </button>

            {/* Détail tâches */}
            {ouvert && (
              <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${C.s2}` }}>
                {parTache.size === 0 && (
                  <div style={{ color: C.sec, fontSize: 13, fontStyle: "italic", padding: "12px 0" }}>
                    Aucune saisie pour cette commande (30 derniers jours).
                  </div>
                )}
                {Array.from(parTache.values()).map((info, idx) => {
                  const pct = info.cible ? Math.round((info.total / info.cible) * 100) : 100;
                  const col = getPerfColor(pct);
                  return (
                    <div
                      key={idx}
                      style={{ padding: "10px 0", borderBottom: `1px solid ${C.s2}` }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 14, color: C.text }}>{info.label}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: col }}>
                          {info.total}{info.cible != null ? `/${info.cible}` : ""}
                        </span>
                      </div>
                      {info.cible != null && <ProgressBar pct={pct} />}
                    </div>
                  );
                })}

                <SaisieRapideCommande commande={cmd} today={today} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────

export default function AvancementDashboard({ commandes }: { commandes: CommandeCC[] }) {
  const [onglet, setOnglet] = useState<OngletId>("today");

  const today     = todayISO();
  const dateLabel = fmtDateFR(today);
  const dateCapitalisee = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);

  return (
    <div style={{
      background: C.bg, minHeight: "100vh",
      padding: "0 0 48px",
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      color: C.text,
    }}>
      {/* En-tête */}
      <div style={{
        background: C.s1, borderBottom: `1px solid ${C.border}`,
        padding: "20px 16px 16px",
      }}>
        <div style={{
          fontSize: 11, color: C.sec, fontWeight: 600,
          letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4,
        }}>
          Tableau de bord avancement
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.text, lineHeight: 1.2, marginBottom: 4 }}>
          {dateCapitalisee}
        </div>
        <div style={{ fontSize: 13, color: C.sec }}>
          Opérateur : <span style={{ color: C.blue, fontWeight: 600 }}>Ange-Joseph</span>
        </div>
      </div>

      {/* Corps */}
      <div style={{ padding: "16px 16px 0" }}>
        <OngletNav active={onglet} onChange={setOnglet} />

        {onglet === "today"      && <OngletAujourdhui commandes={commandes} />}
        {onglet === "historique" && <OngletHistorique />}
        {onglet === "commandes"  && <OngletCommandes commandes={commandes} />}
      </div>
    </div>
  );
}
