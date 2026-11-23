import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { contractStatusLabel } from "@/lib/document-status";
import { getContractForCurrentUser } from "@/app/(dashboard)/contracts/actions";

/**
 * 合同打印页：`/print/contract/[id]`。
 *
 * 独立于 dashboard 布局（无侧边栏），@media print 隐藏操作区，
 * 仅打印单据正文。越权与不存在按 notFound 处理，与详情页同源。
 */
export default async function ContractPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contract = await getContractForCurrentUser(id);
  if (!contract) notFound();

  return (
    <div className="mx-auto max-w-3xl bg-white px-8 py-10 text-zinc-900">
      <div className="mb-8 flex items-center justify-between print:hidden">
        <a
          href={`/contracts/${contract.id}`}
          className="text-sm text-blue-600 hover:underline"
        >
          ← 返回合同详情
        </a>
        <PrintButton />
      </div>

      <h1 className="mb-2 text-2xl font-bold">合同</h1>
      <p className="mb-8 text-sm text-zinc-500">合同编号：{contract.id}</p>

      <table className="w-full border-collapse text-sm">
        <tbody>
          <PrintRow label="客户" value={contract.customer.name} />
          <PrintRow label="关联商机" value={contract.opportunity.name} />
          <PrintRow
            label="金额"
            value={`¥${contract.amount.toLocaleString("zh-CN")}`}
          />
          <PrintRow
            label="状态"
            value={contractStatusLabel[contract.status] ?? contract.status}
          />
          <PrintRow label="来源报价编号" value={contract.sourceQuotationId} />
          <PrintRow
            label="创建时间"
            value={contract.createdAt.toLocaleString("zh-CN")}
          />
        </tbody>
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
