import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

interface UserRow {
  id: string;
  nom: string;
  role: string;
  permissions: any;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const rows = await prisma.$queryRaw<UserRow[]>`
    SELECT id, nom, role, permissions
    FROM "User"
    WHERE email = ${session.user.email}
    LIMIT 1
  `;
  if (rows.length === 0) return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
  return NextResponse.json(rows[0]);
}
