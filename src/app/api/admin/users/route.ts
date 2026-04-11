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

// GET /api/admin/users — Liste tous les utilisateurs
export async function GET() {
  if (!(await checkAdmin())) return NextResponse.json({ error: "Admin requis" }, { status: 403 });
  const users = await prisma.user.findMany({
    select: { id: true, email: true, nom: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(users);
}

// POST /api/admin/users — Créer un utilisateur
export async function POST(req: NextRequest) {
  if (!(await checkAdmin())) return NextResponse.json({ error: "Admin requis" }, { status: 403 });
  const { email, nom, role, password } = await req.json();
  if (!email || !password) return NextResponse.json({ error: "email et password requis" }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: "Email déjà utilisé" }, { status: 409 });

  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, nom: nom || email.split("@")[0], role: role || "OPERATEUR", password: hash },
    select: { id: true, email: true, nom: true, role: true, createdAt: true },
  });
  return NextResponse.json(user, { status: 201 });
}
