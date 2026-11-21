import { describe, expect, it, vi } from "vitest";

const configMock = vi.fn();

vi.mock("dotenv", () => ({ config: configMock }));

describe("命令行环境变量引导", () => {
  it("调用 dotenv 加载 .env.local，且在同一模块完成数据库客户端的构造", async () => {
    configMock.mockImplementation(() => {
      process.env.DATABASE_URL = "postgresql://from-dotenv/x";
    });
    delete process.env.DATABASE_URL;

    // Node/tsx 会先求值 env-bootstrap，再求值后续 import，和 CLI 入口顺序一致。
    const [{ prisma }, clientModule] = await Promise.all([
      import("../src/lib/db/client"),
      import("./env-bootstrap"),
    ]);

    expect(configMock).toHaveBeenCalledWith({ path: ".env.local" });
    expect(process.env.DATABASE_URL).toBe("postgresql://from-dotenv/x");
    expect(clientModule).toBeDefined();
    expect(prisma).toBeDefined();

    delete process.env.DATABASE_URL;
  });
});
