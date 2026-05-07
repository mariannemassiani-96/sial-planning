import { NextRequest, NextResponse } from "next/server";
import { resyncAllCommandes } from "@/lib/commande-adapter";

/**
 * Phase 0-C : POST /api/admin/resync-all
 * Reprojette toutes les Commandes vers Order/FabItem/ProductionTask.
 * Protégée par header `x-admin-key` (cf. process.env.ADMIN_RESYNC_KEY).
 */
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-admin-key") || "";
  const expected = process.env.ADMIN_RESYNC_KEY || "";
  if (!expected) {
    return NextResponse.json(
      { error: "ADMIN_RESYNC_KEY non configurée côté serveur" },
      { status: 503 },
    );
  }
  if (key !== expected) {
    return NextResponse.json({ error: "Clé invalide" }, { status: 403 });
  }
  try {
    const result = await resyncAllCommandes(20);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[/api/admin/resync-all]", e);
    return NextResponse.json(
      { error: "Resync a échoué", details: String(e) },
      { status: 500 },
    );
  }
}
