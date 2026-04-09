import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Stored as a single PlanningPoste-like row with semaine = "__competences__"
const KEY = "__competences__";

export async function GET() {
  try {
    const rec = await prisma.planningPoste.findUnique({ where: { semaine: KEY } });
    return NextResponse.json(rec?.plan ?? {});
  } catch {
    return NextResponse.json({});
  }
}

export async function PUT(req: Request) {
  const data = await req.json();
  try {
    await prisma.planningPoste.upsert({
      where: { semaine: KEY },
      update: { plan: data },
      create: { semaine: KEY, plan: data },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}
