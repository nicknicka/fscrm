import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma 客户端单例。
 *
 * Prisma 7 使用驱动适配器（driver adapter）直连数据库：这里用 `PrismaPg`
 * （基于 `pg`）连接 Postgres，连接串来自环境变量 `DATABASE_URL`。
 *
 * 通过 globalThis 缓存实例，避免 Next.js 开发模式热重载时重复创建连接池。
 */

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
