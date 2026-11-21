import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const generatedEnums = readFileSync(
  path.join(root, "src/generated/prisma/enums.ts"),
  "utf8"
);
const generatedClient = readFileSync(
  path.join(root, "src/generated/prisma/client.ts"),
  "utf8"
);
const generatedOrder = readFileSync(
  path.join(root, "src/generated/prisma/models/Order.ts"),
  "utf8"
);

describe("订单生成客户端一致性", () => {
  it("schema 中的订单枚举、模型与三条来源关联已生成到 Prisma 客户端", () => {
    expect(schema).toMatch(
      /enum OrderStatus\s*\{[\s\S]*?PENDING[\s\S]*?FULFILLING[\s\S]*?COMPLETED[\s\S]*?CANCELLED/
    );
    expect(schema).toMatch(/model Order\s*\{[\s\S]*?status\s+OrderStatus/);
    expect(schema).toMatch(/sourceContractId\s+String\s+@unique/);
    expect(schema).toMatch(/sourceContract\s+Contract/);

    expect(generatedEnums).toContain("export const OrderStatus");
    expect(generatedEnums).toMatch(/PENDING:\s*['"]PENDING['"]/);
    expect(generatedEnums).toMatch(/FULFILLING:\s*['"]FULFILLING['"]/);
    expect(generatedEnums).toMatch(/COMPLETED:\s*['"]COMPLETED['"]/);
    expect(generatedEnums).toMatch(/CANCELLED:\s*['"]CANCELLED['"]/);
    expect(generatedClient).toMatch(/export type Order\s*=/);
    expect(generatedOrder).toMatch(/sourceContractId:\s*string/);
    expect(generatedOrder).toMatch(
      /sourceContract:\s*Prisma\.ContractCreateNestedOneWithoutOrdersInput/
    );
  });
});
