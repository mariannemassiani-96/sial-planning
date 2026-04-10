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
    // SIAL Vitrage
    { id: "V1", label: "Vitrage Frappe",              atelier: "SIAL" as const, capacityMinDay: 480,  defaultOperators: ["Jean-François", "Michel"] },
    { id: "V2", label: "Vitrage Coulissant/Galandage",atelier: "SIAL" as const, capacityMinDay: 480,  defaultOperators: ["Jean-François", "Momo", "Guillaume"] },
    { id: "V3", label: "Emballage",                   atelier: "SIAL" as const, capacityMinDay: 480,  defaultOperators: ["Jean-François", "Laurent"] },
    // SIAL Logistique
    { id: "L1", label: "Déchargement Fournisseur",    atelier: "SIAL" as const, capacityMinDay: 480,  defaultOperators: ["Guillaume", "Laurent"] },
    { id: "L2", label: "Rangement Stock Profilés",    atelier: "SIAL" as const, capacityMinDay: 480,  defaultOperators: ["Guillaume"] },
    { id: "L3", label: "Rangement Stock Accessoires", atelier: "SIAL" as const, capacityMinDay: 480,  defaultOperators: ["Guillaume"] },
    { id: "L4", label: "Prépa Accessoires Fabrication",atelier: "SIAL" as const, capacityMinDay: 480, defaultOperators: ["Guillaume"] },
    { id: "L5", label: "Prépa Accessoires Livraison", atelier: "SIAL" as const, capacityMinDay: 480,  defaultOperators: ["Guillaume"] },
    { id: "L6", label: "Réalisation des palettes",    atelier: "SIAL" as const, capacityMinDay: 480,  defaultOperators: ["Guillaume", "Laurent"] },
    { id: "L7", label: "Chargement des palettes",     atelier: "SIAL" as const, capacityMinDay: 480,  defaultOperators: ["Guillaume", "Laurent"] },
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

  // ── Opérateurs (13 personnes) ─────────────────────────────────────────────
  await prisma.operatorSkill.deleteMany();
  await prisma.operator.deleteMany();
  await prisma.operator.createMany({
    data: [
      // 8h/jour sauf vendredi 7h → 39h/semaine
      { name: "Laurent",       weekHours: 39, posts: ["C1","C2","C3","C5","V3","L1","L6","L7"],             workingDays: [0,1,2,3,4], notes: "Prépa + coupe LMT + soudure PVC (seul) + soutien expédition · 8h L-J, 7h V" },
      { name: "Julien",        weekHours: 39, posts: ["C1","C2","C3","C4","C6"],                           workingDays: [0,1,2,3,4], notes: "Prépa + coupe LMT + coupe double tête (seul) · 8h L-J, 7h V" },
      { name: "Jean-François", weekHours: 39, posts: ["F1","F2","F3","M1","M2","M3","V1","V2","V3","C1","C2","C3"], workingDays: [0,1,2,3,4], notes: "Montage frappes · Polyvalent coulissant+vitrage+coupe · 8h L-J, 7h V" },
      { name: "Guillaume",     weekHours: 39, posts: ["I1","I2","I5","I6","I7","I8","V2","L1","L2","L3","L4","L5","L6","L7"], workingDays: [0,1,2,3,4], notes: "Réceptions · Rangement · Prépa accessoires · Chargements · 8h L-J, 7h V" },
      { name: "Momo",          weekHours: 39, posts: ["I1","I2","I3","I4","I5","I6","I8","V2"],           workingDays: [0,1,2,3,4], notes: "Opérateur ISULA A→Z · Remplace vitrage · 8h L-J, 7h V" },
      { name: "Bruno",         weekHours: 39, posts: ["I1","I2","I3","I4","I5","I6","I7","I8","F1","F2","F3","M1","M2","M3"], workingDays: [0,1,2,3,4], notes: "Responsable QC+procédures ISULA+SIAL · Supervision · 8h L-J, 7h V" },
      { name: "Francescu",     weekHours: 39, posts: ["F1","F2","F3","C1","C2","C3"],                     workingDays: [0,1,2,3,4], notes: "Montage frappes · Soutien coupe · 8h L-J, 7h V" },
      // Alain : pas de vendredi → 4 jours × 7.5h = 30h
      { name: "Alain",         weekHours: 30, posts: ["M1","M2","M3","F1","F2","F3"],                      workingDays: [0,1,2,3],   notes: "Montage dormants coulissant+galandage · Absent vendredi · 7h30 L-J" },
      // Jean-Pierre : vendredi AM seulement → 4×8h + 4h = 36h
      { name: "Jean-Pierre",   weekHours: 36, posts: ["M1","M2","M3","F1","F2","F3","V1","V2","C1","C2","C3"], workingDays: [0,1,2,3,4], notes: "Sur-mesure / Luxe / Hors-normes · Polyvalent tous postes · 8h L-J, vendredi matin seul (4h)" },
      // Michel : 7h/jour × 5j = 35h
      { name: "Michel",        weekHours: 35, posts: ["M1","M2","M3","F1","F2","F3","C1","C2","C3"],      workingDays: [0,1,2,3,4], notes: "Montage frappes · Polyvalent coulissant+soudure PVC · 7h/jour" },
      // Matéo, Kentin, Ali : 7h/jour × 5j = 35h
      { name: "Ali",           weekHours: 35, posts: ["I1","I2","I3","I4","I5","I6","I7","I8"],           workingDays: [0,1,2,3,4], notes: "Opérateur ISULA A→Z · 7h/jour" },
      { name: "Matéo",         weekHours: 35, posts: ["C1","C2","C3","C4","C5","C6"],                     workingDays: [0,1,2,3,4], notes: "Coupe · Apprenti avancé · 7h/jour" },
      { name: "Kentin",        weekHours: 35, posts: ["C1","C2","C3","F1","F2","F3"],                     workingDays: [0,1,2,3,4], notes: "Coupe + soutien montage frappes · 7h/jour" },
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

  console.log("✓ Seed OK — 2 users · 31 postes de travail · 13 opérateurs · 6 stocks tampons");
}

main().catch(console.error).finally(() => prisma.$disconnect());
