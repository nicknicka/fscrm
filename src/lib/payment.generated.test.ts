import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(path.join(root, relativePath), "utf8");

describe("回款生成客户端一致性", () => {
  it("schema 中的回款模型、订单关联与金额/到账时间字段已生成到 Prisma 客户端", () => {
    const schema = read("prisma/schema.prisma");
    const client = read("src/generated/prisma/client.ts");
    const order = read("src/generated/prisma/models/Order.ts");
    const payment = read("src/generated/prisma/models/Payment.ts");
    const generatedClass = read("src/generated/prisma/internal/class.ts");

    expect(schema).toMatch(
      /model Payment\s*\{[\s\S]*?orderId\s+String[\s\S]*?order\s+Order[\s\S]*?amount\s+Float[\s\S]*?receivedAt\s+DateTime/
    );
    expect(schema).toMatch(/model Order\s*\{[\s\S]*?payments\s+Payment\[\]/);

    expect(client).toMatch(/export type Payment\s*=/);
    expect(order).toMatch(/payments:\s*Prisma\.\$PaymentPayload<ExtArgs>\[\]/);
    expect(payment).toMatch(/amount:\s*number/);
    expect(payment).toMatch(/receivedAt:\s*Date/);
    expect(payment).toMatch(/orderId:\s*string/);
    expect(generatedClass).toMatch(/get payment\(\):\s*Prisma\.PaymentDelegate/);
  });
});
