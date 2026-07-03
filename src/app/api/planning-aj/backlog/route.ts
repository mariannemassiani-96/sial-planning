import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * GET  /api/planning-aj/backlog          → liste (ordre ASC)
 * POST /api/planning-aj/backlog          → créer un item { etape, chantier, qte?, note? }
 */

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const items = await prisma.planningBacklog.findMany({
      orderBy: [{ ordre: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(items);
  } catch (e) {
    console.error("[/api/planning-aj/backlog GET]", e);
    return NextResponse.json({ error: "Erreur BDD", details: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  let body: { etape?: string; chantier?: string; qte?: number | string | null; note?: string; ordre?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (!body.etape || !body.chantier) {
    return NextResponse.json({ error: "etape + chantier requis" }, { status: 400 });
  }
  try {
    // Nouvel ordre = max(ordre) + 1
    const last = await prisma.planningBacklog.aggregate({ _max: { ordre: true } });
    const ordre = body.ordre ?? ((last._max.ordre ?? -1) + 1);
    let qte: number | null = null;
    if (body.qte !== undefined && body.qte !== null && body.qte !== "") {
      const n = typeof body.qte === "number" ? body.qte : parseInt(String(body.qte));
      qte = Number.isFinite(n) ? n : null;
    }
    const item = await prisma.planningBacklog.create({
      data: {
        etape: String(body.etape),
        chantier: String(body.chantier),
        qte,
        note: body.note || null,
        ordre,
      },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (e) {
    console.error("[/api/planning-aj/backlog POST]", e);
    return NextResponse.json({ error: "Erreur BDD", details: String(e) }, { status: 500 });
  }
}
