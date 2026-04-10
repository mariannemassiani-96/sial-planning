/**
 * Synchronisation Odoo sale.order <-> Prisma Commande
 * SI.AL company_id = 2
 */

import { searchRead, write } from "./odoo";
import prisma from "./prisma";

// ── Champs Odoo à lire ──────────────────────────────────────────────────────

const ODOO_FIELDS = [
  "id", "name", "partner_id", "state",
  "x_nom_chantier", "x_zone_livraison",
  "x_achats_coches", "x_acompte_encaisse",
  "x_date_livraison_souhaitee",
  "x_type_commande",
  "x_statut_production",
  "x_qc1_ok", "x_qc2_ok", "x_qc3_ok", "x_qc4_ok",
  "order_line",
  "amount_untaxed",
  "create_date",
];

// ── Mapping Odoo → Prisma ────────────────────────────────────────────────────

function mapOdooToCommande(order: any): Record<string, unknown> {
  const partner = Array.isArray(order.partner_id) ? order.partner_id[1] : String(order.partner_id || "");

  return {
    num_commande: order.name || "",
    client: partner,
    ref_chantier: order.x_nom_chantier || null,
    zone: order.x_zone_livraison || "SIAL",
    type_commande: mapTypeCommande(order.x_type_commande),
    date_livraison_souhaitee: order.x_date_livraison_souhaitee || null,
    montant_ht: order.amount_untaxed || null,
    // Appro
    cmd_alu_passee: !!(order.x_achats_coches),
    // Acompte
    acompte_recu: !!(order.x_acompte_encaisse),
    // Étapes production (lecture depuis Odoo)
    etape_coupe_ok: !!(order.x_qc1_ok),
    etape_montage_ok: !!(order.x_qc2_ok),
    etape_vitrage_ok: !!(order.x_qc3_ok),
    etape_palette_ok: !!(order.x_qc4_ok),
    // Statut
    statut: mapStatutFromOdoo(order.x_statut_production, order.state),
    // Méta
    type: "ob1_pvc", // type par défaut, à ajuster manuellement
    quantite: 1,
    atelier: "SIAL",
  };
}

function mapTypeCommande(val: string | false): string | null {
  if (!val) return null;
  const v = String(val).toLowerCase();
  if (v.includes("pro")) return "chantier_pro";
  if (v.includes("direct")) return "chantier_direct";
  if (v.includes("sav")) return "sav";
  if (v.includes("diffus")) return "diffus";
  return null;
}

function mapStatutFromOdoo(statutProd: string | false, state: string): string {
  if (statutProd) {
    const s = String(statutProd).toLowerCase();
    if (s.includes("livre") || s.includes("livré")) return "livre";
    if (s.includes("termin")) return "terminee";
    if (s.includes("cours")) return "en_cours";
    if (s.includes("attente")) return "en_attente";
    if (s.includes("annul")) return "annulee";
  }
  // Fallback sur le state Odoo
  if (state === "cancel") return "annulee";
  if (state === "done") return "livre";
  if (state === "sale") return "en_attente";
  return "en_attente";
}

// ── Import : Odoo → Planning ─────────────────────────────────────────────────

export async function importFromOdoo(): Promise<{
  imported: number; updated: number; skipped: number; errors: string[];
}> {
  const errors: string[] = [];
  let imported = 0, updated = 0, skipped = 0;

  // Lire les commandes SI.AL (company_id = 2), non annulées
  const orders = await searchRead(
    "sale.order",
    [["company_id", "=", 2], ["state", "not in", ["cancel", "draft"]]],
    ODOO_FIELDS,
    500,
    0,
    "create_date desc",
  );

  for (const order of orders) {
    try {
      const numCommande = order.name;
      if (!numCommande) { skipped++; continue; }

      const data = mapOdooToCommande(order);

      // Chercher si la commande existe déjà (par num_commande)
      const existing = await prisma.commande.findFirst({
        where: { num_commande: numCommande },
      });

      if (existing) {
        // Mise à jour (ne pas écraser les semaines de fab ni le statut si déjà modifié localement)
        const updateData: Record<string, unknown> = { ...data };
        delete updateData.type;
        delete updateData.quantite;
        delete updateData.statut; // ne pas écraser le statut local
        await prisma.commande.update({
          where: { id: existing.id },
          data: updateData,
        });
        updated++;
      } else {
        // Création
        await prisma.commande.create({ data: data as any });
        imported++;
      }
    } catch (e: any) {
      errors.push(`${order.name}: ${e.message}`);
    }
  }

  return { imported, updated, skipped, errors };
}

// ── Export : Planning → Odoo ─────────────────────────────────────────────────

export async function exportToOdoo(): Promise<{
  exported: number; skipped: number; errors: string[];
}> {
  const errors: string[] = [];
  let exported = 0, skipped = 0;

  // Récupérer les commandes locales qui ont un num_commande
  const commandes = await prisma.commande.findMany({
    where: { num_commande: { not: "" } },
  });

  for (const cmd of commandes) {
    try {
      if (!cmd.num_commande) { skipped++; continue; }

      // Trouver la commande Odoo correspondante
      const odooOrders = await searchRead(
        "sale.order",
        [["company_id", "=", 2], ["name", "=", cmd.num_commande]],
        ["id"],
        1,
      );

      if (odooOrders.length === 0) { skipped++; continue; }

      const odooId = odooOrders[0].id;

      // Écrire les étapes production et le statut
      const vals: Record<string, unknown> = {
        x_qc1_ok: cmd.etape_coupe_ok || false,
        x_qc2_ok: cmd.etape_montage_ok || false,
        x_qc3_ok: cmd.etape_vitrage_ok || false,
        x_qc4_ok: cmd.etape_palette_ok || false,
        x_statut_production: mapStatutToOdoo(cmd.statut),
      };

      await write("sale.order", [odooId], vals);
      exported++;
    } catch (e: any) {
      errors.push(`${cmd.num_commande}: ${e.message}`);
    }
  }

  return { exported, skipped, errors };
}

function mapStatutToOdoo(statut: string): string {
  switch (statut) {
    case "en_attente": return "En attente";
    case "en_cours": return "En cours";
    case "livre": return "Livré";
    case "terminee": return "Terminé";
    case "annulee": return "Annulé";
    default: return "En attente";
  }
}
