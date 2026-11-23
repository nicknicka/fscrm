import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { NavLink } from "@/components/nav-link";
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

  return (
    <div>
      <Enter>
        <PageHeader title="公海" description={`共 ${total} 个公海客户`} />
      </Enter>

      {customers.length === 0 ? (
        <EmptyState message="公海暂无客户。" />
      ) : (
        <Enter
          effect="fade"
          className="overflow-hidden rounded-xl border border-zinc-200 bg-white"
        >
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-500">
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
            <tbody className="divide-y divide-zinc-100">
              {customers.map((customer: PublicPoolCustomerSummary) => (
                <tr
                  key={customer.id}
                  className="transition-colors duration-[var(--motion-fast)] hover:bg-zinc-50"
                >
                  <td className="px-4 py-3">
                    {scope.role === "ADMIN" ? (
                      <NavLink
                        href={`/customers/${customer.id}`}
                        className="font-medium text-blue-600 transition-colors duration-[var(--motion-fast)] hover:text-blue-700 hover:underline"
                      >
                        {customer.name}
                      </NavLink>
                    ) : (
                      // 普通负责人认领前只能看到最小信息，详情页仍受负责人范围限制。
                      <span className="font-medium text-zinc-900">
                        {customer.name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={levelTone[customer.level]}>
                      {levelLabel[customer.level]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {customer.industry ?? "—"}
                  </td>
                  {scope.role === "ADMIN" && (
                    <td className="px-4 py-3 text-zinc-600">
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
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors duration-[var(--motion-fast)] hover:bg-blue-700"
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
                          className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm"
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
                          className="rounded-lg border border-zinc-300 px-3 py-1 text-sm text-zinc-700 hover:bg-zinc-50"
                        >
                          保存
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>

            {total > 0 && (
              <Pagination meta={meta} pathname="/customers/public-pool" />
            )}
          </table>
        </Enter>
      )}
    </div>
  );
}
