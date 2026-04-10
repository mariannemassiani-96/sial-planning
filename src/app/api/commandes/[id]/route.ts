import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const cmd = await prisma.commande.findUnique({ where: { id: params.id } });
  if (!cmd) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  return NextResponse.json(cmd);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const data = await req.json();

  // Vrai PATCH : ne met à jour que les champs explicitement envoyés
  // pour ne pas écraser statut, étapes, etc. avec des valeurs par défaut
  const partial: Record<string, unknown> = {};
  const fields = [
    "num_commande","client","ref_chantier","zone","priorite",
    "semaine_theorique","semaine_atteignable",
    "date_alu","date_pvc","date_accessoires","date_panneau_porte","date_volet_roulant",
    "date_livraison_souhaitee","type","quantite","hsTemps","lignes","vitrages",
    "aucun_vitrage",
    "cmd_alu_passee","cmd_pvc_passee","cmd_accessoires_passee","cmd_panneau_passee","cmd_volet_passee",
    "cmd_alu_necessaire","cmd_pvc_necessaire","cmd_accessoires_necessaire","cmd_panneau_necessaire","cmd_volet_necessaire",
    "transporteur",
    "etape_coupe_ok","etape_montage_ok","etape_vitrage_ok","etape_palette_ok",
    "etape_coupe_date","etape_montage_date","etape_vitrage_date","etape_palette_date",
    "notes","type_commande","atelier","montant_ht","avancement","statut",
    "acompte_recu","acompte_montant","acompte_date",
    "reliquat_alu","reliquat_alu_desc","reliquat_alu_date",
    "reliquat_pvc","reliquat_pvc_desc","reliquat_pvc_date",
    "reliquat_accessoires","reliquat_accessoires_desc","reliquat_accessoires_date",
    "semaine_coupe","semaine_montage","semaine_vitrage","semaine_logistique","semaine_isula",
  ];
  for (const key of fields) {
    if (data[key] !== undefined) {
      let val = data[key];
      if (key === "quantite") val = parseInt(val) || 1;
      else if (key === "montant_ht" || key === "acompte_montant") val = val != null ? parseFloat(val) || null : null;
      else if (key === "avancement") val = parseInt(val) || 0;
      partial[key] = val;
    }
  }

  const cmd = await prisma.commande.update({ where: { id: params.id }, data: partial });
  return NextResponse.json(cmd);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  await prisma.commande.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
