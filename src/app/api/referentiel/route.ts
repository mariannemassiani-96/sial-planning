import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

const KEY = "__referentiel_temps__";
const KEY_TYPES = "__referentiel_types__";

// Temps unitaires par défaut (minutes)
const DEFAULTS: Record<string, number> = {
  coupe_profil:           1,
  coupe_double_tete:      1.5,
  coupe_renfort:          2,
  soudure_pvc:            5,
  poincon_alu:            10,
  prep_dormant:           5,
  pose_rails_accessoires: 10,
  montage_dormant_coul:   30,
  montage_dormant_gland:  60,
  ferrage_ouvrant:        10,
  mise_en_bois:           5,
  vitrage_frappe:         10,
  vitrage_coul_gland:     20,
  controle:               2,
  prep_accessoires_fab:   5,
  emballage:              5,
  palette:                5,
  chargement:             3,
};

// GET /api/referentiel — retourne les temps unitaires (base + défauts)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  try {
    const rec = await prisma.planningPoste.findUnique({ where: { semaine: KEY } });
    const saved = (rec?.plan ?? {}) as Record<string, number>;
    const unitaires: Record<string, number> = { ...DEFAULTS, ...saved };

    const recTypes = await prisma.planningPoste.findUnique({ where: { semaine: KEY_TYPES } });
    const typeOverrides = (recTypes?.plan ?? {}) as Record<string, Record<string, number>>;

    return NextResponse.json({ unitaires, typeOverrides });
  } catch {
    return NextResponse.json({ unitaires: DEFAULTS, typeOverrides: {} });
  }
}

// PUT /api/referentiel — met à jour un ou plusieurs temps unitaires
// Body: { coupe_profil: 1.5, soudure_pvc: 6, ... }
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const updates = await req.json();

  try {
    const rec = await prisma.planningPoste.findUnique({ where: { semaine: KEY } });
    const current = (rec?.plan ?? {}) as Record<string, number>;
    const merged = { ...current };

    for (const [key, val] of Object.entries(updates)) {
      const v = parseFloat(String(val));
      if (!isNaN(v) && v >= 0) merged[key] = v;
    }

    await prisma.planningPoste.upsert({
      where: { semaine: KEY },
      update: { plan: merged },
      create: { semaine: KEY, plan: merged },
    });

    return NextResponse.json({ ...DEFAULTS, ...merged });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── Overrides par type de menuiserie ─────────────────────────────────────────
// GET /api/referentiel?types=1 → { "ob1_pvc": { "C3": 12 }, ... }
// PATCH /api/referentiel → { typeId: "ob1_pvc", postId: "C3", min: 12 }

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { typeId, postId, min } = await req.json();
  if (!typeId || !postId) return NextResponse.json({ error: "typeId et postId requis" }, { status: 400 });

  try {
    const rec = await prisma.planningPoste.findUnique({ where: { semaine: KEY_TYPES } });
    const all = (rec?.plan ?? {}) as Record<string, Record<string, number>>;
    if (!all[typeId]) all[typeId] = {};

    const v = parseFloat(String(min));
    if (isNaN(v) || v < 0) {
      delete all[typeId][postId];
      if (Object.keys(all[typeId]).length === 0) delete all[typeId];
    } else {
      all[typeId][postId] = v;
    }

    await prisma.planningPoste.upsert({
      where: { semaine: KEY_TYPES },
      update: { plan: all },
      create: { semaine: KEY_TYPES, plan: all },
    });

    return NextResponse.json({ ok: true, overrides: all });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
