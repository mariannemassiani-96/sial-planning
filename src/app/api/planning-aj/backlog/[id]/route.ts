import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * PATCH  /api/planning-aj/backlog/[id]   → modifie qte, note, ordre, etape, chantier
 * DELETE /api/planning-aj/backlog/[id]   → supprime définitivement (utilisé quand la tâche est droppée dans la grille)
 */

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  const update: Record<string, unknown> = {};
  if (body.etape !== undefined) update.etape = String(body.etape);
  if (body.chantier !== undefined) update.chantier = String(body.chantier);
  if (body.qte !== undefined) {
    if (body.qte === null || body.qte === "") update.qte = null;
    else {
      const n = typeof body.qte === "number" ? body.qte : parseInt(String(body.qte));
      update.qte = Number.isFinite(n) ? n : null;
    }
  }
  if (body.note !== undefined) update.note = body.note ? String(body.note) : null;
  if (body.ordre !== undefined) update.ordre = parseInt(String(body.ordre)) || 0;
  try {
    const item = await prisma.planningBacklog.update({
      where: { id: params.id },
      data: update,
    });
    return NextResponse.json(item);
  } catch (e) {
    return NextResponse.json({ error: "Erreur BDD", details: String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    await prisma.planningBacklog.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "Erreur BDD", details: String(e) }, { status: 500 });
  }
}
