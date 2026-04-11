import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

async function checkAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  if ((session.user as any)?.role !== "ADMIN") return null;
  return session;
}

// PATCH /api/admin/users/[id] — Modifier un utilisateur
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await checkAdmin())) return NextResponse.json({ error: "Admin requis" }, { status: 403 });
  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.email !== undefined) data.email = body.email;
  if (body.nom !== undefined) data.nom = body.nom;
  if (body.role !== undefined) data.role = body.role;
  if (body.password) data.password = await bcrypt.hash(body.password, 10);

  const user = await prisma.user.update({
    where: { id: params.id },
    data,
    select: { id: true, email: true, nom: true, role: true, createdAt: true },
  });
  return NextResponse.json(user);
}

// DELETE /api/admin/users/[id] — Supprimer un utilisateur
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Admin requis" }, { status: 403 });
  // Empêcher de se supprimer soi-même
  if ((session.user as any)?.email) {
    const user = await prisma.user.findUnique({ where: { id: params.id } });
    if (user?.email === (session.user as any).email) {
      return NextResponse.json({ error: "Impossible de supprimer votre propre compte" }, { status: 400 });
    }
  }
  await prisma.user.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
