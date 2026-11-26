import { EXPORT_LABELS, type ExportDataset } from "@/lib/export/types";

/**
 * 导出链接携带的列表筛选条件。
 * 键名与导出端点一致：q 为关键词，stage 为阶段，ownerId 为负责人。
 */
export interface ExportButtonParams {
  q?: string;
  stage?: string;
  ownerId?: string;
}

/**
 * CSV 导出按钮：普通链接到导出端点，浏览器按 Content-Disposition 下载。
 * 传入 params 时把有值的筛选条件编码进 query，导出跟随列表当前视图。
 * 服务端组件即可使用，无需客户端脚本。
 */
export function ExportButton({
  dataset,
  params,
}: {
  dataset: ExportDataset;
  params?: ExportButtonParams;
}) {
  const search = new URLSearchParams();
  if (params?.q) search.set("q", params.q);
  if (params?.stage) search.set("stage", params.stage);
  if (params?.ownerId) search.set("ownerId", params.ownerId);
  const query = search.toString();
  const href = `/api/export/${dataset}${query ? `?${query}` : ""}`;

  return (
    <a
      href={href}
      download
      className="rounded-lg border border-line-strong px-3 py-2 text-sm text-ink transition-colors hover:bg-paper-sunk"
    >
      导出{EXPORT_LABELS[dataset]}CSV
    </a>
  );
}
