import { EXPORT_LABELS, type ExportDataset } from "@/lib/export/types";

/**
 * CSV 导出按钮：普通链接到导出端点，浏览器按 Content-Disposition 下载。
 * 服务端组件即可使用，无需客户端脚本。
 */
export function ExportButton({ dataset }: { dataset: ExportDataset }) {
  return (
    <a
      href={`/api/export/${dataset}`}
      download
      className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-50"
    >
      导出{EXPORT_LABELS[dataset]}CSV
    </a>
  );
}
