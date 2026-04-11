import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  BUFFER_THRESHOLDS,
  ISULA_ACTIVE_DAYS,
  POSTS_BY_MODE,
  ATTENTE_VITRAGE_SEUIL_JOURS,
} from "@/lib/planning-constants";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const today = new Date();
  const date = todayStr();
  const dayOfWeek = today.getDay();
  const isIsulaDay = ISULA_ACTIVE_DAYS.includes(dayOfWeek);

  // Mode du jour
  const dayConfig = await prisma.dayConfig.findUnique({ where: { date } });
  const mode = (dayConfig?.mode ?? "FRAPPES") as "COULISSANTS" | "FRAPPES";

  // Postes SIAL actifs selon le mode
  const sialPostIds = POSTS_BY_MODE[mode];

  // Fenêtre du jour (UTC)
  const startOfDay = new Date(date + "T00:00:00.000Z");
  const endOfDay = new Date(date + "T23:59:59.999Z");

  // ── Tâches SIAL d'aujourd'hui ──────────────────────────────────────────
  const sialTasksRaw = await prisma.productionTask.findMany({
    where: {
      workPostId: { in: sialPostIds },
      scheduledDate: { gte: startOfDay, lte: endOfDay },
      status: { in: ["PENDING", "IN_PROGRESS"] },
    },
    include: {
      fabItem: { include: { fabOrder: true } },
      workPost: true,
      assignments: { include: { operator: true } },
    },
    orderBy: [{ workPostId: "asc" }, { sortOrder: "asc" }],
  });

  // ── Tâches ISULA d'aujourd'hui ─────────────────────────────────────────
  let isulaTasksRaw: typeof sialTasksRaw = [];
  if (isIsulaDay) {
    isulaTasksRaw = await prisma.productionTask.findMany({
      where: {
        workPost: { atelier: "ISULA" },
        scheduledDate: { gte: startOfDay, lte: endOfDay },
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
      include: {
        fabItem: { include: { fabOrder: true } },
        workPost: true,
        assignments: { include: { operator: true } },
      },
      orderBy: [{ workPostId: "asc" }, { sortOrder: "asc" }],
    });
  }

  // ── Postes avec leurs tâches ───────────────────────────────────────────
  const sialPosts = await prisma.workPost.findMany({
    where: { id: { in: sialPostIds }, atelier: "SIAL" },
    orderBy: { id: "asc" },
  });

  const isulaPosts = isIsulaDay
    ? await prisma.workPost.findMany({ where: { atelier: "ISULA" }, orderBy: { id: "asc" } })
    : [];

  const sialByPost = sialPosts.map((post) => ({
    ...post,
    tasks: sialTasksRaw.filter((t) => t.workPostId === post.id),
  }));

  const isulaByPost = isulaPosts.map((post) => ({
    ...post,
    tasks: isulaTasksRaw.filter((t) => t.workPostId === post.id),
  }));

  // ── Alertes : commandes en retard ─────────────────────────────────────
  const lateOrders = await prisma.order.findMany({
    where: {
      deliveryDate: { lt: today },
      status: { notIn: ["LIVRE", "SUSPENDU"] },
    },
    orderBy: { deliveryDate: "asc" },
  });

  // ── Alertes : châssis spéciaux cette semaine ──────────────────────────
  const mon = new Date(today);
  mon.setDate(today.getDate() - ((today.getDay() + 6) % 7)); // lundi
  const fri = new Date(mon);
  fri.setDate(mon.getDate() + 4);

  const specialTasks = await prisma.productionTask.findMany({
    where: {
      scheduledDate: { gte: mon, lte: fri },
      fabItem: { isSpecial: true },
      status: { in: ["PENDING", "IN_PROGRESS"] },
    },
    include: { fabItem: { include: { fabOrder: true } }, workPost: true },
    orderBy: { scheduledDate: "asc" },
  });

  // ── Alertes : ATTENTE_VITRAGE > seuil ─────────────────────────────────
  const seuilMs = ATTENTE_VITRAGE_SEUIL_JOURS * 86400000;
  const attenteVitrageOrders = await prisma.order.findMany({
    where: { status: "ATTENTE_VITRAGE" },
    orderBy: { updatedAt: "asc" },
  });

  // ── Stocks tampons globaux (orderId = null) ────────────────────────────
  const bufferStocks = await prisma.bufferStock.findMany({
    where: { orderId: null },
  });

  const lowStocks = bufferStocks
    .map((bs) => {
      const t = BUFFER_THRESHOLDS[bs.type];
      return t ? { ...bs, ...t, isLow: bs.quantity < t.min, isCritical: bs.quantity === 0 } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x && x.isLow);

  // ── Prêt à livrer ─────────────────────────────────────────────────────
  const readyToDeliver = await prisma.order.findMany({
    where: { status: "PRET_LIVRAISON" },
    orderBy: { deliveryDate: "asc" },
  });

  return NextResponse.json({
    mode,
    date,
    isIsulaDay,
    dayOfWeek,
    sialPosts: sialByPost,
    isulaPosts: isulaByPost,
    bufferStocks: bufferStocks.map((bs) => {
      const t = BUFFER_THRESHOLDS[bs.type];
      return { ...bs, ...t };
    }),
    alerts: {
      lateOrders: lateOrders.map((o) => ({
        id: o.id,
        refChantier: o.refChantier,
        clientName: o.clientName,
        refProF2: o.refProF2,
        deliveryDate: o.deliveryDate,
        daysLate: Math.floor((today.getTime() - o.deliveryDate.getTime()) / 86400000),
      })),
      specialsThisWeek: specialTasks.map((t) => ({
        taskId: t.id,
        label: t.label,
        workPostId: t.workPostId,
        workPostLabel: t.workPost.label,
        estimatedMinutes: t.estimatedMinutes,
        scheduledDate: t.scheduledDate,
        orderId: t.fabItem.orderId,
        refChantier: t.fabItem.fabOrder.refChantier,
        clientName: t.fabItem.fabOrder.clientName,
      })),
      attenteVitrage: attenteVitrageOrders
        .filter((o) => Date.now() - o.updatedAt.getTime() > seuilMs)
        .map((o) => ({
          id: o.id,
          refChantier: o.refChantier,
          clientName: o.clientName,
          waitDays: Math.floor((Date.now() - o.updatedAt.getTime()) / 86400000),
        })),
      lowStocks,
    },
    readyToDeliver: readyToDeliver.map((o) => ({
      id: o.id,
      refChantier: o.refChantier,
      clientName: o.clientName,
      refProF2: o.refProF2,
      deliveryDate: o.deliveryDate,
    })),
  });
}
