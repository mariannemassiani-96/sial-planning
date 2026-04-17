"use client";
import { useState, useMemo, useEffect } from "react";
import { C, CFAM, CommandeCC, TYPES_MENUISERIE, fmtDate, getWeekNum, calcCheminCritique, ZONES, EQUIPE } from "@/lib/sial-data";
import { H, Bdg } from "@/components/ui";

const ZONE_COLORS: Record<string, string> = {
  "SIAL":             "#EC407A", // Rose
  "Porto-Vecchio":    "#FB8C00", // Orange
  "Ajaccio":          "#1E88E5", // Bleu
  "Bastia":           "#E53935", // Rouge
  "Balagne":          "#FDD835", // Jaune
  "Plaine Orientale": "#8E24AA", // Violet
  "Continent":        "#43A047", // Vert
  "Sur chantier":     "#6D4C41", // Marron
  "Autre":            "#546E7A", // Gris bleuté
};

function getZoneColor(zone: string | null | undefined, fallback = "#888"): string {
  if (!zone) return fallback;
  if (ZONE_COLORS[zone]) return ZONE_COLORS[zone];
  const norm = zone.trim().toLowerCase();
  for (const [k, v] of Object.entries(ZONE_COLORS)) {
    if (k.toLowerCase() === norm) return v;
  }
  return fallback;
}

const TRANSPORTEURS = [
  { id: "nous",    label: "Par nous-memes",        c: "#42A5F5" },
  { id: "setec",   label: "Par Setec",             c: "#FFA726" },
  { id: "express", label: "Transporteur express",  c: "#66BB6A" },
  { id: "poseur",  label: "Par un poseur",         c: "#AB47BC" },
  { id: "depot",   label: "Client au depot",       c: "#26C6DA" },
];

const JOURS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

function localStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getMondayOf(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - day + (day === 0 ? -6 : 1));
  date.setHours(0, 0, 0, 0);
  return date;
}
function addWeeks(s: string, n: number): string {
  const d = new Date(s + "T12:00:00");
  d.setDate(d.getDate() + n * 7);
  return localStr(d);
}

export default function PlanningChargements({ commandes, onPatch, onEdit }: {
  commandes: CommandeCC[];
  onPatch: (id: string, updates: Record<string, unknown>) => void;
  onEdit?: (cmd: CommandeCC) => void;
}) {
  const [monday, setMonday] = useState(() => {
    const def = localStr(getMondayOf(new Date()));
    if (typeof window === "undefined") return def;
    try { return localStorage.getItem("sial_chargements_monday") || def; } catch { return def; }
  });
  useEffect(() => { try { localStorage.setItem("sial_chargements_monday", monday); } catch {} }, [monday]);

  const [filterZone, setFilterZone] = useState("");
  const [horizonWeeks, setHorizonWeeks] = useState(4); // combien de semaines à afficher

  // ── Livreurs assignés (transporteur = "nous") ──
  // Stocké via PlanningPoste : clé = "livreurs_{date}_{zoneSlug}" → { ops: string[] }
  const [livreurs, setLivreurs] = useState<Record<string, string[]>>({});
  const livreursKey = (date: string, zone: string) => `livreurs_${date}_${zone.replace(/\s+/g, "_")}`;

  // ── Nom du poseur (transporteur = "poseur") ──
  // Stocké via PlanningPoste : clé = "poseur_{date}_{zoneSlug}" → { name: string }
  const [poseurs, setPoseurs] = useState<Record<string, string>>({});
  const poseurKey = (date: string, zone: string) => `poseur_${date}_${zone.replace(/\s+/g, "_")}`;

  // ── Gel des semaines : snapshot figé par semaine ──
  // Structure stockée : { [semaineLundi]: { [transpId]: [ { date, zone, cmdIds[] } ] } }
  interface FrozenItem { date: string; zone: string; cmdIds: string[] }
  interface FrozenSnapshot { _frozenAt?: string; _frozenBy?: string; byTransp?: Record<string, FrozenItem[]> }
  const [frozen, setFrozen] = useState<Record<string, FrozenSnapshot>>({}); // key = semaineLundi
  const [reloadCounter, setReloadCounter] = useState(0);

  // Charger les snapshots des semaines de l'horizon
  useEffect(() => {
    const weekMondays: string[] = [];
    for (let w = 0; w < horizonWeeks; w++) {
      weekMondays.push(addWeeks(monday, w));
    }
    Promise.all(weekMondays.map(m =>
      fetch(`/api/chargements-frozen?semaine=${m}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => ({ m, data }))
        .catch(() => ({ m, data: null }))
    )).then(results => {
      const map: Record<string, FrozenSnapshot> = {};
      for (const { m, data } of results) {
        if (data) map[m] = data;
      }
      setFrozen(map);
    });
  }, [monday, horizonWeeks, reloadCounter]);

  const horizonDays = useMemo(() => {
    const days: string[] = [];
    for (let w = 0; w < horizonWeeks; w++) {
      for (let i = 0; i < 5; i++) {
        const d = new Date(monday + "T12:00:00");
        d.setDate(d.getDate() + w * 7 + i);
        days.push(localStr(d));
      }
    }
    return days;
  }, [monday, horizonWeeks]);

  interface Chargement {
    date: string;
    transporteur: string;
    zone: string;
    items: Array<{ cmd: any; c: CommandeCC; cc: ReturnType<typeof calcCheminCritique> }>;
  }

  // ── Construire les chargements sur l'horizon ──
  const chargements = useMemo(() => {
    const byKey = new Map<string, Chargement>();
    for (const c of commandes) {
      const cmd = c as any;
      const livDate = cmd.date_livraison_souhaitee;
      if (!livDate) continue;
      if (!horizonDays.includes(livDate)) continue;
      const statut = cmd.statut;
      if (statut === "annulee") continue;

      const transp = cmd.transporteur || "_aucun";
      const zoneG = cmd.zone || "_aucune";

      if (filterZone && zoneG !== filterZone) continue;

      const key = `${transp}|${livDate}|${zoneG}`;
      if (!byKey.has(key)) {
        byKey.set(key, { date: livDate, transporteur: transp, zone: zoneG, items: [] });
      }
      const cc = calcCheminCritique(c);
      byKey.get(key)!.items.push({ cmd, c, cc });
    }
    return Array.from(byKey.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [commandes, horizonDays, filterZone]);

  // ── Charger les livreurs depuis les affectations de toutes les semaines visibles ──
  useEffect(() => {
    const weeks = new Set<string>();
    for (const ch of chargements) {
      if (ch.transporteur !== "nous") continue;
      weeks.add(localStr(getMondayOf(new Date(ch.date + "T12:00:00"))));
    }
    if (weeks.size === 0) return;
    Promise.all(Array.from(weeks).map(wm =>
      fetch(`/api/planning/affectations?semaine=${wm}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => ({ wm, data }))
        .catch(() => ({ wm, data: null }))
    )).then(results => {
      const map: Record<string, string[]> = {};
      for (const { data } of results) {
        const lvMap = (data && (data as any)._livreurs) as Record<string, string[]> | undefined;
        if (lvMap) {
          for (const [compKey, opIds] of Object.entries(lvMap)) {
            const [date, zone] = compKey.split("|");
            if (!date || !zone) continue;
            map[livreursKey(date, zone)] = opIds;
          }
        }
      }
      setLivreurs(map);
    });
  }, [chargements]);

  // ── Charger les noms de poseurs ──
  useEffect(() => {
    const poseurChargs = chargements.filter(ch => ch.transporteur === "poseur");
    if (poseurChargs.length === 0) return;
    const keys = poseurChargs.map(ch => poseurKey(ch.date, ch.zone));
    Promise.all(keys.map(k =>
      fetch(`/api/planning-poste?semaine=${encodeURIComponent(k)}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => ({ k, data }))
        .catch(() => ({ k, data: null }))
    )).then(results => {
      const map: Record<string, string> = {};
      for (const { k, data } of results) {
        if (data && typeof (data as any).name === "string") map[k] = (data as any).name;
      }
      setPoseurs(map);
    });
  }, [chargements]);

  const savePoseur = async (date: string, zone: string, name: string) => {
    const k = poseurKey(date, zone);
    setPoseurs(prev => ({ ...prev, [k]: name }));
    try {
      await fetch(`/api/planning-poste?semaine=${encodeURIComponent(k)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
    } catch {}
  };

  // ── Sauvegarder la liste des livreurs pour un chargement ──
  // + Synchroniser avec l'affectation du planning (poste LIVR sur le jour)
  const [syncStatus, setSyncStatus] = useState<{ msg: string; ok: boolean } | null>(null);

  const saveLivreurs = async (date: string, zone: string, opIds: string[]) => {
    const k = livreursKey(date, zone);
    setLivreurs(prev => ({ ...prev, [k]: opIds }));
    setSyncStatus({ msg: "Synchro en cours...", ok: true });

    // Calcul semaine + jIdx avant tout
    const d = new Date(date + "T12:00:00");
    const weekMon = localStr(getMondayOf(d));
    const dow = d.getDay();
    const jIdx = dow === 0 ? -1 : dow === 6 ? -1 : dow - 1;
    if (jIdx < 0 || jIdx > 4) {
      setSyncStatus({ msg: "✓ Livreurs enregistrés (weekend non synchro)", ok: true });
      setTimeout(() => setSyncStatus(null), 3000);
      return;
    }

    const opNames = opIds.map(id => EQUIPE.find(m => m.id === id)?.nom).filter(Boolean) as string[];

    try {
      // 1) Charger l'affectation actuelle de la semaine
      const res = await fetch(`/api/planning/affectations?semaine=${weekMon}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`GET affectations ${res.status}: ${(err as any).error || ""}`);
      }
      const currentAff: Record<string, any> = (await res.json().catch(() => ({}))) || {};

      // 2) Stocker les livreurs dans une clé spéciale de l'affectation (pas besoin d'API séparée)
      const livreursMap = (currentAff._livreurs as Record<string, string[]>) || {};
      if (opIds.length > 0) {
        livreursMap[`${date}|${zone}`] = opIds;
      } else {
        delete livreursMap[`${date}|${zone}`];
      }
      currentAff._livreurs = livreursMap;

      // 3) Pour chaque zone du jour, créer/mettre à jour l'extra livraison
      // et affecter les livreurs spécifiquement à cet extra (dans extraOps)
      for (const slot of ["am", "pm"]) {
        const cellKey = `AUT|${jIdx}|${slot}`;
        const raw = currentAff[cellKey];
        const existing = Array.isArray(raw) ? { ops: raw, cmds: [], extras: [] } : raw || { ops: [], cmds: [], extras: [] };
        let extras: string[] = [...(existing.extras || [])];
        const extraOps: Record<string, string[]> = { ...(existing.extraOps || {}) };

        // Pour chaque zone du jour
        for (const [compKey, ids] of Object.entries(livreursMap)) {
          const [dt, zn] = compKey.split("|");
          if (dt !== date) continue;

          // Construire le label comme dans PlanningAffectations (avec les clients du chargement)
          const charg = chargements.find(ch => ch.date === date && ch.zone === zn && ch.transporteur === "nous");
          const clients = charg ? charg.items.map(x => x.c.client || "").filter(Boolean) : [];
          const labelWithClients = `🚚 Livraison ${zn} (${clients.join(", ")})`;

          // Chercher un extra existant pour cette zone (par substring)
          const matchExtra = extras.find(e => e.toLowerCase().includes("livraison") && e.includes(zn));
          const extraLabel = matchExtra || labelWithClients;

          // Créer l'extra si pas présent
          if (!matchExtra) {
            extras.push(extraLabel);
          }

          const opNamesForZone = ids.map(id => EQUIPE.find(m => m.id === id)?.nom).filter(Boolean) as string[];
          if (opNamesForZone.length > 0) {
            extraOps[extraLabel] = opNamesForZone;
          } else {
            delete extraOps[extraLabel];
          }
        }

        currentAff[cellKey] = {
          ...existing,
          extras,
          extraOps,
        };
      }

      // 5) Sauvegarder
      const r2 = await fetch("/api/planning/affectations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semaine: weekMon, affectations: currentAff }),
      });
      if (!r2.ok) {
        const err = await r2.json().catch(() => ({}));
        throw new Error(`PUT affectations ${r2.status}: ${err.error || ""}`);
      }

      setSyncStatus({ msg: `✓ Synchronisé : ${opNames.join(", ") || "(vide)"} → LIVR ${["Lun","Mar","Mer","Jeu","Ven"][jIdx]} (S${getWeekNum(weekMon)})`, ok: true });
      setTimeout(() => setSyncStatus(null), 4000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "erreur inconnue";
      console.error("saveLivreurs:", msg);
      setSyncStatus({ msg: `✕ Erreur synchro : ${msg}`, ok: false });
      setTimeout(() => setSyncStatus(null), 6000);
    }
  };

  const toggleLivreur = (date: string, zone: string, opId: string) => {
    const k = livreursKey(date, zone);
    const cur = livreurs[k] || [];
    let next: string[];
    if (cur.includes(opId)) {
      next = cur.filter(o => o !== opId);
    } else {
      if (cur.length >= 2) return; // max 2 livreurs
      next = [...cur, opId];
    }
    saveLivreurs(date, zone, next);
  };

  // ── Grouper par transporteur ──
  const byTransporteur = useMemo(() => {
    const map = new Map<string, Chargement[]>();
    const allTransp = ["nous", "setec", "express", "poseur", "depot", "_aucun"];
    for (const t of allTransp) map.set(t, []);
    for (const ch of chargements) {
      const arr = map.get(ch.transporteur) || [];
      arr.push(ch);
      map.set(ch.transporteur, arr);
    }
    return allTransp.map(t => ({ id: t, chargements: map.get(t) || [] })).filter(x => x.chargements.length > 0);
  }, [chargements]);

  // ── Stats ──
  const stats = useMemo(() => {
    const totalCharg = chargements.length;
    const totalCmds = chargements.reduce((s, ch) => s + ch.items.length, 0);
    const totalPieces = chargements.reduce((s, ch) => s + ch.items.reduce((ss, x) => ss + (x.c.quantite || 0), 0), 0);
    const sansTransp = chargements.filter(ch => ch.transporteur === "_aucun").length;
    const aPlanifier = chargements.filter(ch => ch.transporteur !== "_aucun" && ch.transporteur !== "depot" && ch.transporteur !== "nous").length;
    return { totalCharg, totalCmds, totalPieces, sansTransp, aPlanifier };
  }, [chargements]);

  const btn = { padding: "5px 10px", background: C.s1, border: `1px solid ${C.border}`, borderRadius: 4, color: C.sec, cursor: "pointer", fontSize: 11 };

  // Trouver la semaine (lundi) d'une date
  function getWeekMondayFor(date: string): string {
    return localStr(getMondayOf(new Date(date + "T12:00:00")));
  }

  // ── Détection des alertes : différences entre figé et actuel ──
  interface Alerte {
    type: "added" | "removed" | "moved" | "changed_transp" | "changed_zone" | "changed_date";
    semaineMonday: string;
    transpId: string;
    message: string;
    cmdIds: string[];
  }

  const alertes: Alerte[] = useMemo(() => {
    const out: Alerte[] = [];
    // Pour chaque semaine figée, comparer avec les chargements actuels
    for (const [weekMon, snap] of Object.entries(frozen)) {
      if (!snap.byTransp) continue;

      for (const [transpId, frozenItems] of Object.entries(snap.byTransp)) {
        // Reconstruire l'état actuel pour ce transporteur × cette semaine
        const weekEnd = addWeeks(weekMon, 1);
        const currentForThis = chargements.filter(ch =>
          ch.transporteur === transpId && ch.date >= weekMon && ch.date < weekEnd
        );

        // Map cmdId → position actuelle
        const currentCmdMap = new Map<string, { date: string; zone: string; transp: string }>();
        for (const ch of currentForThis) {
          for (const x of ch.items) {
            currentCmdMap.set(String(x.c.id), { date: ch.date, zone: ch.zone, transp: ch.transporteur });
          }
        }

        // Commandes actuelles qui étaient chez ce transp dans le figé
        const frozenCmdIds = new Set<string>();
        for (const fi of frozenItems) {
          for (const cid of fi.cmdIds) {
            frozenCmdIds.add(cid);
            const current = currentCmdMap.get(cid);
            if (!current) {
              // La commande a disparu de ce transporteur (changement transp ou supprimée)
              // Vérifier si elle est maintenant chez un autre transp cette semaine
              const nowElsewhere = chargements.find(ch =>
                ch.items.some(x => String(x.c.id) === cid)
              );
              const cmdObj = commandes.find(c => String(c.id) === cid);
              const cmdLabel = cmdObj ? `${(cmdObj as any).client}${(cmdObj as any).ref_chantier ? " — " + (cmdObj as any).ref_chantier : ""}` : cid;
              if (nowElsewhere) {
                if (nowElsewhere.transporteur !== transpId) {
                  out.push({
                    type: "changed_transp",
                    semaineMonday: weekMon,
                    transpId,
                    message: `${cmdLabel} : transporteur changé → ${nowElsewhere.transporteur === "_aucun" ? "aucun" : nowElsewhere.transporteur}`,
                    cmdIds: [cid],
                  });
                } else if (nowElsewhere.date !== fi.date) {
                  out.push({
                    type: "changed_date",
                    semaineMonday: weekMon,
                    transpId,
                    message: `${cmdLabel} : date changée ${fmtDate(fi.date)} → ${fmtDate(nowElsewhere.date)}`,
                    cmdIds: [cid],
                  });
                }
              } else {
                out.push({
                  type: "removed",
                  semaineMonday: weekMon,
                  transpId,
                  message: `${cmdLabel} : retirée du planning`,
                  cmdIds: [cid],
                });
              }
            } else {
              // Commande toujours chez ce transp, vérifier date/zone
              if (current.date !== fi.date) {
                const cmdObj = commandes.find(c => String(c.id) === cid);
                const cmdLabel = cmdObj ? `${(cmdObj as any).client}${(cmdObj as any).ref_chantier ? " — " + (cmdObj as any).ref_chantier : ""}` : cid;
                out.push({
                  type: "changed_date",
                  semaineMonday: weekMon,
                  transpId,
                  message: `${cmdLabel} : date ${fmtDate(fi.date)} → ${fmtDate(current.date)}`,
                  cmdIds: [cid],
                });
              } else if (current.zone !== fi.zone) {
                const cmdObj = commandes.find(c => String(c.id) === cid);
                const cmdLabel = cmdObj ? `${(cmdObj as any).client}${(cmdObj as any).ref_chantier ? " — " + (cmdObj as any).ref_chantier : ""}` : cid;
                out.push({
                  type: "changed_zone",
                  semaineMonday: weekMon,
                  transpId,
                  message: `${cmdLabel} : zone "${fi.zone}" → "${current.zone}"`,
                  cmdIds: [cid],
                });
              }
            }
          }
        }

        // Nouvelles commandes ajoutées chez ce transporteur
        for (const [cid, cur] of Array.from(currentCmdMap.entries())) {
          if (!frozenCmdIds.has(cid)) {
            const cmdObj = commandes.find(c => String(c.id) === cid);
            const cmdLabel = cmdObj ? `${(cmdObj as any).client}${(cmdObj as any).ref_chantier ? " — " + (cmdObj as any).ref_chantier : ""}` : cid;
            out.push({
              type: "added",
              semaineMonday: weekMon,
              transpId,
              message: `${cmdLabel} : nouvelle (${fmtDate(cur.date)}, ${cur.zone})`,
              cmdIds: [cid],
            });
          }
        }
      }
    }
    return out;
  }, [frozen, chargements, commandes]);

  // ── Figer une semaine (prendre un snapshot de l'état actuel) ──
  const figerSemaine = async (weekMon: string) => {
    const weekEnd = addWeeks(weekMon, 1);
    const weekChargements = chargements.filter(ch => ch.date >= weekMon && ch.date < weekEnd);
    const byTransp: Record<string, FrozenItem[]> = {};
    for (const ch of weekChargements) {
      if (!byTransp[ch.transporteur]) byTransp[ch.transporteur] = [];
      byTransp[ch.transporteur].push({
        date: ch.date,
        zone: ch.zone,
        cmdIds: ch.items.map(x => String(x.c.id)),
      });
    }
    const snapshot = { byTransp };
    try {
      await fetch("/api/chargements-frozen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semaine: weekMon, snapshot }),
      });
      setReloadCounter(c => c + 1);
    } catch {}
  };

  // ── Défiger (supprimer le snapshot) ──
  const defigerSemaine = async (weekMon: string) => {
    try {
      await fetch(`/api/chargements-frozen?semaine=${weekMon}`, { method: "DELETE" });
      setReloadCounter(c => c + 1);
    } catch {}
  };

  // ── Confirmer les changements (re-fige avec l'état actuel) ──
  const confirmerSemaine = (weekMon: string) => figerSemaine(weekMon);

  const dateLabel = (d: string) => {
    const dt = new Date(d + "T12:00:00");
    const dow = dt.getDay();
    return `${JOURS_FR[dow === 0 ? 6 : dow - 1]} ${dt.getDate()}/${dt.getMonth() + 1}`;
  };

  return (
    <div>
      <H c={C.orange}>📦 Chargements par transporteur</H>

      {/* Feedback sync livreurs */}
      {syncStatus && (
        <div style={{
          marginBottom: 10, padding: "6px 12px", borderRadius: 6,
          background: syncStatus.ok ? C.green + "22" : C.red + "22",
          border: `1px solid ${syncStatus.ok ? C.green : C.red}`,
          color: syncStatus.ok ? C.green : C.red,
          fontSize: 11, fontWeight: 700,
        }}>
          {syncStatus.msg}
        </div>
      )}

      {/* Navigation + filtres */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <button onClick={() => setMonday(m => addWeeks(m, -1))} style={btn}>‹ Semaine préc.</button>
        <button onClick={() => setMonday(localStr(getMondayOf(new Date())))} style={btn}>Cette sem.</button>
        <button onClick={() => setMonday(m => addWeeks(m, 1))} style={btn}>Semaine suiv. ›</button>
        <span style={{ fontSize: 12, color: C.text, fontWeight: 700, marginLeft: 4 }}>
          À partir de S{getWeekNum(monday)} ({fmtDate(monday)})
        </span>

        <div style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: C.sec }}>Horizon :</span>
          {[2, 4, 8].map(w => (
            <button key={w} onClick={() => setHorizonWeeks(w)}
              style={{ ...btn, background: horizonWeeks === w ? C.orange + "22" : C.s1, border: `1px solid ${horizonWeeks === w ? C.orange : C.border}`, color: horizonWeeks === w ? C.orange : C.sec, fontWeight: horizonWeeks === w ? 700 : 400 }}>
              {w} sem.
            </button>
          ))}
          <select value={filterZone} onChange={e => setFilterZone(e.target.value)} style={{ ...btn, color: filterZone ? C.teal : C.sec }}>
            <option value="">Toutes zones</option>
            {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
            <option value="_aucune">— Non définie —</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6, marginBottom: 14 }}>
        {[
          { label: "Chargements", value: stats.totalCharg, color: C.orange },
          { label: "Commandes", value: stats.totalCmds, color: C.blue },
          { label: "Pièces", value: stats.totalPieces, color: C.teal },
          { label: "À planifier", value: stats.aPlanifier, color: C.yellow },
          { label: "Sans transp.", value: stats.sansTransp, color: stats.sansTransp > 0 ? C.red : C.muted },
        ].map(s => (
          <div key={s.label} style={{ padding: "8px 12px", background: C.s1, borderRadius: 6, border: `1px solid ${C.border}`, borderLeft: `3px solid ${s.color}` }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color, fontFamily: "monospace" }}>{s.value}</div>
            <div style={{ fontSize: 9, color: C.muted }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Zone d'alertes : changements depuis le gel ── */}
      {alertes.length > 0 && (
        <div style={{ marginBottom: 14, padding: "12px 16px", background: C.red + "15", border: `2px solid ${C.red}66`, borderRadius: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.red }}>
              ⚠ {alertes.length} changement{alertes.length > 1 ? "s" : ""} depuis le dernier gel
            </div>
          </div>
          {(() => {
            // Grouper par (semaineMonday, transpId)
            const byKey = new Map<string, Alerte[]>();
            for (const a of alertes) {
              const k = `${a.semaineMonday}|${a.transpId}`;
              if (!byKey.has(k)) byKey.set(k, []);
              byKey.get(k)!.push(a);
            }
            return Array.from(byKey.entries()).map(([k, alrts]) => {
              const [semMon, trId] = k.split("|");
              const tr = TRANSPORTEURS.find(t => t.id === trId);
              const trLabel = tr?.label || (trId === "_aucun" ? "Non défini" : trId);
              const trCol = tr?.c || C.muted;
              return (
                <div key={k} style={{ marginBottom: 10, padding: "8px 12px", background: C.s1, borderRadius: 6, border: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>
                      <span style={{ color: trCol }}>🚚 {trLabel}</span>
                      <span style={{ color: C.sec, marginLeft: 8 }}>· S{getWeekNum(semMon)} ({fmtDate(semMon)})</span>
                    </div>
                    <button onClick={() => {
                      if (!confirm(`Confirmer les ${alrts.length} changement(s) pour ${trLabel} S${getWeekNum(semMon)} ? Cela regèle la semaine avec l'état actuel.`)) return;
                      confirmerSemaine(semMon);
                    }} style={{
                      padding: "5px 14px", background: C.green, border: "none", borderRadius: 4,
                      color: "#000", fontSize: 11, fontWeight: 700, cursor: "pointer",
                    }}>
                      ✓ Confirmé avec transporteur
                    </button>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 20, listStyle: "disc" }}>
                    {alrts.map((a, i) => (
                      <li key={i} style={{ fontSize: 11, color: C.text, marginBottom: 2 }}>
                        <span style={{
                          padding: "1px 6px", borderRadius: 3, fontSize: 9, fontWeight: 700, marginRight: 6,
                          background: a.type === "added" ? C.green + "22" : a.type === "removed" ? C.red + "22" : C.orange + "22",
                          color: a.type === "added" ? C.green : a.type === "removed" ? C.red : C.orange,
                        }}>
                          {a.type === "added" ? "AJOUT" : a.type === "removed" ? "RETRAIT" : a.type === "changed_transp" ? "TRANSP." : a.type === "changed_date" ? "DATE" : "ZONE"}
                        </span>
                        {a.message}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            });
          })()}
        </div>
      )}

      {/* Liste par transporteur */}
      {byTransporteur.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: C.muted, fontSize: 12 }}>
          Aucun chargement sur les {horizonWeeks} prochaines semaines
        </div>
      )}

      {byTransporteur.map(grp => {
        const transp = TRANSPORTEURS.find(t => t.id === grp.id);
        const transpCol = transp?.c || C.muted;
        const transpLabel = transp?.label || "❗ Transporteur non défini";
        const totalCmds = grp.chargements.reduce((s, ch) => s + ch.items.length, 0);
        const totalPieces = grp.chargements.reduce((s, ch) => s + ch.items.reduce((ss, x) => ss + (x.c.quantite || 0), 0), 0);

        return (
          <div key={grp.id} style={{ marginBottom: 16, borderRadius: 8, overflow: "hidden", border: `1px solid ${transpCol}44` }}>
            {/* Entête transporteur */}
            <div style={{ padding: "10px 14px", background: transpCol + "22", borderBottom: `1px solid ${transpCol}66`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 800, color: transpCol }}>🚚 {transpLabel}</span>
                <span style={{ fontSize: 10, color: C.sec, marginLeft: 12 }}>
                  {grp.chargements.length} date{grp.chargements.length > 1 ? "s" : ""} à fixer · {totalCmds} cmd · {totalPieces} pièces
                </span>
              </div>
            </div>

            {/* Liste des chargements/dates */}
            <div style={{ background: C.s1 }}>
              {grp.chargements.map((ch, ci) => {
                const zoneCol = getZoneColor(ch.zone, C.muted);
                const totalPcs = ch.items.reduce((s, x) => s + (x.c.quantite || 0), 0);
                const hasRetard = ch.items.some(x => x.cc?.enRetard);
                const sansZone = ch.zone === "_aucune";

                const weekMon = getWeekMondayFor(ch.date);
                const isFrozen = !!frozen[weekMon];
                return (
                  <div key={ci} style={{
                    padding: "10px 14px",
                    borderBottom: ci < grp.chargements.length - 1 ? `1px solid ${C.border}` : "none",
                    borderLeft: `4px solid ${zoneCol}`,
                    background: isFrozen ? C.blue + "08" : "transparent",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                          {dateLabel(ch.date)}
                        </span>
                        <span style={{ fontSize: 10, color: C.sec, fontFamily: "monospace" }}>
                          S{getWeekNum(ch.date)}
                        </span>
                        {isFrozen && (
                          <span style={{
                            padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 700,
                            background: C.blue + "22", color: C.blue, border: `1px solid ${C.blue}66`,
                          }}>
                            🔒 Figé
                          </span>
                        )}
                        <span style={{
                          padding: "2px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                          background: zoneCol + "22", color: zoneCol, border: `1px solid ${zoneCol}66`,
                        }}>
                          {sansZone ? "⚠ Zone ?" : ch.zone}
                        </span>
                        <span style={{ fontSize: 10, color: C.sec }}>
                          · {ch.items.length} cmd · {totalPcs} pièces
                        </span>
                        {hasRetard && (
                          <span style={{ fontSize: 10, color: C.red, fontWeight: 700 }}>⚠ retard</span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        {isFrozen ? (
                          <button
                            onClick={() => {
                              if (!confirm(`Défiger la semaine S${getWeekNum(weekMon)} ? Les alertes de changements seront effacées.`)) return;
                              defigerSemaine(weekMon);
                            }}
                            style={{ padding: "4px 10px", background: C.blue + "22", border: `1px solid ${C.blue}`, borderRadius: 4, color: C.blue, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                            🔓 Défiger S{getWeekNum(weekMon)}
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              if (!confirm(`Figer la semaine S${getWeekNum(weekMon)} avec tous ses chargements actuels ? Tout changement futur déclenchera une alerte.`)) return;
                              figerSemaine(weekMon);
                            }}
                            style={{ padding: "4px 10px", background: C.orange + "22", border: `1px solid ${C.orange}`, borderRadius: 4, color: C.orange, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                            🔒 Figer S{getWeekNum(weekMon)}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            const newDate = prompt(`Nouvelle date de livraison (YYYY-MM-DD) pour ce chargement :`, ch.date);
                            if (!newDate || newDate === ch.date) return;
                            for (const x of ch.items) {
                              onPatch(String(x.c.id), { date_livraison_souhaitee: newDate });
                            }
                          }}
                          style={{ padding: "4px 10px", background: C.blue + "22", border: `1px solid ${C.blue}`, borderRadius: 4, color: C.blue, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                          Décaler
                        </button>
                        <button
                          onClick={() => {
                            if (!confirm(`Marquer les ${ch.items.length} commande(s) comme livrées ?`)) return;
                            for (const x of ch.items) {
                              onPatch(String(x.c.id), { statut: "livre" });
                            }
                          }}
                          style={{ padding: "4px 10px", background: C.green, border: "none", borderRadius: 4, color: "#000", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                          ✓ Tout livré
                        </button>
                      </div>
                    </div>

                    {/* Poseur (seulement si transporteur = poseur) */}
                    {ch.transporteur === "poseur" && (() => {
                      const k = poseurKey(ch.date, ch.zone);
                      const current = poseurs[k] || "";
                      return (
                        <div style={{ marginBottom: 8, padding: "6px 10px", background: C.bg, borderRadius: 4, border: `1px solid ${C.purple}44` }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: C.purple, letterSpacing: "0.05em" }}>
                              👤 POSEUR :
                            </span>
                            <input
                              defaultValue={current}
                              placeholder="Nom du poseur..."
                              onBlur={e => {
                                const v = e.target.value.trim();
                                if (v !== current) savePoseur(ch.date, ch.zone, v);
                              }}
                              onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                              style={{
                                flex: 1, minWidth: 200, padding: "4px 10px", fontSize: 12,
                                background: C.s2, border: `1px solid ${current ? C.purple : C.border}`,
                                borderRadius: 4, color: current ? C.purple : C.text,
                                fontWeight: current ? 700 : 400, outline: "none",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })()}

                    {/* Livreurs (seulement si transporteur = nous) */}
                    {ch.transporteur === "nous" && (() => {
                      const k = livreursKey(ch.date, ch.zone);
                      const assigned = livreurs[k] || [];
                      return (
                        <div style={{ marginBottom: 8, padding: "6px 10px", background: C.bg, borderRadius: 4, border: `1px solid ${C.blue}33` }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: C.blue, letterSpacing: "0.05em", marginRight: 4 }}>
                              👷 LIVREURS ({assigned.length}/2) :
                            </span>
                            {assigned.length === 0 && (
                              <span style={{ fontSize: 10, color: C.muted, fontStyle: "italic" }}>
                                Aucun assigné — cliquez sur un opérateur ci-dessous
                              </span>
                            )}
                            {assigned.map(opId => {
                              const op = EQUIPE.find(m => m.id === opId);
                              if (!op) return null;
                              return (
                                <span key={opId}
                                  onClick={() => toggleLivreur(ch.date, ch.zone, opId)}
                                  title="Cliquer pour retirer"
                                  style={{
                                    padding: "3px 10px", fontSize: 11, fontWeight: 700, borderRadius: 3,
                                    background: C.blue + "33", border: `1px solid ${C.blue}`,
                                    color: C.blue, cursor: "pointer",
                                  }}>
                                  {op.nom} ✕
                                </span>
                              );
                            })}
                          </div>
                          <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {EQUIPE.filter(m => !assigned.includes(m.id)).map(op => (
                              <button key={op.id}
                                onClick={() => toggleLivreur(ch.date, ch.zone, op.id)}
                                disabled={assigned.length >= 2}
                                style={{
                                  padding: "2px 8px", fontSize: 9, fontWeight: 600, borderRadius: 3,
                                  background: "transparent", border: `1px solid ${C.border}`,
                                  color: assigned.length >= 2 ? C.muted : C.sec,
                                  cursor: assigned.length >= 2 ? "not-allowed" : "pointer",
                                  opacity: assigned.length >= 2 ? 0.4 : 1,
                                }}>
                                + {op.nom}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Liste des commandes du chargement */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 6 }}>
                      {ch.items.map((x, ii) => {
                        const tm = TYPES_MENUISERIE[x.c.type];
                        return (
                          <div key={ii}
                            onClick={() => onEdit?.(x.c)}
                            style={{ padding: "6px 10px", background: C.bg, borderRadius: 4, cursor: "pointer", border: `1px solid ${C.border}` }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{x.c.client}</span>
                              {x.cc?.enRetard && (
                                <span style={{ fontSize: 9, color: C.red, fontWeight: 700 }}>+{x.cc.retardJours}j</span>
                              )}
                            </div>
                            {(x.cmd as any).ref_chantier && (
                              <div style={{ fontSize: 10, color: C.teal, marginTop: 1 }}>{(x.cmd as any).ref_chantier}</div>
                            )}
                            <div style={{ fontSize: 9, color: C.sec, marginTop: 2, display: "flex", gap: 6, alignItems: "center" }}>
                              {tm && <Bdg t={tm.label} c={tm.famille === "hors_standard" ? C.purple : CFAM[tm.famille] || C.blue} sz={9} />}
                              <span>×{x.c.quantite}</span>
                              {(x.cmd as any).num_commande && <span style={{ fontFamily: "monospace", color: C.muted }}>{(x.cmd as any).num_commande}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
