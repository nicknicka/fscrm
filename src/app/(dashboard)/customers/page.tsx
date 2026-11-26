import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { Pagination } from "@/components/pagination";
import { NavLink } from "@/components/nav-link";
import { ExportButton } from "@/components/export-button";
import { Enter } from "@/components/stagger";
import { AutoSubmitForm } from "@/components/auto-submit-form";
import { requireCurrentUser } from "@/lib/auth/session";
import { accessScopeFor } from "@/lib/auth/scope";
import {
  countCustomersForPage,
  listCustomers,
} from "@/lib/db/repositories/customer";
import { buildPaginationMeta, parsePagination } from "@/lib/pagination";
import { listAssignableUsers } from "@/lib/db/repositories/user";
import { CustomerLevel } from "@/generated/prisma/enums";
import { customerLifecycleLabel } from "@/lib/customer-lifecycle";
import { CustomerForm } from "./customer-form";
import { CustomerImportPanel } from "./customer-import-panel";
import { deleteCustomerAction } from "./actions";
import { setCustomerOwnerFormAction } from "./public-pool-actions";

/* 这些页面读取会话与数据库，属于请求时数据，无法静态预渲染。 */
export const instant = false;

/**
 * 客户列表页。
 *
 * 先读取当前会话，再以该负责人/管理员的访问范围查询客户；
 * 新建客户的负责人选项同样按角色收敛。
 */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    page?: string | string[];
    pageSize?: string | string[];
  }>;
}) {
  const currentUser = await requireCurrentUser();
  const scope = accessScopeFor(currentUser);
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : undefined;
  const pagination = parsePagination(params);
  const search = q ? { search: q } : {};
  const [customers, total, users] = await Promise.all([
    listCustomers(
      { ...search, skip: pagination.skip, take: pagination.take },
      scope
    ),
    countCustomersForPage(search, scope),
    listAssignableUsers(currentUser),
  ]);
  const meta = buildPaginationMeta(pagination, total);

  const levelTone: Record<string, "default" | "amber" | "zinc"> = {
    [CustomerLevel.HIGH]: "amber",
    [CustomerLevel.MEDIUM]: "zinc",
    [CustomerLevel.LOW]: "default",
  };
  const levelLabel: Record<string, string> = {
    [CustomerLevel.HIGH]: "高价值",
    [CustomerLevel.MEDIUM]: "中价值",
    [CustomerLevel.LOW]: "低价值",
  };

  return (
    <div>
      <Enter>
        <PageHeader
          title="客户"
          description={`共 ${total} 个客户`}
          action={
            <div data-guide="create-customer">
              <CustomerForm
                users={users.map((u) => ({ id: u.id, name: u.name }))}
              />
            </div>
          }
        />
      </Enter>

      <CustomerImportPanel />

      <form className="mb-4 flex gap-2" action="/customers" method="get">
        {/* 搜索即新条件，重置到第 1 页 */}
        <input type="hidden" name="page" value="1" />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="搜索客户名称、电话或邮箱"
          className="w-full max-w-sm rounded-lg border border-line-strong bg-paper-raised px-3 py-2 text-sm outline-none focus:border-brass-500"
        />
        <button
          type="submit"
          className="rounded-lg bg-ink-800 px-4 py-2 text-sm font-medium text-white transition-colors duration-[var(--motion-fast)] hover:bg-ink-800"
        >
          搜索
        </button>
        <ExportButton dataset="customers" params={{ q }} />
      </form>

      {customers.length === 0 ? (
        <EmptyState message="暂无客户数据，点击右上角「新建客户」开始添加。" />
      ) : (
        <Enter
          effect="fade"
          className="overflow-x-auto rounded-xl border border-line bg-paper-raised"
        >
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-paper-sunk text-ink-faint">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  客户名称
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  等级
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  生命周期
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  行业
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  负责人
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  联系人/商机
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium text-right">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {customers.map((customer, idx) => (
                <tr key={customer.id} className="row-glow group/row">
                  <td className="px-4 py-3">
                    {/*
                      引导第三步的高亮与点击判定都挂在客户名称链接上：
                      挂在外层 <tr> 上时，用户点的是里面的名称链接，
                      「点中目标本身」的判定永远收不到这一下，步骤会卡住。
                    */}
                    <NavLink
                      href={`/customers/${customer.id}`}
                      {...(idx === 0 ? { "data-guide": "customer-row" } : {})}
                      className="font-medium text-brass-600 transition-colors duration-[var(--motion-fast)] hover:text-brass-500 hover:underline"
                    >
                      {customer.name}
                    </NavLink>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={levelTone[customer.level]}>
                      {levelLabel[customer.level]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone="blue">
                      {customerLifecycleLabel[customer.lifecycle]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {customer.industry ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {customer.owner?.name ?? "未分配"}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {(
                      customer as {
                        _count?: { contacts: number; opportunities: number };
                      }
                    )._count?.contacts ?? 0}
                    {" / "}
                    {(
                      customer as {
                        _count?: { contacts: number; opportunities: number };
                      }
                    )._count?.opportunities ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {scope.role === "ADMIN" && (
                        <AutoSubmitForm
                          action={setCustomerOwnerFormAction.bind(
                            null,
                            customer.id
                          )}
                        >
                          <select
                            name="ownerId"
                            className="rounded-lg border border-line-strong bg-paper-raised px-2 py-1 text-xs text-ink-soft outline-none transition-colors focus:border-brass-500"
                            defaultValue={customer.ownerId ?? ""}
                            aria-label={`变更 ${customer.name} 的负责人`}
                          >
                            <option value="">移入公海</option>
                            {users.map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.name}
                              </option>
                            ))}
                          </select>
                        </AutoSubmitForm>
                      )}
                      <form
                        action={deleteCustomerAction.bind(null, customer.id)}
                      >
                        <button
                          type="submit"
                          aria-label={`删除 ${customer.name}`}
                          title="删除客户"
                          className="rounded-md p-1.5 text-ink-faint opacity-0 transition-opacity duration-[var(--motion-fast)] hover:bg-danger-bg hover:text-danger focus-visible:opacity-100 group-hover/row:opacity-100"
                        >
                          ✕
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > 0 && (
            <Pagination meta={meta} pathname="/customers" filters={{ q }} />
          )}
        </Enter>
      )}
    </div>
  );
}
