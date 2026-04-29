import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAllLearnedTimes } from "@/lib/cerveau";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  try {
    const learned = await getAllLearnedTimes();
    return NextResponse.json(learned);
  } catch (e: unknown) {
    console.error("GET /api/cerveau/learned-times error:", e instanceof Error ? e.message : e);
    return NextResponse.json({}, { status: 200 });
  }
}
