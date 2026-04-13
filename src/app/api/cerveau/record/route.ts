import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { recordTaskCompletion } from "@/lib/cerveau";

interface RecordBody {
  commandeId: string;
  typeId: string;
  poste: string;
  operatorIds: string[];
  estimatedMinutes: number;
  actualMinutes: number;
  date: string;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as RecordBody;

    // Validate required fields
    const requiredFields: (keyof RecordBody)[] = [
      "commandeId",
      "typeId",
      "poste",
      "operatorIds",
      "estimatedMinutes",
      "actualMinutes",
      "date",
    ];

    for (const field of requiredFields) {
      if (body[field] === undefined || body[field] === null) {
        return NextResponse.json(
          { error: `Champ requis manquant: ${field}` },
          { status: 400 }
        );
      }
    }

    if (!Array.isArray(body.operatorIds) || body.operatorIds.length === 0) {
      return NextResponse.json(
        { error: "operatorIds doit être un tableau non vide" },
        { status: 400 }
      );
    }

    if (typeof body.estimatedMinutes !== "number" || body.estimatedMinutes < 0) {
      return NextResponse.json(
        { error: "estimatedMinutes doit être un nombre positif" },
        { status: 400 }
      );
    }

    if (typeof body.actualMinutes !== "number" || body.actualMinutes < 0) {
      return NextResponse.json(
        { error: "actualMinutes doit être un nombre positif" },
        { status: 400 }
      );
    }

    const result = await recordTaskCompletion(body);

    return NextResponse.json({ ok: true, recorded: result });
  } catch (error) {
    console.error("[cerveau/record] Erreur enregistrement métrique:", error);
    return NextResponse.json(
      {
        error: "Erreur lors de l'enregistrement de la métrique",
        details: error instanceof Error ? error.message : "Erreur inconnue",
      },
      { status: 500 }
    );
  }
}
