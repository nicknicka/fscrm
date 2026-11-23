import { type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { loadExportDataset } from "@/lib/export/datasets";
import { renderCsv, type CsvColumn } from "@/lib/export/csv";
import { EXPORT_LABELS, isExportDataset } from "@/lib/export/types";

/**
 * 列表导出端点：`GET /api/export/<dataset>`。
 *
 * 权限：走登录会话（Cookie），未登录返回 401；取数复用与列表页相同的
 * 仓储 scope 收窄，杜绝越权导出。仅支持白名单数据集。
 * 输出 UTF-8 BOM 的 CSV，Excel 直接打开不乱码。
 */

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dataset: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "未登录" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...NO_STORE_HEADERS },
    });
  }

  const { dataset } = await params;
  if (!isExportDataset(dataset)) {
    return new Response(JSON.stringify({ error: "不支持的导出类型" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...NO_STORE_HEADERS },
    });
  }

  // 读取列表页传来的筛选条件；缺省时导出全部可见行。
  const searchParams = request.nextUrl.searchParams;
  const filters = {
    search: searchParams.get("q") ?? undefined,
    stage: searchParams.get("stage") ?? undefined,
    ownerId: searchParams.get("ownerId") ?? undefined,
  };

  try {
    const { rows, columns } = await loadExportDataset(user, dataset, filters);
    // 各数据集的列取值函数与行类型在各自 loader 内已配对，此处统一按 unknown 收窄。
    const csv = renderCsv(columns as CsvColumn<unknown>[], rows);
    const filename = `fscrm-${dataset}-${new Date().toISOString().slice(0, 10)}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(EXPORT_LABELS[dataset])}.csv`,
        ...NO_STORE_HEADERS,
      },
    });
  } catch (error) {
    console.error("[export] 导出失败", dataset, error);
    return new Response(JSON.stringify({ error: "导出失败" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...NO_STORE_HEADERS },
    });
  }
}
