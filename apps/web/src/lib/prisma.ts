import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://chatterbox:chatterbox@localhost:5432/chatterbox";

const adapter = new PrismaPg({ connectionString: databaseUrl });

const globalForPrisma = globalThis as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
