/**
 * 客户批量导入服务。
 *
 * 决策（issue #56 已确认）：
 * - 仅导入客户；
 * - 以「名称归一化」匹配去重；命中已有客户时跳过该行，不更新、不覆盖；
 * - 写入复用 createCustomer，权限与手动新建完全一致。
 *
 * 返回逐行结果，供页面标出成功/跳过/失败及原因。
 */
import { accessScopeFor, type AccessScope } from "@/lib/auth/scope";
import type { CurrentUser } from "@/lib/auth/session";
import { createCustomer, listCustomers } from "@/lib/db/repositories/customer";
import { CustomerLevel } from "@/generated/prisma/enums";
import { normalizeName } from "@/lib/name-normalize";

/** 导入模板的列名（重导出，保持服务端引用不变）。 */
export { CUSTOMER_IMPORT_HEADERS } from "./customer-import-constants";

/** 单行导入结果。 */
export interface ImportRowResult {
  row: number;
  name: string;
  status: "created" | "skipped" | "failed";
  reason?: string;
}

/** 整批导入汇总。 */
export interface ImportSummary {
  created: number;
  skipped: number;
  failed: number;
  rows: ImportRowResult[];
}

/** 解析等级列：高/中/低对应枚举，非法值回落到中价值。 */
function parseLevel(value: string | undefined): CustomerLevel {
  switch ((value ?? "").trim()) {
    case "高":
    case "HIGH":
      return CustomerLevel.HIGH;
    case "低":
    case "LOW":
      return CustomerLevel.LOW;
    default:
      return CustomerLevel.MEDIUM;
  }
}

/** 可选文本：空白归一为 null。 */
function optionalText(value: string | undefined): string | null {
  return (value ?? "").trim() || null;
}

/**
 * 导入客户。
 *
 * @param rows 已解析的 CSV 行（键为表头名）
 * @param user 当前用户，决定权限范围与新建归属
 */
export async function importCustomers(
  rows: Record<string, string>[],
  user: CurrentUser
): Promise<ImportSummary> {
  const scope: AccessScope = accessScopeFor(user);
  const existing = await listCustomers({}, scope);
  const seen = new Set(existing.map((c) => normalizeName(c.name)));

  const summary: ImportSummary = {
    created: 0,
    skipped: 0,
    failed: 0,
    rows: [],
  };

  for (let index = 0; index < rows.length; index += 1) {
    const rowNumber = index + 2; // 第 1 行是表头
    const raw = rows[index];
    const name = (raw["客户名称"] ?? "").trim();

    if (!name) {
      summary.failed += 1;
      summary.rows.push({
        row: rowNumber,
        name: "",
        status: "failed",
        reason: "客户名称为空",
      });
      continue;
    }

    const key = normalizeName(name);
    if (!key) {
      summary.failed += 1;
      summary.rows.push({
        row: rowNumber,
        name,
        status: "failed",
        reason: "客户名称无法归一化",
      });
      continue;
    }
    if (seen.has(key)) {
      summary.skipped += 1;
      summary.rows.push({
        row: rowNumber,
        name,
        status: "skipped",
        reason: "已存在同名客户（按名称归一化匹配）",
      });
      continue;
    }

    try {
      await createCustomer(
        {
          name,
          level: parseLevel(raw["等级"]),
          industry: optionalText(raw["行业"]),
          phone: optionalText(raw["电话"]),
          email: optionalText(raw["邮箱"]),
          address: optionalText(raw["地址"]),
          remark: optionalText(raw["备注"]),
        },
        scope
      );
      // 批内去重：刚创建的也加入 seen，避免同批次重复名称被再次导入
      seen.add(key);
      summary.created += 1;
      summary.rows.push({ row: rowNumber, name, status: "created" });
    } catch (error) {
      summary.failed += 1;
      summary.rows.push({
        row: rowNumber,
        name,
        status: "failed",
        reason: error instanceof Error ? error.message : "写入失败",
      });
    }
  }

  return summary;
}
