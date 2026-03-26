import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hash1 = await bcrypt.hash("Vista2026!", 10);
  const hash2 = await bcrypt.hash("Vista2026!", 10);

  await prisma.user.upsert({
    where: { email: "marianne@groupe-vista.fr" },
    update: {},
    create: { email: "marianne@groupe-vista.fr", password: hash1, nom: "Marianne", role: "ADMIN" },
  });

  await prisma.user.upsert({
    where: { email: "angejoseph@groupe-vista.fr" },
    update: {},
    create: { email: "angejoseph@groupe-vista.fr", password: hash2, nom: "Ange-Joseph", role: "OPERATEUR" },
  });

  // Init stocks tampons
  const STOCKS_IDS = ["profils_coupes", "vitrages_isula", "ouvrants_vitres", "accessoires_prep", "profils_bruts", "verre_brut"];
  for (const id of STOCKS_IDS) {
    await prisma.stockTampon.upsert({
      where: { id },
      update: {},
      create: { id, actuel: 0 },
    });
  }

  console.log("Seed OK — 2 users + 6 stocks");
}

main().catch(console.error).finally(() => prisma.$disconnect());
