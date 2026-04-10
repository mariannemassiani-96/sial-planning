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

function addWeeks(mondayStr: string, n: number): string {
  const d = new Date(mondayStr + "T00:00:00");
  d.setDate(d.getDate() + n * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Vendredi de la semaine
function mondayToFriday(mondayStr: string): string {
  const d = new Date(mondayStr + "T00:00:00");
  d.setDate(d.getDate() + 4);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface BatchItem {
  client: string;
  ref_chantier: string;
  type_commande?: string;
  semaine_livraison: string; // "S14 2026"
}

// POST /api/planning/batch-weeks
// Body: { items: BatchItem[] }
export async function POST(req: NextRequest) {
  // Auth : session OU secret pour appels batch
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
    const mondayLivraison = weekToMonday(item.semaine_livraison);
    if (!mondayLivraison) {
      results.push({ client: item.client, ref: item.ref_chantier, status: "semaine invalide" });
      continue;
    }

    const fridayLivraison = mondayToFriday(mondayLivraison);

    // Trouver la commande par client + ref_chantier (recherche flexible)
    const clientLower = item.client.trim().toLowerCase();
    const refLower = (item.ref_chantier || "").trim().toLowerCase();

    const allCommandes = await prisma.commande.findMany({
      where: { client: { contains: item.client.trim(), mode: "insensitive" } },
      select: { id: true, client: true, ref_chantier: true },
    });

    // Chercher la meilleure correspondance
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

    // Calculer les semaines de fabrication — pas de rigidité :
    // - Coupe : livraison -2 sem (buffer pour montage)
    // - Montage : livraison -1 sem
    // - Vitrage + Logistique : semaine de livraison
    // SAV/Diffus : tout sur livraison -1 (petit job)
    const isSAV = (item.type_commande || "").toLowerCase().includes("sav");
    const isDiffus = (item.type_commande || "").toLowerCase().includes("diffus");
    const isSmall = isSAV || isDiffus;

    const semCoupe      = isSmall ? addWeeks(mondayLivraison, -1) : addWeeks(mondayLivraison, -2);
    const semMontage    = isSmall ? addWeeks(mondayLivraison, -1) : addWeeks(mondayLivraison, -1);
    const semVitrage    = isSmall ? addWeeks(mondayLivraison, -1) : mondayLivraison;
    const semLogistique = mondayLivraison;

    await prisma.commande.update({
      where: { id: match.id },
      data: {
        date_livraison_souhaitee: fridayLivraison,
        semaine_coupe: semCoupe,
        semaine_montage: semMontage,
        semaine_vitrage: semVitrage,
        semaine_logistique: semLogistique,
      },
    });

    results.push({ client: item.client, ref: item.ref_chantier, status: "OK", id: match.id });
  }

  const ok = results.filter(r => r.status === "OK").length;
  const fail = results.filter(r => r.status !== "OK").length;

  return NextResponse.json({ ok, fail, total: items.length, details: results });
}
