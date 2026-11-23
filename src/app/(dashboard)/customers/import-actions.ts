"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/session";
import { auditWrite } from "@/lib/db/repositories/audit-log";
import { parseCsv } from "@/lib/import/csv-parser";
import {
  CUSTOMER_IMPORT_HEADERS,
  importCustomers,
  type ImportSummary,
} from "@/lib/import/customers";

/** 导入动作结果：成功时带逐行汇总，失败时带错误信息。 */
export type ImportActionResult =
  { ok: true; summary: ImportSummary } | { ok: false; error: string };

/**
 * 批量导入客户：`FormData` 中需含 `file`（CSV 文件）。
 * 鉴权在 requireCurrentUser + importCustomers 内的 scope 收窄，
 * 与手动新建客户走同一条写入路径。
 * 签名为 useActionState 约定的 (prevState, formData) => newState。
 */
export async function importCustomersAction(
  _prevState: ImportActionResult | null,
  formData: FormData
): Promise<ImportActionResult> {
  const user = await requireCurrentUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "请选择要导入的 CSV 文件" };
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: "无法读取文件内容" };
  }

  const { headers, rows } = parseCsv(text);
  if (!headers.includes("客户名称")) {
    return {
      ok: false,
      error: `CSV 缺少「客户名称」列。模板列：${CUSTOMER_IMPORT_HEADERS.join("、")}`,
    };
  }
  if (rows.length === 0) {
    return { ok: false, error: "CSV 中没有数据行" };
  }

  const summary = await importCustomers(rows, user);
  if (summary.created > 0) {
    await auditWrite(
      user,
      "CREATE",
      "Customer",
      `import-${Date.now()}`,
      `批量导入客户：新建 ${summary.created} 条，跳过 ${summary.skipped} 条，失败 ${summary.failed} 条`
    );
  }
  revalidatePath("/customers");
  return { ok: true, summary };
}
