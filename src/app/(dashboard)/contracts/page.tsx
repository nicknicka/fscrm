import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { NavLink } from "@/components/nav-link";
import { Enter } from "@/components/stagger";
import { ContractStatus } from "@/generated/prisma/enums";
import {
  contractStatusLabel,
  quotationStatusLabel,
} from "@/lib/document-status";
import { listContractsForCurrentUser } from "./actions";

/** 合同列表；读取权限在服务入口按当前用户收窄。 */
export default async function ContractsPage() {
  const contracts = await listContractsForCurrentUser();

  return (
    <div>
      <Enter>
        <PageHeader title="合同" description="由已确认报价转化形成的成交协议" />
      </Enter>

      {contracts.length === 0 ? (
        <EmptyState message="暂无合同。请在商机详情中把已确认报价转为合同。" />
      ) : (
        <Enter
          effect="fade"
          className="overflow-hidden rounded-xl border border-zinc-200 bg-white"
        >
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">客户</th>
                <th className="px-4 py-3 font-medium">关联商机</th>
                <th className="px-4 py-3 font-medium">金额</th>
                <th className="px-4 py-3 font-medium">合同状态</th>
                <th className="px-4 py-3 font-medium">来源报价</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {contracts.map((contract) => (
                <tr key={contract.id}>
                  <td className="px-4 py-3 font-medium text-zinc-800">
                    {contract.customer.name}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {contract.opportunity.name}
                  </td>
                  <td className="px-4 py-3 text-zinc-800">
                    ¥{contract.amount.toLocaleString("zh-CN")}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        contract.status === ContractStatus.VOID ? "red" : "blue"
                      }
                    >
                      {contractStatusLabel[contract.status] ?? contract.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-600">
                        ¥
                        {contract.sourceQuotation.amount.toLocaleString(
                          "zh-CN"
                        )}
                      </span>
                      <Badge tone="zinc">
                        {quotationStatusLabel[
                          contract.sourceQuotation.status
                        ] ?? contract.sourceQuotation.status}
                      </Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-400">
                      来源：{contract.sourceQuotationId}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <NavLink
                      href={`/contracts/${contract.id}`}
                      className="text-sm text-blue-600 transition-colors duration-[var(--motion-fast)] hover:text-blue-700 hover:underline"
                    >
                      详情
                    </NavLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Enter>
      )}
    </div>
  );
}
