import { describe, expect, it } from "vitest";

/**
 * Prisma + Postgres 集成测试。
 *
 * 仅在配置了 DATABASE_URL 时运行（动态导入 client，避免无数据库环境下
 * 构造驱动适配器报错）。用于验证数据层能真实连通并执行基本操作。
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe("prisma client", () => {
  it.runIf(hasDatabase)(
    "连接数据库并执行创建 / 查询 / 删除",
    async () => {
      const { prisma } = await import("./client");

      const openId = `smoke_${Date.now()}`;
      const user = await prisma.user.create({
        data: { name: "冒烟测试用户", feishuOpenId: openId },
      });
      expect(user.name).toBe("冒烟测试用户");
      expect(user.feishuOpenId).toBe(openId);

      const found = await prisma.user.findUnique({
        where: { feishuOpenId: openId },
      });
      expect(found?.id).toBe(user.id);

      // 清理
      await prisma.user.delete({ where: { id: user.id } });
    },
    20000
  );
});
