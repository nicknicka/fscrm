"use client";

/** 触发浏览器打印对话框的按钮，用于单据打印页。 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-ink-800 px-4 py-2 text-sm font-medium text-white print:hidden"
    >
      打印 / 另存为 PDF
    </button>
  );
}
