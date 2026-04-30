import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ensureWorkPosts } from "@/lib/work-posts-server";

// Mapping postId → phase de compétence
function postIdToPhase(pid: string): string | null {
  if (pid.startsWith("C")) return "coupe";
  if (["M1", "M2", "V2"].includes(pid)) return "coulissant";
  if (["F1", "F2", "F3", "M3", "V1"].includes(pid)) return "frappes";
  if (pid === "MHS") return "hors_std";
  if (pid.startsWith("V")) return "vitrage";
  if (pid.startsWith("I")) return "isula";
  if (pid.startsWith("L") || ["LIVR", "CHRG", "DECH", "RANG"].includes(pid)) return "logistique";
  return null;
}

// GET /api/operators — liste tous les opérateurs avec leurs compétences.
// Format enrichi : ajoute vendrediOff (déduit de workingDays) et
// competences (set de phases déduit des skills) pour servir de source
// unique aux vues qui utilisaient auparavant la constante EQUIPE.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  try {
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

    const enriched = operators.map(op => {
      const wd = Array.isArray(op.workingDays) ? op.workingDays : [0, 1, 2, 3, 4];
      const vendrediOff = !wd.includes(4);
      const competences = new Set<string>();
      for (const s of op.skills) {
        if (!s.workPostId || s.level <= 0) continue;
        const phase = postIdToPhase(s.workPostId);
        if (phase) competences.add(phase);
      }
      return {
        ...op,
        vendrediOff,
        competences: Array.from(competences),
      };
    });

    return NextResponse.json(enriched);
  } catch {
    return NextResponse.json({ error: "Erreur chargement opérateurs" }, { status: 500 });
  }
}
