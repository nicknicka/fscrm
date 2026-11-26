import { Badge, PageHeader } from "@/components/ui";
import { NavLink } from "@/components/nav-link";
import { EmptyStatePanel } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { Enter } from "@/components/stagger";
import { requireCurrentUser } from "@/lib/auth/session";
import { accessScopeFor } from "@/lib/auth/scope";
import {
  countPublicPoolCustomers,
  listPublicPoolCustomers,
} from "@/lib/db/repositories/customer";
import { buildPaginationMeta, parsePagination } from "@/lib/pagination";
import { listAssignableUsers } from "@/lib/db/repositories/user";
import { CustomerLevel } from "@/generated/prisma/enums";
import type { PublicPoolCustomerSummary } from "@/lib/db/repositories/customer";
import {
  claimPublicCustomerFormAction,
  setCustomerOwnerFormAction,
} from "../public-pool-actions";

/* 这些页面读取会话与数据库，属于请求时数据，无法静态预渲染。 */
export const instant = false;

/**
 * 公海列表页：展示所有尚无负责人的客户。
 *
 * 认领按钮对所有负责人可见；管理员可在客户详情中指定或清空负责人。
 * 普通负责人在认领前只看到名称、等级、行业这些最小信息（ADR-0003 的有意例外），
 * 联系人/商机数量等关联统计仅管理员可见。
 */
export default async function PublicPoolPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string | string[];
    pageSize?: string | string[];
  }>;
}) {
  const currentUser = await requireCurrentUser();
  const scope = accessScopeFor(currentUser);
  const pagination = parsePagination(await searchParams);
  const [customers, total, users] = await Promise.all([
    listPublicPoolCustomers(scope, pagination),
    countPublicPoolCustomers(scope),
    listAssignableUsers(currentUser),
  ]);
  const meta = buildPaginationMeta(pagination, total);

  const levelTone: Record<string, "red" | "amber" | "zinc"> = {
    [CustomerLevel.HIGH]: "red",
    [CustomerLevel.MEDIUM]: "amber",
    [CustomerLevel.LOW]: "zinc",
  };
  const levelLabel: Record<string, string> = {
    [CustomerLevel.HIGH]: "高价值",
    [CustomerLevel.MEDIUM]: "中价值",
    [CustomerLevel.LOW]: "低价值",
  };

  // 等级分布：状态带上的一线比例图
  const levelCounts = customers.reduce(
    (acc, c) => {
      acc[c.level] = (acc[c.level] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const levelOrder = [
    CustomerLevel.HIGH,
    CustomerLevel.MEDIUM,
    CustomerLevel.LOW,
  ];
  const levelColor: Record<string, string> = {
    [CustomerLevel.HIGH]: "bg-danger",
    [CustomerLevel.MEDIUM]: "bg-brass-500",
    [CustomerLevel.LOW]: "bg-line-strong",
  };

  return (
    <div>
      <Enter>
        <PageHeader title="公海" description={`共 ${total} 个公海客户`} />
      </Enter>

      {/* 状态带：待认领总数 + 价值构成。公海的问题是「里面有什么好货」 */}
      {total > 0 && (
        <Enter effect="fade" className="card mb-6 p-5">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint">
                待认领
              </div>
              <div className="num-kpi mt-1 text-ink">{total}</div>
            </div>
            <div className="min-w-56 flex-1 sm:max-w-md">
              <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-paper-sunk">
                {levelOrder.map((level) => {
                  const count = levelCounts[level] ?? 0;
                  if (count === 0) return null;
                  return (
                    <span
                      key={level}
                      className={`h-full ${levelColor[level]}`}
                      style={{
                        width: `${(count / customers.length) * 100}%`,
                      }}
                    />
                  );
                })}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
                {levelOrder.map((level) => {
                  const count = levelCounts[level] ?? 0;
                  if (count === 0) return null;
                  return (
                    <span key={level} className="flex items-center gap-1.5">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${levelColor[level]}`}
                      />
                      {levelLabel[level]}{" "}
                      <span className="tnum text-ink-faint">{count}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </Enter>
      )}

      {customers.length === 0 ? (
        <Enter effect="fade">
          <EmptyStatePanel
            title="公海已经清空"
            description="没有待认领的客户。客户被释放、或负责人被清空后，会重新出现在这里。"
            action={
              <NavLink href="/customers" className="btn btn-primary">
                去客户列表
              </NavLink>
            }
          />
        </Enter>
      ) : (
        <Enter
          effect="fade"
          className="overflow-hidden rounded-xl border border-line bg-paper-raised"
        >
          <table className="w-full text-left text-sm">
            <thead className="bg-paper-sunk text-ink-faint">
              <tr>
                <th className="px-4 py-3 font-medium">客户名称</th>
                <th className="px-4 py-3 font-medium">等级</th>
                <th className="px-4 py-3 font-medium">行业</th>
                {scope.role === "ADMIN" && (
                  <th className="px-4 py-3 font-medium">联系人/商机</th>
                )}
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {customers.map((customer: PublicPoolCustomerSummary) => (
                <tr key={customer.id} className="row-glow">
                  <td className="px-4 py-3">
                    {scope.role === "ADMIN" ? (
                      <NavLink
                        href={`/customers/${customer.id}`}
                        className="font-medium text-brass-600 transition-colors duration-[var(--motion-fast)] hover:text-brass-500 hover:underline"
                      >
                        {customer.name}
                      </NavLink>
                    ) : (
                      // 普通负责人认领前只能看到最小信息，详情页仍受负责人范围限制。
                      <span className="font-medium text-ink">
                        {customer.name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={levelTone[customer.level]}>
                      {levelLabel[customer.level]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {customer.industry ?? "—"}
                  </td>
                  {scope.role === "ADMIN" && (
                    <td className="px-4 py-3 text-ink-soft">
                      {"_count" in customer
                        ? `${(customer as { _count: { contacts: number; opportunities: number } })._count.contacts} / ${(customer as { _count: { contacts: number; opportunities: number } })._count.opportunities}`
                        : "—"}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    {scope.role === "OWNER" && (
                      <form
                        action={claimPublicCustomerFormAction.bind(
                          null,
                          customer.id
                        )}
                      >
                        <button
                          type="submit"
                          className="min-h-11 btn btn-primary"
                        >
                          认领
                        </button>
                      </form>
                    )}
                    {scope.role === "ADMIN" && (
                      <form
                        className="flex gap-2"
                        action={setCustomerOwnerFormAction.bind(
                          null,
                          customer.id
                        )}
                      >
                        <select
                          name="ownerId"
                          className="rounded-lg border border-line-strong bg-paper-raised px-2 py-1 text-sm"
                          defaultValue=""
                        >
                          <option value="">移入公海</option>
                          {users.map((user) => (
                            <option key={user.id} value={user.id}>
                              指定给 {user.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="min-h-11 rounded-lg border border-line-strong px-3 py-2 text-sm text-ink hover:bg-paper-sunk"
                        >
                          保存
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > 0 && (
            <Pagination meta={meta} pathname="/customers/public-pool" />
          )}
        </Enter>
      )}
    </div>
  );
}
