import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { testConnection, ODOO_URL, ODOO_DB } from "@/lib/odoo";
import prisma from "@/lib/prisma";

// GET /api/sync/status — État de la connexion Odoo + stats sync
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const connection = await testConnection();

  const totalCommandes = await prisma.commande.count();
  const withNumCommande = await prisma.commande.count({ where: { num_commande: { not: "" } } });

  return NextResponse.json({
    odoo: {
      url: ODOO_URL,
      db: ODOO_DB,
      connected: connection.ok,
      uid: connection.uid || null,
      error: connection.error || null,
    },
    planning: {
      totalCommandes,
      withNumCommande,
    },
  });
}
