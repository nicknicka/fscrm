import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, PageHeader } from "@/components/ui";
import { OrderStatus } from "@/generated/prisma/enums";
import { contractStatusLabel, orderStatusLabel } from "@/lib/document-status";
import { getOrderForCurrentUser } from "../actions";
import {
  addPaymentForCurrentUser,
  listPaymentsForCurrentUser,
} from "../payment-actions";

/** 订单详情页；越权与不存在统一按 notFound 处理。 */
export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await getOrderForCurrentUser(id);
  if (!order) notFound();
  const { payments, total, balance } = await listPaymentsForCurrentUser(order.id);
  // form action 要求返回 void；结果通过服务端日志与成功后 revalidate 体现。
  async function addPaymentAction(formData: FormData): Promise<void> {
    await addPaymentForCurrentUser(formData);
  }

  return (
    <div>
      <Link
        href="/orders"
        className="text-sm text-blue-600 hover:underline"
      >
        ← 返回订单列表
      </Link>
      <div className="mt-4">
        <PageHeader title="订单详情" description={order.customer.name} />
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold">基本信息</h2>
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <Info label="订单编号" value={order.id} />
          <div>
            <dt className="text-xs text-zinc-500">订单状态</dt>
            <dd className="mt-0.5">
              <Badge tone={order.status === OrderStatus.CANCELLED ? "red" : "blue"}>
                {orderStatusLabel[order.status] ?? order.status}
              </Badge>
            </dd>
          </div>
          <Info label="关联客户" value={order.customer.name} />
          <Info label="关联商机" value={order.opportunity.name} />
          <Info
            label="订单金额"
            value={`¥${order.amount.toLocaleString("zh-CN")}`}
          />
          <Info
            label="创建时间"
            value={order.createdAt.toLocaleString("zh-CN")}
          />
        </dl>

        <div className="mt-6 border-t border-zinc-100 pt-5">
          <h3 className="mb-3 text-sm font-semibold text-zinc-700">回款</h3>
          <dl className="mb-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <Info label="回款合计" value={`¥${total.toLocaleString("zh-CN")}`} />
            <Info label="未收差额" value={`¥${balance.toLocaleString("zh-CN")}`} />
          </dl>

          <ul className="mb-4 space-y-2 text-sm">
            {payments.length === 0 ? (
              <li className="text-zinc-500">暂无回款记录</li>
            ) : (
              payments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex justify-between rounded-lg bg-zinc-50 px-3 py-2"
                >
                  <span>{payment.receivedAt.toLocaleString("zh-CN")}</span>
                  <span className="font-medium">
                    ¥{payment.amount.toLocaleString("zh-CN")}
                  </span>
                </li>
              ))
            )}
          </ul>

          <form action={addPaymentAction} className="flex flex-wrap gap-3">
            <input type="hidden" name="orderId" value={order.id} />
            <label className="flex-1 text-xs text-zinc-600">
              回款金额
              <input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                required
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex-1 text-xs text-zinc-600">
              到账时间
              <input
                name="receivedAt"
                type="datetime-local"
                required
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>
            <button
              type="submit"
              className="self-end rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              登记回款
            </button>
          </form>
        </div>

        <div className="mt-6 border-t border-zinc-100 pt-5">
          <h3 className="mb-3 text-sm font-semibold text-zinc-700">来源合同</h3>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                ¥{order.sourceContract.amount.toLocaleString("zh-CN")}
              </span>
              <Badge tone="zinc">
                {contractStatusLabel[order.sourceContract.status] ??
                  order.sourceContract.status}
              </Badge>
            </div>
            <div className="mt-2 text-xs text-zinc-500">
              合同编号：{order.sourceContractId}
            </div>
            <Link
              href={`/contracts/${order.sourceContractId}`}
              className="mt-3 inline-block text-sm text-blue-600 hover:underline"
            >
              查看来源合同 →
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
