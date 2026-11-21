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
const generatedContract = readFileSync(
  path.join(root, "src/generated/prisma/models/Contract.ts"),
  "utf8"
);

describe("合同生成客户端一致性", () => {
  it("schema 中的合同枚举、模型与三条来源关联已生成到 Prisma 客户端", () => {
    expect(schema).toMatch(
      /enum ContractStatus\s*\{[\s\S]*?DRAFT[\s\S]*?EFFECTIVE[\s\S]*?VOID/
    );
    expect(schema).toMatch(/model Contract\s*\{[\s\S]*?status\s+ContractStatus/);
    expect(schema).toMatch(/sourceQuotationId\s+String/);
    expect(schema).toMatch(/sourceQuotation\s+Quotation/);

    expect(generatedEnums).toContain("export const ContractStatus");
    expect(generatedEnums).toMatch(/DRAFT:\s*['"]DRAFT['"]/);
    expect(generatedEnums).toMatch(/EFFECTIVE:\s*['"]EFFECTIVE['"]/);
    expect(generatedEnums).toMatch(/VOID:\s*['"]VOID['"]/);
    expect(generatedClient).toMatch(/export type Contract\s*=/);
    expect(generatedContract).toMatch(/sourceQuotationId:\s*string/);
    expect(generatedContract).toMatch(
      /sourceQuotation:\s*Prisma\.QuotationCreateNestedOneWithoutContractsInput/
    );
  });
});
