import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasources: {
    db: {
      url: (() => {
        const base = process.env.DATABASE_URL;
        if (!base) return undefined;
        const sep = base.includes("?") ? "&" : "?";
        return `${base}${sep}connection_limit=2&pool_timeout=5&connect_timeout=5`;
      })(),
    },
  },
  log: [],
});

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
