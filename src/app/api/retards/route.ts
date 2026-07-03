import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { workdaysBetween } from "@/lib/scheduling-utils";

interface RetardItem {
  commandeId: string;
  ref_chantier: string | null;
  client: string;
  etape: string;          // "coupe" | "montage" | "vitrage" | "palette"
  datePrevu: string;
  joursRetard: number;
  niveauRetard: "warning" | "critical";
}

const ETAPE_FIELDS = [
  { etape: "coupe",    okKey: "etape_coupe_ok",    dateKey: "etape_coupe_date" },
  { etape: "montage",  okKey: "etape_montage_ok",  dateKey: "etape_montage_date" },
  { etape: "vitrage",  okKey: "etape_vitrage_ok",  dateKey: "etape_vitrage_date" },
  { etape: "palette",  okKey: "etape_palette_ok",  dateKey: "etape_palette_date" },
] as const;

/**
 * Phase 1-D : GET /api/retards
 * Pour chaque Commande non terminée, pour chaque étape dont la date est
 * dans le passé ET qui n'est pas validée → retard.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);
  try {
    const commandes = await prisma.commande.findMany({
      where: { statut: { notIn: ["livre", "terminee", "annulee"] } },
    });

    const retards: RetardItem[] = [];
    for (const cmd of commandes) {
      const c = cmd as any;
      for (const f of ETAPE_FIELDS) {
        const ok = c[f.okKey] as boolean;
        const date = c[f.dateKey] as string | null;
        if (ok || !date) continue;
        if (date >= today) continue;
        const joursRetard = workdaysBetween(date, today);
        if (joursRetard <= 0) continue;
        retards.push({
          commandeId:    cmd.id,
          ref_chantier:  cmd.ref_chantier,
          client:        cmd.client,
          etape:         f.etape,
          datePrevu:     date,
          joursRetard,
          niveauRetard:  joursRetard >= 5 ? "critical" : "warning",
        });
      }
    }

    // Tri : critical d'abord, puis joursRetard DESC
    retards.sort((a, b) => {
      if (a.niveauRetard !== b.niveauRetard) {
        return a.niveauRetard === "critical" ? -1 : 1;
      }
      return b.joursRetard - a.joursRetard;
    });

    return NextResponse.json(retards);
  } catch (e) {
    console.error("[/api/retards]", e);
    return NextResponse.json({ error: "Erreur lecture retards", details: String(e) }, { status: 500 });
  }
}
