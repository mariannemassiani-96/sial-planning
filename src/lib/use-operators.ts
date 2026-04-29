// ═══════════════════════════════════════════════════════════════════════
// Hook unique pour charger la liste des opérateurs depuis la base de
// données. Source de vérité : /api/operators (modèle Operator + skills).
//
// Fallback : la constante EQUIPE de sial-data.ts est utilisée si le
// fetch échoue (offline, erreur réseau, données pas encore seedées).
// EQUIPE est destinée à disparaître à mesure que la BDD est alimentée.
// ═══════════════════════════════════════════════════════════════════════

"use client";
import { useEffect, useState } from "react";
import { EQUIPE } from "@/lib/sial-data";

export interface OperatorFromDB {
  id: string;
  name: string;
  weekHours: number;
  posts: string[];
  workingDays: number[];
  active: boolean;
  notes?: string | null;
  vendrediOff: boolean;
  competences: string[]; // phases déduites des skills
  /** Horaires détaillés par jour ({Mon: [...], Tue: [...]}) — voir lib/operator-schedule.ts */
  defaultSchedule?: Record<string, Array<{ from: string; to: string }>> | null;
  /** Date de naissance (ISO YYYY-MM-DD). */
  naissance?: string | null;
  skills: Array<{
    id: string;
    workPostId: string | null;
    menuiserieType: string | null;
    level: number;
    workPost?: { id: string; label: string; atelier: string } | null;
  }>;
}

/**
 * Renvoie la liste des opérateurs actifs.
 * Si la BDD n'a pas encore été alimentée, fallback sur EQUIPE
 * (forme adaptée pour rester compatible avec les composants existants).
 */
export function useOperators(): { operators: OperatorFromDB[]; loaded: boolean } {
  const [operators, setOperators] = useState<OperatorFromDB[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/operators")
      .then(r => r.ok ? r.json() : null)
      .then((data: unknown) => {
        if (Array.isArray(data) && data.length > 0) {
          setOperators(data as OperatorFromDB[]);
        } else {
          setOperators(equipeAsOperators());
        }
        setLoaded(true);
      })
      .catch(() => {
        setOperators(equipeAsOperators());
        setLoaded(true);
      });
  }, []);

  return { operators, loaded };
}

function equipeAsOperators(): OperatorFromDB[] {
  return EQUIPE.map(op => ({
    id: op.id,
    name: op.nom,
    weekHours: op.h,
    posts: [],
    workingDays: op.vendrediOff ? [0, 1, 2, 3] : [0, 1, 2, 3, 4],
    active: true,
    notes: (op as any).note ?? null,
    vendrediOff: !!op.vendrediOff,
    competences: op.competences || [],
    defaultSchedule: null,
    naissance: null,
    skills: [],
  }));
}
