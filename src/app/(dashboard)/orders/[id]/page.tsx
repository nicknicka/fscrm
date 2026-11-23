import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { Badge, PageHeader } from "@/components/ui";
import { OrderStatus } from "@/generated/prisma/enums";
import { contractStatusLabel, orderStatusLabel } from "@/lib/document-status";
import { nextOrderStatuses } from "@/lib/order-status";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getOrderForCurrentUser,
  transitionOrderStatusFormAction,
} from "../actions";
import {
  addPaymentFormAction,
  listPaymentsForCurrentUser,
} from "../payment-actions";
import {
  addPaymentPlanFormAction,
  deletePaymentPlanFormAction,
  listPaymentPlansForCurrentUser,
  updatePaymentPlanFormAction,
} from "../payment-plan-actions";
import {
  confirmReconciliationFormAction,
  listReconciliationsForCurrentUser,
} from "../reconciliation-actions";

/** 订单详情页；越权与不存在统一按 notFound 处理。 */
export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await getOrderForCurrentUser(id);
  if (!order) notFound();
  const { payments, total, balance } = await listPaymentsForCurrentUser(
    order.id
  );
  const plans = await listPaymentPlansForCurrentUser(order.id);
  const { records: reconciliations, latest: latestReconciliation } =
    await listReconciliationsForCurrentUser(order.id);
  const currentUser = await getCurrentUser();
  const isAdmin = currentUser?.role === "ADMIN";
  const nextStatuses = nextOrderStatuses(order.status as OrderStatus);
  const transition = transitionOrderStatusFormAction.bind(null, order.id);

  return (
    <div>
      <Link href="/orders" className="text-sm text-blue-600 hover:underline">
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
              <Badge
                tone={order.status === OrderStatus.CANCELLED ? "red" : "blue"}
              >
                {orderStatusLabel[order.status] ?? order.status}
              </Badge>
              {nextStatuses.length > 0 && (
                <form
                  action={transition}
                  className="mt-2 flex items-center gap-2"
                >
                  <AutoSubmitSelect
                    name="status"
                    defaultValue={nextStatuses[0]}
                    options={nextStatuses.map((status) => ({
                      value: status,
                      label: `推进到「${orderStatusLabel[status]}」`,
                    }))}
                    className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm"
                  />
                  <span className="text-xs text-zinc-400">选择即生效</span>
                </form>
              )}
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
            <Info
              label="回款合计"
              value={`¥${total.toLocaleString("zh-CN")}`}
            />
            <Info
              label="未收差额"
              value={`¥${balance.toLocaleString("zh-CN")}`}
            />
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

          <form action={addPaymentFormAction} className="flex flex-wrap gap-3">
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
          <h3 className="mb-3 text-sm font-semibold text-zinc-700">回款计划</h3>
          <dl className="mb-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
            <Info
              label="计划合计"
              value={`¥${plans.plannedTotal.toLocaleString("zh-CN")}`}
            />
            <Info
              label="实际回款"
              value={`¥${plans.receivedTotal.toLocaleString("zh-CN")}`}
            />
            <Info
              label="计划 - 实际"
              value={`¥${plans.variance.toLocaleString("zh-CN")}`}
            />
          </dl>

          {plans.plans.length > 0 && (
            <ul className="mb-4 space-y-2 text-sm">
              {plans.plans.map((plan) => (
                <li key={plan.id} className="rounded-lg bg-zinc-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span>
                      {plan.plannedAt.toLocaleString("zh-CN")}
                      {plan.note ? ` · ${plan.note}` : ""}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-medium">
                        ¥{plan.amount.toLocaleString("zh-CN")}
                      </span>
                      <form
                        action={deletePaymentPlanFormAction.bind(
                          null,
                          plan.id,
                          order.id
                        )}
                      >
                        <button
                          type="submit"
                          className="text-xs text-red-600 hover:underline"
                        >
                          删除
                        </button>
                      </form>
                    </span>
                  </div>
                  <form
                    action={updatePaymentPlanFormAction.bind(
                      null,
                      plan.id,
                      order.id
                    )}
                    className="mt-2 flex flex-wrap items-end gap-3 border-t border-zinc-200 pt-2"
                  >
                    <label className="text-xs text-zinc-600">
                      金额
                      <input
                        name="amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        defaultValue={plan.amount}
                        required
                        className="mt-1 w-28 rounded-md border border-zinc-300 px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="text-xs text-zinc-600">
                      计划到账时间
                      <input
                        name="plannedAt"
                        type="datetime-local"
                        defaultValue={toDateTimeLocal(plan.plannedAt)}
                        required
                        className="mt-1 rounded-md border border-zinc-300 px-2 py-1 text-sm"
                      />
                    </label>
                    <button
                      type="submit"
                      className="min-h-11 rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      保存
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <form
            action={addPaymentPlanFormAction}
            className="flex flex-wrap gap-3"
          >
            <input type="hidden" name="orderId" value={order.id} />
            <label className="flex-1 text-xs text-zinc-600">
              计划金额
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
              计划到账时间
              <input
                name="plannedAt"
                type="datetime-local"
                required
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="w-full text-xs text-zinc-600">
              备注（可选）
              <input
                name="note"
                type="text"
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>
            <button
              type="submit"
              className="self-end rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              添加计划
            </button>
          </form>
        </div>

        <div className="mt-6 border-t border-zinc-100 pt-5">
          <h3 className="mb-3 text-sm font-semibold text-zinc-700">对账</h3>
          <dl className="mb-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
            <Info
              label="当前差额"
              value={`¥${balance.toLocaleString("zh-CN")}`}
            />
            <Info
              label="最近对账"
              value={
                latestReconciliation
                  ? `${latestReconciliation.createdAt.toLocaleString("zh-CN")} · 差额 ¥${latestReconciliation.balance.toLocaleString("zh-CN")}`
                  : "尚未对账"
              }
            />
            <Info label="对账次数" value={String(reconciliations.length)} />
          </dl>

          {reconciliations.length > 0 && (
            <ul className="mb-4 space-y-2 text-sm">
              {reconciliations.map((record) => (
                <li
                  key={record.id}
                  className="rounded-lg bg-zinc-50 px-3 py-2 text-zinc-700"
                >
                  <div className="flex justify-between">
                    <span>
                      {record.createdAt.toLocaleString("zh-CN")}
                      <span className="ml-2 text-xs text-zinc-500">
                        {record.status === "VOID" ? "已作废" : "已确认"}
                      </span>
                    </span>
                    <span>
                      确认时已收 ¥{record.receivedTotal.toLocaleString("zh-CN")}
                    </span>
                  </div>
                  {record.note && (
                    <div className="mt-1 text-xs text-zinc-500">
                      {record.note}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {isAdmin && (
            <form
              action={confirmReconciliationFormAction}
              className="flex flex-wrap gap-3"
            >
              <input type="hidden" name="orderId" value={order.id} />
              <label className="flex-1 text-xs text-zinc-600">
                对账备注（可选）
                <input
                  name="note"
                  type="text"
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
              </label>
              <button
                type="submit"
                className="self-end rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                确认对账
              </button>
            </form>
          )}
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

/** 把 Date 转为 datetime-local 输入可接受的值（本地时区）。 */
function toDateTimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 break-all text-sm text-zinc-800">{value}</dd>
    </div>
  );
}
