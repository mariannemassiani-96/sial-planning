import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(request: Request) {
  // Allow internal cron calls (with secret) or admin users
  const authHeader = request.headers.get("authorization");
  const isInternalCron = authHeader === `Bearer ${process.env.BACKUP_SECRET}`;
  if (!isInternalCron) {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any)?.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
  }
  const commandes = await prisma.commande.findMany({ orderBy: { createdAt: "desc" } });
  const backup = await prisma.backup.create({ data: { data: commandes as any } });
  // Keep only last 30 backups
  const old = await prisma.backup.findMany({ orderBy: { createdAt: "asc" } });
  if (old.length > 30) {
    const toDelete = old.slice(0, old.length - 30);
    await prisma.backup.deleteMany({ where: { id: { in: toDelete.map(b => b.id) } } });
  }
  return NextResponse.json({ ok: true, id: backup.id, count: commandes.length, date: backup.createdAt });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any)?.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const backups = await prisma.backup.findMany({ orderBy: { createdAt: "desc" }, take: 30, select: { id: true, createdAt: true } });
  return NextResponse.json(backups);
}
