import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { BUFFER_THRESHOLDS } from "@/lib/planning-constants";

export async function GET(_request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if ((session.user as { role?: string }).role !== "ADMIN")
    return NextResponse.json({ error: "Accès réservé à l'administrateur" }, { status: 403 });

  // Calcul des 8 dernières semaines (lundi → dimanche)
  function getMonday(d: Date): Date {
    const dt = new Date(d);
    const day = dt.getDay(); // 0=dim
    const diff = day === 0 ? -6 : 1 - day;
    dt.setDate(dt.getDate() + diff);
    dt.setHours(0, 0, 0, 0);
    return dt;
  }

  const monday = getMonday(new Date());
  const weeks: { label: string; start: Date; end: Date }[] = [];
  for (let i = 7; i >= 0; i--) {
    const start = new Date(monday);
    start.setDate(monday.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    const label = `S${getISOWeek(start)}`;
    weeks.push({ label, start, end });
  }

  function getISOWeek(d: Date): number {
    const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = dt.getUTCDay() || 7;
    dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
    return Math.ceil((((dt.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  // Pour chaque semaine : nombre de tâches en ATTENTE_VITRAGE + durée d'attente moyenne
  // Une tâche est "en attente vitrage" si son status = BLOCKED et blockedReason contient "vitrage"
  // OU si l'order a un status ATTENTE_VITRAGE et completedAt tombe dans la semaine

  type WeekRow = {
    week_label: string;
    nb_attente: bigint;
    duree_moyenne_h: number | null;
  };

  // On calcule semaine par semaine via une seule requête group-by ISO week
  const fluxRows: WeekRow[] = await prisma.$queryRaw<WeekRow[]>`
    SELECT
      to_char(pt."completedAt", 'IYYY-IW') AS week_label,
      COUNT(*)                             AS nb_attente,
      AVG(
        EXTRACT(EPOCH FROM (
          COALESCE(pt2."startedAt", NOW()) - pt."completedAt"
        )) / 3600.0
      )                                    AS duree_moyenne_h
    FROM "ProductionTask" pt
    -- pt = tâche SIAL terminée qui envoie en ISULA (workPostId in I1..I8 de la tâche suivante)
    JOIN "ProductionTask" pt2 ON pt2."fabItemId" = pt."fabItemId"
      AND pt2."sortOrder" = (
        SELECT MIN(p3."sortOrder") FROM "ProductionTask" p3
        WHERE p3."fabItemId" = pt."fabItemId"
          AND p3."sortOrder" > pt."sortOrder"
      )
    WHERE pt."completedAt" >= NOW() - INTERVAL '8 weeks'
      AND pt2."workPostId" LIKE 'I%'
      AND pt.status = 'DONE'
    GROUP BY to_char(pt."completedAt", 'IYYY-IW')
    ORDER BY week_label ASC
  `;

  // Construire le tableau sur les 8 semaines (remplir 0 pour les semaines sans données)
  const fluxByWeek = new Map(fluxRows.map((r) => [r.week_label, r]));

  const fluxChart = weeks.map((w) => {
    const isoKey = `${w.start.getFullYear()}-${String(getISOWeek(w.start)).padStart(2, "0")}`;
    const row = fluxByWeek.get(isoKey);
    return {
      label:         w.label,
      isoKey,
      nbAttente:     row ? Number(row.nb_attente) : 0,
      dureeMovH:     row?.duree_moyenne_h != null ? Math.round(row.duree_moyenne_h * 10) / 10 : null,
    };
  });

  // Stocks tampons actuels avec seuils
  const bufferStocks = await prisma.bufferStock.findMany({
    orderBy: { type: "asc" },
  });

  const stocks = bufferStocks.map((bs) => {
    const thresholds = BUFFER_THRESHOLDS[bs.type as keyof typeof BUFFER_THRESHOLDS];
    return {
      type:     bs.type,
      label:    thresholds?.label ?? bs.type,
      quantity: bs.quantity,
      unit:     bs.unit,
      min:      thresholds?.min ?? null,
      cible:    thresholds?.cible ?? null,
      max:      thresholds?.max ?? null,
      alert:    thresholds ? bs.quantity < thresholds.min : false,
    };
  });

  // Stat globale attente vitrage : tâches actuellement en attente (BLOCKED + "vitrage")
  const enAttente = await prisma.productionTask.count({
    where: {
      status:        "BLOCKED",
      blockedReason: { contains: "vitrage", mode: "insensitive" },
    },
  });

  return NextResponse.json({ fluxChart, stocks, enAttente });
}
