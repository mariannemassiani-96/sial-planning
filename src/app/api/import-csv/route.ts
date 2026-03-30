import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// ── CSV parser (semicolon-delimited, quoted fields) ────────────────────────
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = splitRow(lines[0]);
  return lines.slice(1).map(line => {
    const cols = splitRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h.trim()] = (cols[i] ?? "").trim(); });
    return row;
  }).filter(r => Object.values(r).some(v => v));
}

function splitRow(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if ((ch === ";" || ch === ",") && !inQ) {
      result.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

// ── Normalise string for comparison ──────────────────────────────────────
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// ── Parse French date DD/MM/YYYY → YYYY-MM-DD ────────────────────────────
function parseFrDate(s: string): string | null {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
}

// ── Parse currency string "1 234,56 €" → number ──────────────────────────
function parseCurrency(s: string): number | null {
  const clean = s.replace(/[^\d,.-]/g, "").replace(",", ".");
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

// ── Map Statut Excel → DB statut ────────────────────────────────────────
function mapStatut(s: string): string {
  const v = norm(s);
  if (v.includes("fab"))               return "fab";
  if (v.includes("appro"))             return "appro";
  if (v.includes("partielle"))         return "livraison_partielle";
  if (v.includes("livre") || v.includes("livré")) return "livre";
  if (v.includes("factur"))            return "facture";
  if (v.includes("attente") || v.includes("validation")) return "en_attente";
  if (v.includes("annul"))             return "annule";
  return "en_attente";
}

// ── Map Type Excel → DB type_commande ───────────────────────────────────
function mapType(s: string): string {
  const v = norm(s);
  if (v.includes("pro"))               return "chantier_pro";
  if (v.includes("direct") || v.includes("par")) return "chantier_par";
  if (v.includes("sav"))               return "sav";
  if (v.includes("diffus"))            return "diffus";
  return "chantier_pro";
}

// ── Map Zone Excel → DB zone ─────────────────────────────────────────────
function mapZone(s: string): string {
  const v = norm(s);
  if (v.includes("porto") || v.includes("vecchio")) return "Porto-Vecchio";
  if (v.includes("balagne") || v.includes("calvi") || v.includes("ile-rousse")) return "Balagne";
  if (v.includes("ajaccio"))           return "Ajaccio";
  if (v.includes("plaine") || v.includes("orientale") || v.includes("ghisonaccia") || v.includes("solenzara")) return "Plaine Orientale";
  if (v.includes("continent"))         return "Continent";
  if (v.includes("chantier"))          return "Sur chantier";
  if (v.includes("bastia") || v.includes("nord")) return "Balagne"; // Bastia area
  if (v === "" || v === "sial")        return "SIAL";
  return "SIAL";
}

// ── Build semaine string from raw value + context ────────────────────────
function mapSemaine(semCol: string, anneeCol: string): string | null {
  const s = semCol.trim();
  if (!s || s === "0") return null;
  // Already formatted like "S15" or "S15-2026"
  if (/^S\d+(-\d{4})?$/i.test(s)) {
    if (s.includes("-")) return s.toUpperCase();
    const yr = anneeCol?.match(/\d{4}/)?.[0] || new Date().getFullYear().toString();
    return `${s.toUpperCase()}-${yr}`;
  }
  // Plain number
  const n = parseInt(s);
  if (!isNaN(n) && n > 0 && n <= 53) {
    const yr = anneeCol?.match(/\d{4}/)?.[0] || new Date().getFullYear().toString();
    return `S${n}-${yr}`;
  }
  return null;
}

// ── Map row to Commande fields ────────────────────────────────────────────
function rowToCommande(row: Record<string, string>, idx: number): Record<string, any> | null {
  const client = row["Clients"] || row["Client"] || "";
  if (!client) return null;

  const statut = mapStatut(row["Statut"] || "");

  const dateCreation = parseFrDate(row["Date de Création"] || row["Date de Creation"] || "");
  const yr = dateCreation?.split("-")[0] || new Date().getFullYear().toString();

  const semMontage = mapSemaine(row["Semaine Montage"] || "", yr);
  const semLivraison = mapSemaine(row["Semaine-Livraison"] || row["Semaine Livraison"] || "", yr);
  const semCoupe = mapSemaine(row["Semaine Coupe"] || "", yr);
  const semVitrage = mapSemaine(row["Semaine Vitrage"] || "", yr);

  const datelivraison = parseFrDate(row["AR LIVRAISON"] || "") ||
                        parseFrDate(row["Date de Livraison"] || "");

  // Quantities
  const nChassis = parseInt(row["Nbre Châssis"] || row["Nbre Chassis"] || "0") || 0;
  const nCoulissant = parseInt(row["Nbre Cadre Coulissant"] || "0") || 0;
  const nGalandage = parseInt(row["Nbre Cadre Galandage"] || "0") || 0;
  const nFixe = parseInt(row["Nbre Cadre Fixe"] || "0") || 0;
  const nFrappe = parseInt(row["Nbre Cadre Frappe"] || "0") || 0;
  const quantite = nChassis || (nCoulissant + nGalandage + nFixe + nFrappe) || 1;

  const cmdAluPvc = (row["Commande Alu/PVC"] || "").toLowerCase();

  const nbHeures = parseFloat(row["Nbre Heure Montage"] || "0") || 0;

  // Build a generated num_commande
  const num_commande = `IMP-${yr}-${String(idx).padStart(4, "0")}`;

  return {
    num_commande,
    client: client.trim(),
    ref_chantier: (row["Chantiers"] || row["Chantier"] || "").trim() || null,
    zone: mapZone(row["Zone De Livraison"] || row["Zone"] || ""),
    priorite: "normale",
    type_commande: mapType(row["Type"] || ""),
    type: "ob1_pvc", // default menuiserie type
    quantite,
    statut,
    atelier: "SIAL",
    montant_ht: parseCurrency(row["CA"] || ""),
    date_livraison_souhaitee: datelivraison,
    semaine_theorique: semMontage || semLivraison,
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
    cmd_alu_necessaire: true,
    cmd_pvc_necessaire: true,
    cmd_accessoires_necessaire: false,
    cmd_panneau_necessaire: false,
    cmd_volet_necessaire: false,
    notes: [
      row["Commentaires"] && `Commentaire: ${row["Commentaires"]}`,
      row["MATIERE"] && `Matière: ${row["MATIERE"]}`,
      row["COULEUR"] && `Couleur: ${row["COULEUR"]}`,
      semCoupe && `Sem. Coupe: ${semCoupe}`,
      semVitrage && `Sem. Vitrage: ${semVitrage}`,
      nbHeures > 0 && `H montage: ${nbHeures}h`,
    ].filter(Boolean).join(" | ") || null,
    avancement: 0,
    aucun_vitrage: false,
    lignes: null,
    vitrages: null,
    hsTemps: nbHeures > 0 ? { montage: nbHeures * 60 } : null,
  };
}

// ── POST handler ──────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await req.json();
  const { csv, skipDelivered = true, skipAnnule = true } = body;

  if (!csv || typeof csv !== "string") {
    return NextResponse.json({ error: "CSV manquant" }, { status: 400 });
  }

  const rows = parseCSV(csv);
  if (rows.length === 0) {
    return NextResponse.json({ error: "Fichier CSV vide ou mal formaté" }, { status: 400 });
  }

  // Load existing commandes for dedup
  const existing = await prisma.commande.findMany({
    select: { client: true, ref_chantier: true },
  });
  const existingKeys = new Set(
    existing.map(e => `${norm(e.client)}|${norm(e.ref_chantier || "")}`)
  );

  let imported = 0;
  let skipped = 0;
  let dupes = 0;
  let errors = 0;

  let importIdx = 1;
  for (const row of rows) {
    const cmd = rowToCommande(row, importIdx);
    if (!cmd) { skipped++; continue; }

    // Skip filtered statuses
    if (skipDelivered && (cmd.statut === "livre" || cmd.statut === "facture")) { skipped++; continue; }
    if (skipAnnule && cmd.statut === "annule") { skipped++; continue; }

    // Dedup check
    const key = `${norm(cmd.client)}|${norm(cmd.ref_chantier || "")}`;
    if (existingKeys.has(key)) { dupes++; continue; }

    try {
      await prisma.commande.create({ data: cmd });
      existingKeys.add(key);
      imported++;
      importIdx++;
    } catch (e) {
      console.error("Import error:", e, cmd);
      errors++;
    }
  }

  return NextResponse.json({ imported, skipped, dupes, errors, total: rows.length });
}
