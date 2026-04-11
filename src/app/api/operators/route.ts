import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// ── WorkPosts à garantir en base ─────────────────────────────────────────────
const REQUIRED_POSTS: Array<{ id: string; label: string; atelier: "SIAL" | "ISULA"; capacityMinDay: number }> = [
  { id: "C1", label: "Déchargement + déballage",    atelier: "SIAL", capacityMinDay: 1620 },
  { id: "C2", label: "Préparation barres",           atelier: "SIAL", capacityMinDay: 1620 },
  { id: "C3", label: "Coupe LMT 65",                atelier: "SIAL", capacityMinDay: 1620 },
  { id: "C4", label: "Coupe double tête",            atelier: "SIAL", capacityMinDay: 540 },
  { id: "C5", label: "Coupe renfort acier",          atelier: "SIAL", capacityMinDay: 540 },
  { id: "C6", label: "Soudure PVC",                  atelier: "SIAL", capacityMinDay: 540 },
  { id: "M1", label: "Dormants coulissants",         atelier: "SIAL", capacityMinDay: 1080 },
  { id: "M2", label: "Dormants galandage",           atelier: "SIAL", capacityMinDay: 1080 },
  { id: "M3", label: "Portes ALU",                   atelier: "SIAL", capacityMinDay: 1080 },
  { id: "F1", label: "Dormants frappe ALU",          atelier: "SIAL", capacityMinDay: 1080 },
  { id: "F2", label: "Ouvrants frappe + ferrage",    atelier: "SIAL", capacityMinDay: 1080 },
  { id: "F3", label: "Mise en bois + contrôle",      atelier: "SIAL", capacityMinDay: 1080 },
  { id: "MHS", label: "Montage Hors Standard",       atelier: "SIAL", capacityMinDay: 480 },
  { id: "AUT", label: "Autre",                       atelier: "SIAL", capacityMinDay: 480 },
  { id: "LIVR", label: "Livraison",                  atelier: "SIAL", capacityMinDay: 480 },
  { id: "CHRG", label: "Chargement",                 atelier: "SIAL", capacityMinDay: 480 },
  { id: "DECH", label: "Déchargement",               atelier: "SIAL", capacityMinDay: 480 },
  { id: "RANG", label: "Rangement",                  atelier: "SIAL", capacityMinDay: 480 },
  { id: "NETT", label: "Nettoyage",                  atelier: "SIAL", capacityMinDay: 480 },
  { id: "MAINT", label: "Maintenance",               atelier: "SIAL", capacityMinDay: 480 },
  { id: "FORM", label: "Formation",                  atelier: "SIAL", capacityMinDay: 480 },
  { id: "SUPERV", label: "Supervision",              atelier: "SIAL", capacityMinDay: 480 },
  { id: "V1", label: "Vitrage Frappe",               atelier: "SIAL", capacityMinDay: 480 },
  { id: "V2", label: "Vitrage Coulissant/Galandage", atelier: "SIAL", capacityMinDay: 480 },
  { id: "V3", label: "Emballage",                    atelier: "SIAL", capacityMinDay: 480 },
  { id: "L1", label: "Déchargement Fournisseur",     atelier: "SIAL", capacityMinDay: 480 },
  { id: "L2", label: "Rangement Stock Profilés",     atelier: "SIAL", capacityMinDay: 480 },
  { id: "L3", label: "Rangement Stock Accessoires",  atelier: "SIAL", capacityMinDay: 480 },
  { id: "L4", label: "Prépa Accessoires Fabrication", atelier: "SIAL", capacityMinDay: 480 },
  { id: "L5", label: "Prépa Accessoires Livraison",  atelier: "SIAL", capacityMinDay: 480 },
  { id: "L6", label: "Réalisation des palettes",     atelier: "SIAL", capacityMinDay: 480 },
  { id: "L7", label: "Chargement des palettes",      atelier: "SIAL", capacityMinDay: 480 },
  { id: "I1", label: "Réception verre",              atelier: "ISULA", capacityMinDay: 840 },
  { id: "I2", label: "Coupe float/feuilleté/formes", atelier: "ISULA", capacityMinDay: 840 },
  { id: "I3", label: "Coupe intercalaire",           atelier: "ISULA", capacityMinDay: 420 },
  { id: "I4", label: "Butyle",                       atelier: "ISULA", capacityMinDay: 420 },
  { id: "I5", label: "Assemblage",                   atelier: "ISULA", capacityMinDay: 840 },
  { id: "I6", label: "Gaz + scellement",             atelier: "ISULA", capacityMinDay: 840 },
  { id: "I7", label: "Contrôle final CEKAL",         atelier: "ISULA", capacityMinDay: 420 },
  { id: "I8", label: "Sortie chaîne + rangement",    atelier: "ISULA", capacityMinDay: 1050 },
];

let postsEnsured = false;

async function ensureWorkPosts() {
  if (postsEnsured) return;
  try {
    const existing = await prisma.workPost.findMany({ select: { id: true } });
    const existingIds = new Set(existing.map((p) => p.id));
    const missing = REQUIRED_POSTS.filter((p) => !existingIds.has(p.id));
    if (missing.length > 0) {
      for (const wp of missing) {
        await prisma.workPost.upsert({
          where: { id: wp.id },
          update: { label: wp.label, atelier: wp.atelier, capacityMinDay: wp.capacityMinDay },
          create: { ...wp, defaultOperators: [] },
        });
      }
    }
    postsEnsured = true;
  } catch {
    // Silently continue — posts will be created on next call
  }
}

// GET /api/operators — liste tous les opérateurs avec leurs compétences
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  await ensureWorkPosts();

  const operators = await prisma.operator.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: {
      skills: {
        include: { workPost: { select: { id: true, label: true, atelier: true } } },
      },
    },
  });

  return NextResponse.json(operators);
}
