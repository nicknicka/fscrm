import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, PageHeader } from "@/components/ui";
import { ContractStatus } from "@/generated/prisma/enums";
import {
  contractStatusLabel,
  quotationStatusLabel,
} from "@/lib/document-status";
import { getContractForCurrentUser } from "../actions";
import { convertContractToOrderFormAction } from "../../orders/actions";

/** 合同详情页：可把合同转为订单，越权与不存在统一按 notFound 处理。 */
export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contract = await getContractForCurrentUser(id);
  if (!contract) notFound();
  const convertToOrder = convertContractToOrderFormAction.bind(
    null,
    contract.id,
    contract.opportunityId
  );

  return (
    <div>
      <Link href="/contracts" className="text-sm text-blue-600 hover:underline">
        ← 返回合同列表
      </Link>
      <div className="mt-4">
        <PageHeader
          title="合同详情"
          description={contract.customer.name}
          action={
            <form action={convertToOrder}>
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                转为订单
              </button>
            </form>
          }
        />
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold">基本信息</h2>
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <Info label="合同编号" value={contract.id} />
          <div>
            <dt className="text-xs text-zinc-500">合同状态</dt>
            <dd className="mt-0.5">
              <Badge
                tone={contract.status === ContractStatus.VOID ? "red" : "blue"}
              >
                {contractStatusLabel[contract.status] ?? contract.status}
              </Badge>
            </dd>
          </div>
          <Info label="关联客户" value={contract.customer.name} />
          <Info label="关联商机" value={contract.opportunity.name} />
          <Info
            label="合同金额"
            value={`¥${contract.amount.toLocaleString("zh-CN")}`}
          />
          <Info
            label="创建时间"
            value={contract.createdAt.toLocaleString("zh-CN")}
          />
        </dl>

        <div className="mt-6 border-t border-zinc-100 pt-5">
          <h3 className="mb-3 text-sm font-semibold text-zinc-700">来源报价</h3>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                ¥{contract.sourceQuotation.amount.toLocaleString("zh-CN")}
              </span>
              <Badge tone="zinc">
                {quotationStatusLabel[contract.sourceQuotation.status] ??
                  contract.sourceQuotation.status}
              </Badge>
            </div>
            <div className="mt-2 text-xs text-zinc-500">
              报价编号：{contract.sourceQuotationId}
            </div>
            <Link
              href={`/opportunities/${contract.opportunityId}`}
              className="mt-3 inline-block text-sm text-blue-600 hover:underline"
            >
              查看来源商机与报价 →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 break-all text-sm text-zinc-800">{value}</dd>
    </div>
  );
}
