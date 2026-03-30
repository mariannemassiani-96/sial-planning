// Import CSV commandes depuis le fichier paste-cache
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

// ── Fix mojibake encoding (latin-1 bytes stored as UTF-8) ─────────────────
function fixEncoding(s: string): string {
  try {
    const bytes = Buffer.alloc(s.length);
    for (let i = 0; i < s.length; i++) {
      bytes[i] = s.charCodeAt(i) & 0xFF;
    }
    // Check if valid UTF-8
    const decoded = bytes.toString("utf8");
    if (decoded.includes("\uFFFD")) return s; // fallback if invalid
    return decoded;
  } catch {
    return s;
  }
}

// ── CSV parser (comma-delimited, quoted fields) ───────────────────────────
function splitRow(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === "," && !inQ) {
      result.push(cur.trim()); cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = splitRow(lines[0]).map(h => fixEncoding(h).trim());
  return lines.slice(1).map(line => {
    const cols = splitRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = fixEncoding((cols[i] ?? "").trim()); });
    return row;
  }).filter(r => Object.values(r).some(v => v));
}

// ── Normalise for comparison ──────────────────────────────────────────────
function norm(s: string): string {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// ── Parse French date DD/MM/YYYY → YYYY-MM-DD ────────────────────────────
function parseFrDate(s: string): string | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
}

// ── Parse currency string ─────────────────────────────────────────────────
function parseCurrency(s: string): number | null {
  if (!s) return null;
  const clean = s.replace(/[^\d,.-]/g, "").replace(",", ".");
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

// ── Map Statut ────────────────────────────────────────────────────────────
function mapStatut(s: string): string {
  const v = norm(s);
  if (v.includes("fab"))         return "fab";
  if (v.includes("appro"))       return "appro";
  if (v.includes("partielle"))   return "livraison_partielle";
  if (v.includes("livr"))        return "livre";
  if (v.includes("factur"))      return "facture";
  if (v.includes("attente") || v.includes("validation")) return "en_attente";
  if (v.includes("annul"))       return "annule";
  return "en_attente";
}

// ── Map Type commande ─────────────────────────────────────────────────────
function mapType(s: string): string {
  const v = norm(s);
  if (v.includes("pro"))         return "chantier_pro";
  if (v.includes("direct") || v.includes("par")) return "chantier_par";
  if (v.includes("sav"))         return "sav";
  if (v.includes("diffus"))      return "diffus";
  return "chantier_pro";
}

// ── Map Zone ──────────────────────────────────────────────────────────────
function mapZone(s: string): string {
  const v = norm(s);
  if (v.includes("porto") || v.includes("vecchio")) return "Porto-Vecchio";
  if (v.includes("balagne") || v.includes("calvi"))  return "Balagne";
  if (v.includes("ajaccio"))     return "Ajaccio";
  if (v.includes("plaine") || v.includes("orientale") || v.includes("ghison")) return "Plaine Orientale";
  if (v.includes("continent"))   return "Continent";
  if (v.includes("chantier") && v.includes("sur")) return "Sur chantier";
  if (v.includes("bastia"))      return "Balagne";
  return "SIAL";
}

// ── Map Semaine ───────────────────────────────────────────────────────────
function mapSemaine(semCol: string, anneeCol: string): string | null {
  const s = (semCol || "").trim().replace(/\s+/g, " ");
  if (!s || s === "0") return null;
  // "S18 2026" or "S18-2026"
  const m = s.match(/[Ss](\d+)[\s-](\d{4})/);
  if (m) return `S${m[1]}-${m[2]}`;
  // Already "S18"
  const m2 = s.match(/^[Ss](\d+)$/);
  if (m2) {
    const yr = anneeCol?.match(/\d{4}/)?.[0] || new Date().getFullYear().toString();
    return `S${m2[1]}-${yr}`;
  }
  // Plain number
  const n = parseInt(s);
  if (!isNaN(n) && n > 0 && n <= 53) {
    const yr = anneeCol?.match(/\d{4}/)?.[0] || new Date().getFullYear().toString();
    return `S${n}-${yr}`;
  }
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const csvPath = process.argv[2];
  if (!csvPath || !fs.existsSync(csvPath)) {
    console.error("Usage: ts-node scripts/import-csv.ts <path-to-csv>");
    process.exit(1);
  }

  const raw = fs.readFileSync(csvPath, "utf8");
  const rows = parseCSV(raw);
  console.log(`CSV lu : ${rows.length} lignes`);

  // Load existing for dedup
  const existing = await prisma.commande.findMany({
    select: { client: true, ref_chantier: true },
  });
  const existingKeys = new Set(
    existing.map(e => `${norm(e.client)}|${norm(e.ref_chantier || "")}`)
  );
  console.log(`Commandes existantes en base : ${existing.length}`);

  let imported = 0, skipped = 0, dupes = 0, errors = 0;
  let importIdx = 1;

  for (const row of rows) {
    const client = (row["Clients"] || row["Client"] || "").trim();
    if (!client) { skipped++; continue; }

    const statut = mapStatut(row["Statut"] || "");

    // Skip livrées, facturées, annulées
    if (["livre", "facture", "annule"].includes(statut)) { skipped++; continue; }

    const ref_chantier = (row["Chantiers"] || row["Chantier"] || "").trim() || null;
    const key = `${norm(client)}|${norm(ref_chantier || "")}`;
    if (existingKeys.has(key)) { dupes++; continue; }

    const dateCreation = parseFrDate(row["Date de Création"] || row["Date de Creation"] || "");
    const yr = dateCreation?.split("-")[0] || new Date().getFullYear().toString();

    const semMontage  = mapSemaine(row["Semaine Montage"] || "", yr);
    const semLivraison = mapSemaine(row["Semaine-Livraison"] || row["Semaine Livraison"] || "", yr);
    const semCoupe    = mapSemaine(row["Semaine Coupe"] || "", yr);
    const semVitrage  = mapSemaine(row["Semaine Vitrage"] || "", yr);

    const datelivraison = parseFrDate(row["AR LIVRAISON"] || "") ||
                          parseFrDate(row["Date de Livraison"] || "");

    const nChassis  = parseInt(row["Nbre Châssis"] || row["Nbre Chassis"] || "0") || 0;
    const nCoul     = parseInt(row["Nbre Cadre Coulissant"] || "0") || 0;
    const nGal      = parseInt(row["Nbre Cadre Galandage"] || "0") || 0;
    const nFixe     = parseInt(row["Nbre Cadre Fixe"] || "0") || 0;
    const nFrappe   = parseInt(row["Nbre Cadre Frappe"] || "0") || 0;
    const quantite  = nChassis || (nCoul + nGal + nFixe + nFrappe) || 1;

    const cmdAluPvc = (row["Commande Alu/PVC ?"] || row["Commande Alu/PVC"] || "").toLowerCase();
    const nbHeures  = parseFloat(row["Nbre Heure Montage"] || "0") || 0;
    const num_commande = `IMP-${yr}-${String(importIdx).padStart(4, "0")}`;

    const notesParts = [
      row["Commentaires"]  && `Commentaire: ${row["Commentaires"]}`,
      row["MATIERE"]       && `Matière: ${row["MATIERE"]}`,
      row["COULEUR"]       && `Couleur: ${row["COULEUR"]}`,
      semCoupe             && `Sem. Coupe: ${semCoupe}`,
      semVitrage           && `Sem. Vitrage: ${semVitrage}`,
      nbHeures > 0         && `H montage: ${nbHeures}h`,
    ].filter(Boolean);

    const data = {
      num_commande,
      client,
      ref_chantier,
      zone: mapZone(row["Zone De Livraison"] || row["Zone"] || ""),
      priorite: "normale",
      type_commande: mapType(row["Type"] || ""),
      type: "ob1_pvc",
      quantite,
      statut,
      atelier: "SIAL",
      montant_ht: parseCurrency(row["CA"] || ""),
      date_livraison_souhaitee: datelivraison,
      semaine_theorique: semMontage || semLivraison || null,
      date_alu: parseFrDate(row["RECEPTION ALU/PVC"] || ""),
      date_pvc: parseFrDate(row["RECEPTION ALU/PVC"] || ""),
      date_volet_roulant: parseFrDate(row["Date Réception Coffre/VR"] || row["Date Reception Coffre/VR"] || ""),
      date_accessoires: parseFrDate(row["Date Reception Accessoire Quin"] || ""),
      transporteur: (row["Chauffeur"] || "").trim() || null,
      cmd_alu_passee: cmdAluPvc.includes("pass"),
      cmd_pvc_passee: cmdAluPvc.includes("pass"),
      cmd_accessoires_passee: false,
      cmd_panneau_passee: false,
      cmd_volet_passee: false,
      cmd_alu_necessaire: !cmdAluPvc.includes("necessaire") && !cmdAluPvc.includes("pas n"),
      cmd_pvc_necessaire: !cmdAluPvc.includes("necessaire") && !cmdAluPvc.includes("pas n"),
      cmd_accessoires_necessaire: false,
      cmd_panneau_necessaire: false,
      cmd_volet_necessaire: false,
      notes: notesParts.length > 0 ? notesParts.join(" | ") : null,
      avancement: 0,
      aucun_vitrage: false,
      lignes: undefined,
      vitrages: undefined,
      hsTemps: nbHeures > 0 ? { montage: nbHeures * 60 } : undefined,
    };

    try {
      await prisma.commande.create({ data: data as any });
      existingKeys.add(key);
      imported++;
      importIdx++;
      if (imported % 10 === 0) console.log(`  ${imported} importées...`);
    } catch (e: any) {
      console.error(`  ERREUR [${client} / ${ref_chantier}]:`, e.message);
      errors++;
    }
  }

  console.log("\n──────────────────────────────────────────");
  console.log(`✅ Importées      : ${imported}`);
  console.log(`⏭  Doublons       : ${dupes}`);
  console.log(`🚫 Filtrées       : ${skipped}`);
  console.log(`❌ Erreurs        : ${errors}`);
  console.log(`📄 Total CSV      : ${rows.length}`);
  console.log("──────────────────────────────────────────");

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
