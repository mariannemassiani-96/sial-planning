import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ensureWorkPosts } from "@/lib/work-posts-server";
import { WORK_POSTS } from "@/lib/work-posts";

// GET /api/posts — renvoie la liste des postes de travail enrichie.
// Source de vérité = définition TS (lib/work-posts.ts) ; la BDD est
// utilisée pour ajouter les `defaultOperators` qui peuvent être édités.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  try {
    await ensureWorkPosts();
    const dbPosts = await prisma.workPost.findMany({
      select: { id: true, defaultOperators: true },
    });
    const dbMap = new Map(dbPosts.map(p => [p.id, p.defaultOperators]));

    const enriched = WORK_POSTS.map(p => ({
      ...p,
      defaultOperators: dbMap.get(p.id) || [],
    }));
    return NextResponse.json(enriched);
  } catch (e: unknown) {
    console.error("GET /api/posts error:", e instanceof Error ? e.message : e);
    // Fallback : on renvoie quand même la définition TS pour ne pas bloquer l'UI.
    return NextResponse.json(WORK_POSTS, { status: 200 });
  }
}
