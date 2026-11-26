"use client";

import { useActionState, useRef, useState } from "react";
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
  /** 已选文件的显示名；原生 file input 隐藏，由自定义拖放区代理。 */
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function pickFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    // 把拖进来的文件写回隐藏的 input，保证 form 提交拿到同一个文件
    if (fileRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileRef.current.files = dt.files;
    }
  }

  return (
    <section className="mb-4 rounded-xl border border-line bg-paper-raised p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">批量导入客户</h2>
          <p className="mt-1 text-xs text-ink-faint">
            按客户名称去重（忽略空格与「有限公司」等后缀）；已存在的客户会跳过，不覆盖。
          </p>
        </div>
        <button
          type="button"
          onClick={downloadTemplate}
          className="min-h-11 rounded-lg border border-line-strong px-3 py-2.5 text-sm text-ink hover:bg-paper-sunk"
        >
          下载 CSV 模板
        </button>
      </div>

      <form
        action={formAction}
        className="mt-4 flex flex-wrap items-center gap-3"
      >
        {/* 自定义拖放区：原生 file input 隐藏，杜绝英文原生控件出现 */}
        <input
          ref={fileRef}
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          className="sr-only"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            pickFile(e.dataTransfer.files?.[0]);
          }}
          className={`flex min-h-11 items-center gap-2.5 rounded-lg border border-dashed px-4 py-2.5 text-sm transition-colors ${
            dragOver
              ? "border-brass-500 bg-brass-50 text-brass-600"
              : fileName
                ? "border-line-strong bg-paper-sunk text-ink"
                : "border-line-strong text-ink-faint hover:border-brass-500 hover:text-brass-600"
          }`}
        >
          <span aria-hidden>{fileName ? "📄" : "⇪"}</span>
          {fileName ? fileName : "选择 CSV 文件，或拖到此处"}
        </button>
        <button
          type="submit"
          disabled={pending || !fileName}
          className="btn btn-primary disabled:opacity-60"
        >
          {pending ? "导入中…" : "开始导入"}
        </button>
      </form>

      {state && !state.ok && (
        <p className="mt-4 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <div className="mt-4 text-sm">
          <p className="text-ink">
            导入完成：新增 <strong>{state.summary.created}</strong> 条，跳过{" "}
            <strong>{state.summary.skipped}</strong> 条，失败{" "}
            <strong>{state.summary.failed}</strong> 条。
          </p>
          {(state.summary.skipped > 0 || state.summary.failed > 0) && (
            <ul className="mt-2 max-h-48 space-y-1 overflow-auto rounded-lg bg-paper-sunk p-3 text-xs text-ink-soft">
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
