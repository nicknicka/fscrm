import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { requireCurrentUser } from "@/lib/auth/session";
import { accessScopeFor } from "@/lib/auth/scope";
import { getQuotation } from "@/lib/db/repositories/quotation";
import { quotationStatusLabel } from "@/lib/document-status";

/**
 * 报价打印页：`/print/quotation/[id]`。
 * 独立于 dashboard 布局；越权与不存在按 notFound 处理（与商机详情同源权限）。
 */
export default async function QuotationPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireCurrentUser();
  const quotation = await getQuotation(id, accessScopeFor(user));
  if (!quotation) notFound();

  return (
    <div className="mx-auto max-w-3xl bg-white px-8 py-10 text-zinc-900">
      <div className="mb-8 flex items-center justify-between print:hidden">
        <a
          href={`/opportunities/${quotation.opportunityId}`}
          className="text-sm text-blue-600 hover:underline"
        >
          ← 返回商机详情
        </a>
        <PrintButton />
      </div>

      <h1 className="mb-2 text-2xl font-bold">报价单</h1>
      <p className="mb-8 text-sm text-zinc-500">报价编号：{quotation.id}</p>

      <table className="mb-8 w-full border-collapse text-sm">
        <tbody>
          <PrintRow label="客户" value={quotation.customer.name} />
          <PrintRow label="关联商机" value={quotation.opportunity.name} />
          <PrintRow
            label="状态"
            value={quotationStatusLabel[quotation.status] ?? quotation.status}
          />
        </tbody>
      </table>

      <h2 className="mb-3 text-base font-semibold">报价条目</h2>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-zinc-50">
            <th className="border border-zinc-200 px-4 py-2 text-left">名称</th>
            <th className="border border-zinc-200 px-4 py-2 text-right">
              数量
            </th>
            <th className="border border-zinc-200 px-4 py-2 text-right">
              单价
            </th>
            <th className="border border-zinc-200 px-4 py-2 text-right">
              小计
            </th>
          </tr>
        </thead>
        <tbody>
          {quotation.items.map((item) => (
            <tr key={item.id}>
              <td className="border border-zinc-200 px-4 py-2">{item.name}</td>
              <td className="border border-zinc-200 px-4 py-2 text-right">
                {item.quantity}
              </td>
              <td className="border border-zinc-200 px-4 py-2 text-right">
                ¥{item.unitPrice.toLocaleString("zh-CN")}
              </td>
              <td className="border border-zinc-200 px-4 py-2 text-right">
                ¥{(item.quantity * item.unitPrice).toLocaleString("zh-CN")}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-zinc-50 font-semibold">
            <td className="border border-zinc-200 px-4 py-3" colSpan={3}>
              合计
            </td>
            <td className="border border-zinc-200 px-4 py-3 text-right">
              ¥{quotation.amount.toLocaleString("zh-CN")}
            </td>
          </tr>
        </tfoot>
      </table>

      <p className="mt-16 text-center text-xs text-zinc-400">
        由 fscrm 生成 · 打印日期 {new Date().toLocaleDateString("zh-CN")}
      </p>
    </div>
  );
}

function PrintRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <th className="w-40 border border-zinc-200 bg-zinc-50 px-4 py-3 text-left font-medium text-zinc-600">
        {label}
      </th>
      <td className="border border-zinc-200 px-4 py-3">{value}</td>
    </tr>
  );
}
