import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { backwardSchedule, backwardScheduleAll } from "@/lib/scheduling-backward";

/**
 * Phase 0-B : POST /api/scheduling/backward
 *
 * Body : { orderId: string } | { all: true }
 * Retourne : { results: ScheduleReport[] }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { orderId?: string; all?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  try {
    if (body.all) {
      const results = await backwardScheduleAll();
      return NextResponse.json({ results });
    }
    if (!body.orderId) {
      return NextResponse.json({ error: "orderId manquant" }, { status: 400 });
    }
    const result = await backwardSchedule(body.orderId);
    return NextResponse.json({ results: [result] });
  } catch (e) {
    console.error("[/api/scheduling/backward]", e);
    return NextResponse.json(
      { error: "Erreur de planification", details: String(e) },
      { status: 500 },
    );
  }
}
