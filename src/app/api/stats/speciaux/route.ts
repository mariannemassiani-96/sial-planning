import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

function periodFilter(period: string): Date | null {
  if (period === "7")  { const d = new Date(); d.setDate(d.getDate() - 7);  return d; }
  if (period === "30") { const d = new Date(); d.setDate(d.getDate() - 30); return d; }
  return null;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if ((session.user as { role?: string }).role !== "ADMIN")
    return NextResponse.json({ error: "Accès réservé à l'administrateur" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") ?? "30";
  const since  = periodFilter(period);

  // Agrégats par fabItem spécial : temps estimé total vs réel total
  type SpecialRow = {
    fabitemid: string;
    label: string;
    specialtype: string | null;
    refchantier: string;
    clientname: string;
    est_total: number | null;
    actual_total: number | null;
    nb_taches: bigint;
    nb_done: bigint;
    nb_blocked: bigint;
  };

  const rows: SpecialRow[] = since
    ? await prisma.$queryRaw<SpecialRow[]>`
        SELECT
          fi.id                           AS fabitemid,
          fi.label,
          fi."specialType"                AS specialtype,
          o."refChantier"                 AS refchantier,
          o."clientName"                  AS clientname,
          SUM(pt."estimatedMinutes")      AS est_total,
          SUM(pt."actualMinutes")         AS actual_total,
          COUNT(pt.id)                    AS nb_taches,
          COUNT(pt.id) FILTER (WHERE pt.status = 'DONE')    AS nb_done,
          COUNT(pt.id) FILTER (WHERE pt.status = 'BLOCKED') AS nb_blocked
        FROM "FabItem" fi
        JOIN "Order" o ON fi."orderId" = o.id
        LEFT JOIN "ProductionTask" pt ON pt."fabItemId" = fi.id
        WHERE fi."isSpecial" = true
          AND o."updatedAt" >= ${since}
        GROUP BY fi.id, fi.label, fi."specialType", o."refChantier", o."clientName"
        ORDER BY est_total DESC NULLS LAST
      `
    : await prisma.$queryRaw<SpecialRow[]>`
        SELECT
          fi.id                           AS fabitemid,
          fi.label,
          fi."specialType"                AS specialtype,
          o."refChantier"                 AS refchantier,
          o."clientName"                  AS clientname,
          SUM(pt."estimatedMinutes")      AS est_total,
          SUM(pt."actualMinutes")         AS actual_total,
          COUNT(pt.id)                    AS nb_taches,
          COUNT(pt.id) FILTER (WHERE pt.status = 'DONE')    AS nb_done,
          COUNT(pt.id) FILTER (WHERE pt.status = 'BLOCKED') AS nb_blocked
        FROM "FabItem" fi
        JOIN "Order" o ON fi."orderId" = o.id
        LEFT JOIN "ProductionTask" pt ON pt."fabItemId" = fi.id
        WHERE fi."isSpecial" = true
        GROUP BY fi.id, fi.label, fi."specialType", o."refChantier", o."clientName"
        ORDER BY est_total DESC NULLS LAST
      `;

  // Résumé global : total estimé vs réel sur tous les spéciaux terminés
  type SummaryRow = {
    est_total: number | null;
    actual_total: number | null;
    nb_speciaux: bigint;
    nb_done_complete: bigint; // spéciaux dont toutes les tâches sont DONE
  };

  const summary: SummaryRow[] = since
    ? await prisma.$queryRaw<SummaryRow[]>`
        SELECT
          SUM(sub.est_total)      AS est_total,
          SUM(sub.actual_total)   AS actual_total,
          COUNT(*)                AS nb_speciaux,
          COUNT(*) FILTER (WHERE sub.nb_taches > 0 AND sub.nb_done = sub.nb_taches) AS nb_done_complete
        FROM (
          SELECT
            fi.id,
            SUM(pt."estimatedMinutes") AS est_total,
            SUM(pt."actualMinutes")    AS actual_total,
            COUNT(pt.id)               AS nb_taches,
            COUNT(pt.id) FILTER (WHERE pt.status = 'DONE') AS nb_done
          FROM "FabItem" fi
          JOIN "Order" o ON fi."orderId" = o.id
          LEFT JOIN "ProductionTask" pt ON pt."fabItemId" = fi.id
          WHERE fi."isSpecial" = true
            AND o."updatedAt" >= ${since}
          GROUP BY fi.id
        ) sub
      `
    : await prisma.$queryRaw<SummaryRow[]>`
        SELECT
          SUM(sub.est_total)      AS est_total,
          SUM(sub.actual_total)   AS actual_total,
          COUNT(*)                AS nb_speciaux,
          COUNT(*) FILTER (WHERE sub.nb_taches > 0 AND sub.nb_done = sub.nb_taches) AS nb_done_complete
        FROM (
          SELECT
            fi.id,
            SUM(pt."estimatedMinutes") AS est_total,
            SUM(pt."actualMinutes")    AS actual_total,
            COUNT(pt.id)               AS nb_taches,
            COUNT(pt.id) FILTER (WHERE pt.status = 'DONE') AS nb_done
          FROM "FabItem" fi
          LEFT JOIN "ProductionTask" pt ON pt."fabItemId" = fi.id
          WHERE fi."isSpecial" = true
          GROUP BY fi.id
        ) sub
      `;

  const speciaux = rows.map((r) => ({
    fabItemId:   r.fabitemid,
    label:       r.label,
    specialType: r.specialtype,
    refChantier: r.refchantier,
    clientName:  r.clientname,
    estTotal:    r.est_total != null ? Math.round(r.est_total) : null,
    actualTotal: r.actual_total != null ? Math.round(r.actual_total) : null,
    ecartMin:    r.est_total != null && r.actual_total != null
                   ? Math.round(r.actual_total - r.est_total)
                   : null,
    nbTaches:    Number(r.nb_taches),
    nbDone:      Number(r.nb_done),
    nbBlocked:   Number(r.nb_blocked),
  }));

  const s = summary[0];
  const globalSummary = s
    ? {
        estTotal:       s.est_total != null ? Math.round(s.est_total) : 0,
        actualTotal:    s.actual_total != null ? Math.round(s.actual_total) : 0,
        nbSpeciaux:     Number(s.nb_speciaux),
        nbDoneComplete: Number(s.nb_done_complete),
      }
    : { estTotal: 0, actualTotal: 0, nbSpeciaux: 0, nbDoneComplete: 0 };

  return NextResponse.json({ period, speciaux, summary: globalSummary });
}
