"use client";

import { useActionState } from "react";
import { CUSTOMER_IMPORT_HEADERS } from "@/lib/import/customer-import-constants";
import {
  importCustomersAction,
  type ImportActionResult,
} from "./import-actions";

/** 生成导入模板 CSV（带 BOM），前端触发下载。 */
function downloadTemplate() {
  const sample = [
    "示例客户",
    "中",
    "教育",
    "13800000000",
    "demo@example.com",
    "",
    "",
  ];
  const csv =
    "\uFEFF" +
    [CUSTOMER_IMPORT_HEADERS.join(","), sample.join(",")].join("\r\n") +
    "\r\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "客户导入模板.csv";
  link.click();
  URL.revokeObjectURL(url);
}

/** 客户批量导入面板：上传 CSV、下载模板、展示逐行结果。 */
export function CustomerImportPanel() {
  const [state, formAction, pending] = useActionState<
    ImportActionResult | null,
    FormData
  >(importCustomersAction, null);

  return (
    <section className="mb-4 rounded-xl border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-800">批量导入客户</h2>
          <p className="mt-1 text-xs text-zinc-500">
            按客户名称去重（忽略空格与「有限公司」等后缀）；已存在的客户会跳过，不覆盖。
          </p>
        </div>
        <button
          type="button"
          onClick={downloadTemplate}
          className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50"
        >
          下载 CSV 模板
        </button>
      </div>

      <form
        action={formAction}
        className="mt-4 flex flex-wrap items-center gap-3"
      >
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          className="block w-full max-w-xs text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:text-zinc-700 hover:file:bg-zinc-200"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? "导入中…" : "开始导入"}
        </button>
      </form>

      {state && !state.ok && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <div className="mt-4 text-sm">
          <p className="text-zinc-700">
            导入完成：新增 <strong>{state.summary.created}</strong> 条，跳过{" "}
            <strong>{state.summary.skipped}</strong> 条，失败{" "}
            <strong>{state.summary.failed}</strong> 条。
          </p>
          {(state.summary.skipped > 0 || state.summary.failed > 0) && (
            <ul className="mt-2 max-h-48 space-y-1 overflow-auto rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600">
              {state.summary.rows
                .filter((row) => row.status !== "created")
                .map((row) => (
                  <li key={row.row}>
                    第 {row.row} 行「{row.name || "（空）"}」：
                    {row.status === "skipped" ? "跳过" : "失败"} — {row.reason}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
