import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const generatedEnums = readFileSync(
  path.join(root, "src/generated/prisma/enums.ts"),
  "utf8"
);
const generatedCustomer = readFileSync(
  path.join(root, "src/generated/prisma/models/Customer.ts"),
  "utf8"
);

describe("客户生命周期生成客户端一致性", () => {
  it("schema 中的生命周期枚举与字段已生成到 Prisma 客户端", () => {
    expect(schema).toMatch(
      /enum CustomerLifecycle\s*\{[\s\S]*?LEAD[\s\S]*?WON[\s\S]*?RETAINED[\s\S]*?CHURNED/
    );
    expect(schema).toMatch(/lifecycle\s+CustomerLifecycle\s+@default\(LEAD\)/);

    expect(generatedEnums).toContain("export const CustomerLifecycle");
    expect(generatedEnums).toMatch(/LEAD:\s*['"]LEAD['"]/);
    expect(generatedEnums).toMatch(/WON:\s*['"]WON['"]/);
    expect(generatedEnums).toMatch(/RETAINED:\s*['"]RETAINED['"]/);
    expect(generatedEnums).toMatch(/CHURNED:\s*['"]CHURNED['"]/);
    expect(generatedCustomer).toMatch(
      /lifecycle:\s*\$Enums\.CustomerLifecycle/
    );
  });
});
