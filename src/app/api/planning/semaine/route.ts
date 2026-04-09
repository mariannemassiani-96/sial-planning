import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ISULA_ACTIVE_DAYS } from "@/lib/planning-constants";

const DAY_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const atelierParam = searchParams.get("atelier") ?? "SIAL";
  const atelier = atelierParam === "ISULA" ? ("ISULA" as const) : ("SIAL" as const);

  const startParam = searchParams.get("start");
  const weekStart = startParam
    ? (() => { const d = new Date(startParam + "T00:00:00.000Z"); d.setHours(0,0,0,0); return d; })()
    : getMonday(new Date());

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 4);
  weekEnd.setHours(23, 59, 59, 999);

  const workPosts = await prisma.workPost.findMany({
    where: { atelier },
    orderBy: { id: "asc" },
  });

  const tasks = await prisma.productionTask.findMany({
    where: {
      workPostId: { in: workPosts.map((p) => p.id) },
      scheduledDate: { gte: weekStart, lte: weekEnd },
    },
    include: {
      fabItem: { include: { fabOrder: true } },
      workPost: true,
      assignments: { include: { operator: true } },
      qcChecks: true,
    },
    orderBy: { sortOrder: "asc" },
  });

  const days = Array.from({ length: 5 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    const dateStr = date.toISOString().split("T")[0];
    const dayOfWeek = date.getDay();
    const isIsulaActive = atelier === "SIAL" || ISULA_ACTIVE_DAYS.includes(dayOfWeek);

    const dayTasks = tasks.filter(
      (t) => t.scheduledDate && t.scheduledDate.toISOString().split("T")[0] === dateStr
    );

    const posts = workPosts.map((post) => {
      const postTasks = dayTasks.filter((t) => t.workPostId === post.id);
      const minutesPlanified = postTasks.reduce((s, t) => s + t.estimatedMinutes, 0);
      const chargePercent =
        post.capacityMinDay > 0
          ? Math.round((minutesPlanified / post.capacityMinDay) * 100)
          : 0;
      const hasBlockingSpecial = postTasks.some((t) => t.fabItem.isSpecial && t.isBlocking);

      return {
        postId: post.id,
        postLabel: post.label,
        capacityMinDay: post.capacityMinDay,
        minutesPlanified,
        chargePercent,
        hasBlockingSpecial,
        tasks: postTasks,
      };
    });

    return {
      date: dateStr,
      dayName: DAY_NAMES[i],
      dayIndex: i,
      isIsulaActive,
      posts,
    };
  });

  return NextResponse.json({
    weekStart: weekStart.toISOString().split("T")[0],
    weekEnd: weekEnd.toISOString().split("T")[0],
    atelier,
    days,
  });
}
