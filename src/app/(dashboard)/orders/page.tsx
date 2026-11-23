import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { NavLink } from "@/components/nav-link";
import { Enter } from "@/components/stagger";
import { OrderStatus } from "@/generated/prisma/enums";
import { contractStatusLabel, orderStatusLabel } from "@/lib/document-status";
import { listOrdersForCurrentUser } from "./actions";

/** 订单列表；读取权限在服务入口按当前用户收窄。 */
export default async function OrdersPage() {
  const orders = await listOrdersForCurrentUser();

  return (
    <div>
      <Enter>
        <PageHeader
          title="订单"
          description="由合同转化形成、进入履约阶段的业务单据"
        />
      </Enter>

      {orders.length === 0 ? (
        <EmptyState message="暂无订单。请在合同详情中把合同转为订单。" />
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
                <th className="px-4 py-3 font-medium">订单状态</th>
                <th className="px-4 py-3 font-medium">来源合同</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="px-4 py-3 font-medium text-zinc-800">
                    {order.customer.name}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {order.opportunity.name}
                  </td>
                  <td className="px-4 py-3 text-zinc-800">
                    ¥{order.amount.toLocaleString("zh-CN")}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        order.status === OrderStatus.CANCELLED ? "red" : "blue"
                      }
                    >
                      {orderStatusLabel[order.status] ?? order.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-zinc-600">
                        ¥{order.sourceContract.amount.toLocaleString("zh-CN")}
                      </span>
                      <Badge tone="zinc">
                        {contractStatusLabel[order.sourceContract.status] ??
                          order.sourceContract.status}
                      </Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-400">
                      来源：{order.sourceContractId}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <NavLink
                      href={`/orders/${order.id}`}
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
