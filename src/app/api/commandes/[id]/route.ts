import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

function mapToDb(data: any) {
  return {
    num_commande:            data.num_commande            || "",
    client:                  data.client                  || "",
    ref_chantier:            data.ref_chantier            || null,
    zone:                    data.zone                    || "SIAL",
    priorite:                data.priorite                || "normale",
    semaine_theorique:       data.semaine_theorique       || null,
    semaine_atteignable:     data.semaine_atteignable     || null,
    date_alu:                data.date_alu                || null,
    date_pvc:                data.date_pvc                || null,
    date_accessoires:        data.date_accessoires        || null,
    date_panneau_porte:      data.date_panneau_porte      || null,
    date_volet_roulant:      data.date_volet_roulant      || null,
    date_livraison_souhaitee: data.date_livraison_souhaitee || null,
    type:                    data.type                    || "ob1_pvc",
    quantite:                parseInt(data.quantite)      || 1,
    hsTemps:                 data.hsTemps                 ?? null,
    lignes:                  data.lignes                  ?? null,
    vitrages:                data.vitrages                ?? null,
    aucun_vitrage:           data.aucun_vitrage           ?? false,
    cmd_alu_passee:          data.cmd_alu_passee          ?? false,
    cmd_pvc_passee:          data.cmd_pvc_passee          ?? false,
    cmd_accessoires_passee:  data.cmd_accessoires_passee  ?? false,
    cmd_panneau_passee:      data.cmd_panneau_passee      ?? false,
    cmd_volet_passee:        data.cmd_volet_passee        ?? false,
    cmd_alu_necessaire:      data.cmd_alu_necessaire      ?? false,
    cmd_pvc_necessaire:      data.cmd_pvc_necessaire      ?? false,
    cmd_accessoires_necessaire: data.cmd_accessoires_necessaire ?? false,
    cmd_panneau_necessaire:  data.cmd_panneau_necessaire  ?? false,
    cmd_volet_necessaire:    data.cmd_volet_necessaire    ?? false,
    transporteur:            data.transporteur            || null,
    etape_coupe_ok:          data.etape_coupe_ok          ?? false,
    etape_montage_ok:        data.etape_montage_ok        ?? false,
    etape_vitrage_ok:        data.etape_vitrage_ok        ?? false,
    etape_palette_ok:        data.etape_palette_ok        ?? false,
    notes:                   data.notes                   || null,
    type_commande:           data.type_commande           || null,
    avancement:              parseInt(data.avancement)    || 0,
    statut:                  data.statut                  || "en_attente",
  };
}

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
  const cmd = await prisma.commande.update({ where: { id: params.id }, data: mapToDb(data) });
  return NextResponse.json(cmd);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  await prisma.commande.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
