import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

let _columnsOk = false;
async function ensureColumns() {
  if (_columnsOk) return;
  try {
    await (prisma as any).$executeRawUnsafe(
      `ALTER TABLE "Commande" ADD COLUMN IF NOT EXISTS "nb_livraisons" INTEGER NOT NULL DEFAULT 1`
    );
    await (prisma as any).$executeRawUnsafe(
      `ALTER TABLE "Commande" ADD COLUMN IF NOT EXISTS "dates_livraisons" JSONB`
    );
    _columnsOk = true;
  } catch (e) {
    console.error("ensureColumns error:", e instanceof Error ? e.message : e);
  }
}

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
    atelier:                 data.atelier                 || "SIAL",
    montant_ht:              data.montant_ht != null ? parseFloat(data.montant_ht) || null : null,
    avancement:              parseInt(data.avancement)    || 0,
    statut:                  data.statut                  || "en_attente",
    acompte_recu:              data.acompte_recu              ?? false,
    acompte_montant:           data.acompte_montant != null ? parseFloat(data.acompte_montant) || null : null,
    acompte_date:              data.acompte_date              || null,
    reliquat_alu:              data.reliquat_alu              ?? false,
    reliquat_alu_desc:         data.reliquat_alu_desc         || null,
    reliquat_alu_date:         data.reliquat_alu_date         || null,
    reliquat_pvc:              data.reliquat_pvc              ?? false,
    reliquat_pvc_desc:         data.reliquat_pvc_desc         || null,
    reliquat_pvc_date:         data.reliquat_pvc_date         || null,
    reliquat_accessoires:      data.reliquat_accessoires      ?? false,
    reliquat_accessoires_desc: data.reliquat_accessoires_desc || null,
    reliquat_accessoires_date: data.reliquat_accessoires_date || null,
    nb_livraisons:             parseInt(data.nb_livraisons)   || 1,
    dates_livraisons:          data.dates_livraisons          ?? null,
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    await ensureColumns();
    const commandes = await prisma.commande.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json(commandes);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    console.error("GET /api/commandes error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const data = await req.json();
    const cmd = await prisma.commande.create({ data: mapToDb(data) });
    return NextResponse.json(cmd, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Erreur création commande" }, { status: 500 });
  }
}
