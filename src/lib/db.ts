import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Neon over its serverless driver (WebSocket) instead of a raw TCP
// connection: works on Vercel and from networks that block Postgres' 5432.
neonConfig.webSocketConstructor = ws;

// Some networks break the driver's WebSocket TLS but pass plain HTTPS;
// NEON_FETCH_MODE=1 (set only in the local .env, never on Vercel) routes
// pool queries through Neon's HTTPS endpoint instead. Fetch mode has no
// interactive transactions, which is why production stays on WebSocket.
if (process.env.NEON_FETCH_MODE === "1") {
  neonConfig.poolQueryViaFetch = true;
}

const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL,
});

// Single Prisma client across hot-reloads in dev.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
