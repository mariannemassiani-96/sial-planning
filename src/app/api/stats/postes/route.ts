import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

function periodFilter(period: string): Date | null {
  if (period === "7")  { const d = new Date(); d.setDate(d.getDate() - 7);  return d; }
  if (period === "30") { const d = new Date(); d.setDate(d.getDate() - 30); return d; }
  return null; // "all"
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if ((session.user as { role?: string }).role !== "ADMIN")
    return NextResponse.json({ error: "Accès réservé à l'administrateur" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") ?? "30";
  const since  = periodFilter(period);

  // Requête brute pour les agrégats (Prisma ORM ne supporte pas FILTER WHERE)
  type PosteRow = {
    workpostid: string;
    nb_taches: bigint;
    ecart_moyen_min: number | null;
    nb_depassements: bigint;
    nb_blocages: bigint;
  };

  const rows: PosteRow[] = since
    ? await prisma.$queryRaw<PosteRow[]>`
        SELECT
          "workPostId"                                                    AS workpostid,
          COUNT(*)                                                        AS nb_taches,
          AVG("actualMinutes" - "estimatedMinutes")                      AS ecart_moyen_min,
          COUNT(*) FILTER (WHERE "actualMinutes" > "estimatedMinutes" * 1.2)
                                                                         AS nb_depassements,
          COUNT(*) FILTER (WHERE status = 'BLOCKED')                     AS nb_blocages
        FROM "ProductionTask"
        WHERE (status = 'DONE' OR status = 'BLOCKED')
          AND "completedAt" >= ${since}
        GROUP BY "workPostId"
        ORDER BY ecart_moyen_min DESC NULLS LAST
      `
    : await prisma.$queryRaw<PosteRow[]>`
        SELECT
          "workPostId"                                                    AS workpostid,
          COUNT(*)                                                        AS nb_taches,
          AVG("actualMinutes" - "estimatedMinutes")                      AS ecart_moyen_min,
          COUNT(*) FILTER (WHERE "actualMinutes" > "estimatedMinutes" * 1.2)
                                                                         AS nb_depassements,
          COUNT(*) FILTER (WHERE status = 'BLOCKED')                     AS nb_blocages
        FROM "ProductionTask"
        WHERE (status = 'DONE' OR status = 'BLOCKED')
        GROUP BY "workPostId"
        ORDER BY ecart_moyen_min DESC NULLS LAST
      `;

  const postes = rows.map((r) => ({
    workPostId:    r.workpostid,
    nbTaches:      Number(r.nb_taches),
    ecartMoyenMin: r.ecart_moyen_min != null ? Math.round(r.ecart_moyen_min * 10) / 10 : null,
    nbDepassements:Number(r.nb_depassements),
    nbBlocages:    Number(r.nb_blocages),
  }));

  // Détail des 10 dernières tâches par poste (pour le drill-down côté client)
  type DetailRow = {
    id: string;
    workpostid: string;
    label: string;
    estimatedminutes: number;
    actualminutes: number | null;
    status: string;
    completedat: string | null;
    refchantier: string;
    clientname: string;
  };

  const detailRows: DetailRow[] = since
    ? await prisma.$queryRaw<DetailRow[]>`
        SELECT
          pt.id,
          pt."workPostId"       AS workpostid,
          pt.label,
          pt."estimatedMinutes" AS estimatedminutes,
          pt."actualMinutes"    AS actualminutes,
          pt.status,
          pt."completedAt"      AS completedat,
          o."refChantier"       AS refchantier,
          o."clientName"        AS clientname
        FROM "ProductionTask" pt
        JOIN "FabItem" fi ON pt."fabItemId" = fi.id
        JOIN "Order"   o  ON fi."orderId"   = o.id
        WHERE (pt.status = 'DONE' OR pt.status = 'BLOCKED')
          AND pt."completedAt" >= ${since}
        ORDER BY pt."completedAt" DESC NULLS LAST
      `
    : await prisma.$queryRaw<DetailRow[]>`
        SELECT
          pt.id,
          pt."workPostId"       AS workpostid,
          pt.label,
          pt."estimatedMinutes" AS estimatedminutes,
          pt."actualMinutes"    AS actualminutes,
          pt.status,
          pt."completedAt"      AS completedat,
          o."refChantier"       AS refchantier,
          o."clientName"        AS clientname
        FROM "ProductionTask" pt
        JOIN "FabItem" fi ON pt."fabItemId" = fi.id
        JOIN "Order"   o  ON fi."orderId"   = o.id
        WHERE (pt.status = 'DONE' OR pt.status = 'BLOCKED')
        ORDER BY pt."completedAt" DESC NULLS LAST
      `;

  // Grouper les 10 dernières par poste
  const detailByPost: Record<string, typeof detailRows> = {};
  for (const row of detailRows) {
    if (!detailByPost[row.workpostid]) detailByPost[row.workpostid] = [];
    if (detailByPost[row.workpostid].length < 10) {
      detailByPost[row.workpostid].push(row);
    }
  }

  return NextResponse.json({ period, postes, detailByPost });
}
