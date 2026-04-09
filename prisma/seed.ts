import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // ── Utilisateurs ────────────────────────────────────────────────────────
  const hash = await bcrypt.hash("Vista2026!", 10);
  await prisma.user.upsert({
    where: { email: "marianne@groupe-vista.fr" },
    update: {},
    create: { email: "marianne@groupe-vista.fr", password: hash, nom: "Marianne", role: "ADMIN" },
  });
  await prisma.user.upsert({
    where: { email: "angejoseph@groupe-vista.fr" },
    update: {},
    create: { email: "angejoseph@groupe-vista.fr", password: hash, nom: "Ange-Joseph", role: "OPERATEUR" },
  });

  // ── Stocks tampons (ancien modèle) ──────────────────────────────────────
  for (const id of ["profils_coupes", "vitrages_isula", "ouvrants_vitres", "accessoires_prep", "profils_bruts", "verre_brut"]) {
    await prisma.stockTampon.upsert({ where: { id }, update: {}, create: { id, actuel: 0 } });
  }

  // ── WorkPosts — SIAL Coupe & Prépa ──────────────────────────────────────
  const workPosts = [
    { id: "C1", label: "Déchargement + déballage",   atelier: "SIAL" as const, capacityMinDay: 1620, defaultOperators: ["Laurent", "Julien", "Apprenti"] },
    { id: "C2", label: "Préparation barres",          atelier: "SIAL" as const, capacityMinDay: 1620, defaultOperators: ["Laurent", "Julien", "Apprenti"] },
    { id: "C3", label: "Coupe LMT 65",               atelier: "SIAL" as const, capacityMinDay: 1620, defaultOperators: ["Laurent", "Julien", "Apprenti"] },
    { id: "C4", label: "Coupe double tête",           atelier: "SIAL" as const, capacityMinDay: 540,  defaultOperators: ["Julien"] },
    { id: "C5", label: "Coupe renfort acier",         atelier: "SIAL" as const, capacityMinDay: 540,  defaultOperators: ["Laurent"] },
    { id: "C6", label: "Soudure PVC",                 atelier: "SIAL" as const, capacityMinDay: 540,  defaultOperators: ["Julien"] },
    // SIAL Montage Coulissants/Galandages/Portes
    { id: "M1", label: "Dormants coulissants",        atelier: "SIAL" as const, capacityMinDay: 1080, defaultOperators: ["Alain", "Jean-Pierre", "Michel"] },
    { id: "M2", label: "Dormants galandage",          atelier: "SIAL" as const, capacityMinDay: 1080, defaultOperators: ["Alain", "Jean-Pierre", "Michel"] },
    { id: "M3", label: "Portes ALU",                  atelier: "SIAL" as const, capacityMinDay: 1080, defaultOperators: ["Alain", "Jean-Pierre", "Michel"] },
    // SIAL Montage Frappes
    { id: "F1", label: "Dormants frappe ALU",         atelier: "SIAL" as const, capacityMinDay: 1080, defaultOperators: ["Alain", "Jean-Pierre", "Michel"] },
    { id: "F2", label: "Ouvrants frappe + ferrage",   atelier: "SIAL" as const, capacityMinDay: 1080, defaultOperators: ["Alain", "Jean-Pierre", "Michel"] },
    { id: "F3", label: "Mise en bois + contrôle",     atelier: "SIAL" as const, capacityMinDay: 1080, defaultOperators: ["Alain", "Jean-Pierre", "Michel"] },
    // SIAL Vitrage & Expédition
    { id: "V1", label: "Vitrage menuiserie",          atelier: "SIAL" as const, capacityMinDay: 480,  defaultOperators: ["Jean-François", "Momo", "Guillaume"] },
    { id: "V2", label: "Emballage + expédition",      atelier: "SIAL" as const, capacityMinDay: 480,  defaultOperators: ["Jean-François", "Laurent"] },
    // ISULA — 3 jours/semaine : lundi, mardi, jeudi
    { id: "I1", label: "Réception verre",             atelier: "ISULA" as const, capacityMinDay: 840,  defaultOperators: ["Momo", "Guillaume"] },
    { id: "I2", label: "Coupe float/feuilleté/formes",atelier: "ISULA" as const, capacityMinDay: 840,  defaultOperators: ["Momo", "Guillaume"] },
    { id: "I3", label: "Coupe intercalaire",          atelier: "ISULA" as const, capacityMinDay: 420,  defaultOperators: ["Momo"] },
    { id: "I4", label: "Butyle",                      atelier: "ISULA" as const, capacityMinDay: 420,  defaultOperators: ["Momo"] },
    { id: "I5", label: "Assemblage",                  atelier: "ISULA" as const, capacityMinDay: 840,  defaultOperators: ["Momo", "Guillaume"] },
    { id: "I6", label: "Gaz + scellement",            atelier: "ISULA" as const, capacityMinDay: 840,  defaultOperators: ["Momo", "Guillaume"] },
    { id: "I7", label: "Contrôle final CEKAL",        atelier: "ISULA" as const, capacityMinDay: 420,  defaultOperators: ["Guillaume"] },
    { id: "I8", label: "Sortie chaîne + rangement",   atelier: "ISULA" as const, capacityMinDay: 1050, defaultOperators: ["Momo", "Guillaume", "Bruno"] },
  ];

  for (const wp of workPosts) {
    await prisma.workPost.upsert({
      where: { id: wp.id },
      update: { label: wp.label, atelier: wp.atelier, capacityMinDay: wp.capacityMinDay, defaultOperators: wp.defaultOperators },
      create: wp,
    });
  }

  // ── Opérateurs ──────────────────────────────────────────────────────────
  await prisma.operator.deleteMany();
  await prisma.operator.createMany({
    data: [
      { name: "Laurent",      weekHours: 39, posts: ["C1","C2","C3","C5","V2"] },
      { name: "Julien",       weekHours: 39, posts: ["C1","C2","C3","C4","C6"] },
      { name: "Alain",        weekHours: 30, posts: ["M1","M2","M3","F1","F2","F3"] },
      { name: "Jean-Pierre",  weekHours: 36, posts: ["M1","M2","M3","F1","F2","F3"] },
      { name: "Michel",       weekHours: 36, posts: ["M1","M2","M3","F1","F2","F3"] },
      { name: "Jean-François",weekHours: 39, posts: ["V1","V2"] },
      { name: "Guillaume",    weekHours: 39, posts: ["I1","I2","I5","I6","I7","I8","V1"] },
      { name: "Momo",         weekHours: 39, posts: ["I1","I2","I3","I4","I5","I6","I8","V1"] },
      { name: "Apprenti",     weekHours: 35, posts: ["C1","C2","C3"] },
    ],
  });

  // ── Stocks tampons (nouveau modèle BufferStock) ──────────────────────────
  // Un enregistrement global par type (orderId = null)
  const bufferDefs = [
    { type: "PROFILES_COUPES"     as const, quantity: 2,   unit: "chariots" },
    { type: "VITRAGES_ISULA"      as const, quantity: 3,   unit: "chariots" },
    { type: "OUVRANTS_VITRES"     as const, quantity: 4,   unit: "palettes" },
    { type: "ACCESSOIRES_PREPARES"as const, quantity: 3,   unit: "jours" },
    { type: "PROFILES_BRUTS"      as const, quantity: 3,   unit: "semaines" },
    { type: "VERRE_BRUT_ISULA"    as const, quantity: 250, unit: "m²" },
  ];

  for (const bs of bufferDefs) {
    const existing = await prisma.bufferStock.findFirst({ where: { type: bs.type, orderId: null } });
    if (!existing) {
      await prisma.bufferStock.create({ data: { ...bs, orderId: null } });
    }
  }

  console.log("✓ Seed OK — 2 users · 22 postes de travail · 9 opérateurs · 6 stocks tampons");
}

main().catch(console.error).finally(() => prisma.$disconnect());
