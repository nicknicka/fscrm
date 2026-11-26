import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { NavLink } from "@/components/nav-link";
import { ExportButton } from "@/components/export-button";
import { Pagination } from "@/components/pagination";
import { Enter } from "@/components/stagger";
import { OrderStatus } from "@/generated/prisma/enums";
import { contractStatusLabel, orderStatusLabel } from "@/lib/document-status";
import { buildPaginationMeta, parsePagination } from "@/lib/pagination";
import { countOrdersForCurrentUser, listOrdersForCurrentUser } from "./actions";

/* 这些页面读取会话与数据库，属于请求时数据，无法静态预渲染。 */
export const instant = false;

/** 订单列表；读取权限在服务入口按当前用户收窄。 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string | string[];
    pageSize?: string | string[];
  }>;
}) {
  const pagination = parsePagination(await searchParams);
  const [orders, total] = await Promise.all([
    listOrdersForCurrentUser(pagination),
    countOrdersForCurrentUser(),
  ]);
  const meta = buildPaginationMeta(pagination, total);

  return (
    <div>
      <Enter>
        <PageHeader
          title="订单"
          description={`共 ${total} 笔订单 · 由合同转化形成、进入履约阶段`}
          action={<ExportButton dataset="orders" />}
        />
      </Enter>

      {orders.length === 0 ? (
        <EmptyState message="暂无订单。请在合同详情中把合同转为订单。" />
      ) : (
        <Enter
          effect="fade"
          className="overflow-x-auto rounded-xl border border-line bg-paper-raised"
        >
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line bg-paper-sunk text-xs text-ink-faint">
              <tr>
                <th className="px-4 py-3 font-medium">客户</th>
                <th className="px-4 py-3 font-medium">关联商机</th>
                <th className="px-4 py-3 font-medium">金额</th>
                <th className="px-4 py-3 font-medium">订单状态</th>
                <th className="px-4 py-3 font-medium">来源合同</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {orders.map((order) => (
                <tr key={order.id} className="row-glow">
                  <td className="px-4 py-3 font-medium text-ink">
                    {order.customer.name}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {order.opportunity.name}
                  </td>
                  <td className="px-4 py-3 text-ink">
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
                      <span className="text-ink-soft">
                        ¥{order.sourceContract.amount.toLocaleString("zh-CN")}
                      </span>
                      <Badge tone="zinc">
                        {contractStatusLabel[order.sourceContract.status] ??
                          order.sourceContract.status}
                      </Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-ink-faint">
                      来源：{order.sourceContractId}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <NavLink
                      href={`/orders/${order.id}`}
                      className="text-sm text-brass-600 transition-colors duration-[var(--motion-fast)] hover:text-brass-500 hover:underline"
                    >
                      详情
                    </NavLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > 0 && <Pagination meta={meta} pathname="/orders" />}
        </Enter>
      )}
    </div>
  );
}
