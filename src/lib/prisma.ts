import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function getUrl(): string | undefined {
  const base = process.env.DATABASE_URL;
  if (!base) return undefined;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}connection_limit=1&pool_timeout=5&connect_timeout=5&socket_timeout=10`;
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasources: { db: { url: getUrl() } },
});

// Cache en production aussi — essentiel sur Vercel serverless
globalForPrisma.prisma = prisma;

export default prisma;
