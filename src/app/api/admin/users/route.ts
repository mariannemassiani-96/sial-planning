import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

// Auto-migration: add permissions column if missing
let migDone = false;
async function ensurePermissionsCol() {
  if (migDone) return;
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "permissions" JSONB`
    );
    migDone = true;
  } catch {}
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  if ((session.user as any)?.role !== "ADMIN") return null;
  return session;
}

interface UserRow {
  id: string;
  email: string;
  nom: string;
  role: string;
  permissions: any;
  createdAt: Date;
}

// GET — list all users (admin only)
export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });

  await ensurePermissionsCol();

  const users = await prisma.$queryRaw<UserRow[]>`
    SELECT id, email, nom, role, permissions, "createdAt"
    FROM "User"
    ORDER BY "createdAt" ASC
  `;
  return NextResponse.json(users);
}

// POST — create user (admin only)
export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });

  await ensurePermissionsCol();

  const data = await req.json();
  if (!data.email || !data.password || !data.nom) {
    return NextResponse.json({ error: "Champs obligatoires manquants" }, { status: 400 });
  }

  // Check for duplicate email
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    return NextResponse.json({ error: "Cet email existe déjà" }, { status: 409 });
  }

  const hashed = await bcrypt.hash(data.password, 10);
  const permsJson = data.permissions ? JSON.stringify(data.permissions) : null;

  const rows = await prisma.$queryRaw<UserRow[]>`
    INSERT INTO "User" (id, email, password, nom, role, permissions, "createdAt")
    VALUES (
      gen_random_uuid()::text,
      ${data.email},
      ${hashed},
      ${data.nom},
      ${data.role || "OPERATEUR"},
      ${permsJson}::jsonb,
      NOW()
    )
    RETURNING id, email, nom, role, permissions, "createdAt"
  `;
  if (!rows[0]) return NextResponse.json({ error: "Erreur création" }, { status: 500 });
  return NextResponse.json(rows[0], { status: 201 });
}

// PATCH — update user (admin only)
export async function PATCH(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });

  await ensurePermissionsCol();

  const data = await req.json();
  if (!data.id) return NextResponse.json({ error: "ID manquant" }, { status: 400 });

  // Build SET clauses dynamically
  const sets: string[] = [];
  const vals: any[] = [];
  let idx = 1;

  if (data.nom !== undefined) { sets.push(`nom = $${idx++}`); vals.push(data.nom); }
  if (data.email !== undefined) { sets.push(`email = $${idx++}`); vals.push(data.email); }
  if (data.role !== undefined) { sets.push(`role = $${idx++}`); vals.push(data.role); }
  if (data.permissions !== undefined) {
    sets.push(`permissions = $${idx++}::jsonb`);
    vals.push(JSON.stringify(data.permissions));
  }
  if (data.password) {
    const hashed = await bcrypt.hash(data.password, 10);
    sets.push(`password = $${idx++}`);
    vals.push(hashed);
  }

  if (sets.length === 0) return NextResponse.json({ error: "Rien à modifier" }, { status: 400 });

  vals.push(data.id);
  const query = `UPDATE "User" SET ${sets.join(", ")} WHERE id = $${idx} RETURNING id, email, nom, role, permissions, "createdAt"`;
  const rows = await prisma.$queryRawUnsafe<UserRow[]>(query, ...vals);
  if (!rows[0]) return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
  return NextResponse.json(rows[0]);
}

// DELETE — delete user (admin only)
export async function DELETE(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID manquant" }, { status: 400 });

  // Prevent deleting yourself
  const currentUser = await prisma.user.findUnique({ where: { email: (session.user as any).email } });
  if (currentUser?.id === id) {
    return NextResponse.json({ error: "Vous ne pouvez pas supprimer votre propre compte" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
