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

  try {

  type NcRow = {
    menuiserietype: string;
    severity: string;
    status: string;
    workpostid: string | null;
    nb: bigint;
  };

  // Join NC → FabItem pour menuiserieType, et via task pour workPostId
  const rows: NcRow[] = since
    ? await prisma.$queryRaw<NcRow[]>`
        SELECT
          fi."menuiserieType"  AS menuiserietype,
          nc.severity,
          nc.status,
          pt."workPostId"      AS workpostid,
          COUNT(*)             AS nb
        FROM "NonConformity" nc
        JOIN "FabItem" fi ON nc."fabItemId" = fi.id
        LEFT JOIN "ProductionTask" pt ON nc."qcRef" = ANY(
          SELECT qc."qcRef" FROM "QCCheck" qc WHERE qc."taskId" = pt.id AND qc."fabItemId" = fi.id
        )
        WHERE nc."createdAt" >= ${since}
        GROUP BY fi."menuiserieType", nc.severity, nc.status, pt."workPostId"
        ORDER BY nb DESC
      `
    : await prisma.$queryRaw<NcRow[]>`
        SELECT
          fi."menuiserieType"  AS menuiserietype,
          nc.severity,
          nc.status,
          pt."workPostId"      AS workpostid,
          COUNT(*)             AS nb
        FROM "NonConformity" nc
        JOIN "FabItem" fi ON nc."fabItemId" = fi.id
        LEFT JOIN "ProductionTask" pt ON nc."qcRef" = ANY(
          SELECT qc."qcRef" FROM "QCCheck" qc WHERE qc."taskId" = pt.id AND qc."fabItemId" = fi.id
        )
        GROUP BY fi."menuiserieType", nc.severity, nc.status, pt."workPostId"
        ORDER BY nb DESC
      `;

  // Totaux globaux
  type TotalRow = { severity: string; status: string; nb: bigint };
  const totaux: TotalRow[] = since
    ? await prisma.$queryRaw<TotalRow[]>`
        SELECT severity, status, COUNT(*) AS nb
        FROM "NonConformity"
        WHERE "createdAt" >= ${since}
        GROUP BY severity, status
      `
    : await prisma.$queryRaw<TotalRow[]>`
        SELECT severity, status, COUNT(*) AS nb
        FROM "NonConformity"
        GROUP BY severity, status
      `;

  const nc = rows.map((r) => ({
    menuiserieType: r.menuiserietype,
    severity:       r.severity,
    status:         r.status,
    workPostId:     r.workpostid,
    nb:             Number(r.nb),
  }));

  const totauxMapped = totaux.map((r) => ({
    severity: r.severity,
    status:   r.status,
    nb:       Number(r.nb),
  }));

  return NextResponse.json({ period, nc, totaux: totauxMapped });
  } catch {
    return NextResponse.json({ period, nc: [], totaux: [] });
  }
}
