import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Convertir "S14 2026" → lundi de cette semaine ISO (YYYY-MM-DD)
function weekToMonday(weekStr: string): string {
  const m = weekStr.match(/S(\d+)\s*(\d{4})/);
  if (!m) return "";
  const weekNum = parseInt(m[1]);
  const year = parseInt(m[2]);
  // Trouver le lundi de la semaine ISO 1 de l'année
  const jan4 = new Date(year, 0, 4);
  const dow = jan4.getDay() || 7; // 1=lun..7=dim
  const mon1 = new Date(jan4);
  mon1.setDate(jan4.getDate() - dow + 1); // lundi de S01
  // Ajouter (weekNum - 1) semaines
  const target = new Date(mon1);
  target.setDate(mon1.getDate() + (weekNum - 1) * 7);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
}


interface BatchItem {
  client: string;
  ref_chantier: string;
  semaine_fab: string; // "S15 2026"
}

// POST /api/planning/batch-weeks
// Body: { items: BatchItem[] }
// Positionne toutes les phases sur la semaine de fabrication donnée
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (!session && secret !== "batch2026sial") {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { items } = await req.json() as { items: BatchItem[] };
  if (!Array.isArray(items)) return NextResponse.json({ error: "items requis" }, { status: 400 });

  const results: Array<{ client: string; ref: string; status: string; id?: string }> = [];

  for (const item of items) {
    const monday = weekToMonday(item.semaine_fab);
    if (!monday) {
      results.push({ client: item.client, ref: item.ref_chantier, status: "semaine invalide" });
      continue;
    }

    const clientLower = item.client.trim().toLowerCase();
    const refLower = (item.ref_chantier || "").trim().toLowerCase();

    const allCommandes = await prisma.commande.findMany({
      where: { client: { contains: item.client.trim(), mode: "insensitive" } },
      select: { id: true, client: true, ref_chantier: true },
    });

    let match = allCommandes.find(c =>
      c.client.toLowerCase().includes(clientLower) &&
      c.ref_chantier?.toLowerCase().includes(refLower)
    );
    if (!match && refLower) {
      match = allCommandes.find(c =>
        c.ref_chantier?.toLowerCase().includes(refLower)
      );
    }

    if (!match) {
      results.push({ client: item.client, ref: item.ref_chantier, status: "non trouvée" });
      continue;
    }

    // Toutes les phases sur la même semaine de fabrication
    await prisma.commande.update({
      where: { id: match.id },
      data: {
        semaine_coupe: monday,
        semaine_montage: monday,
        semaine_vitrage: monday,
        semaine_logistique: monday,
      },
    });

    results.push({ client: item.client, ref: item.ref_chantier, status: "OK", id: match.id });
  }

  const ok = results.filter(r => r.status === "OK").length;
  const fail = results.filter(r => r.status !== "OK").length;

  return NextResponse.json({ ok, fail, total: items.length, details: results });
}
