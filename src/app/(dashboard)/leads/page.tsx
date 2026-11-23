import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { NavLink } from "@/components/nav-link";
import { ExportButton } from "@/components/export-button";
import { Pagination } from "@/components/pagination";
import { Enter } from "@/components/stagger";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { listAssignableUsers } from "@/lib/db/repositories/user";
import { countLeadsForPage, listLeads } from "@/lib/db/repositories/sales";
import { accessScopeFor } from "@/lib/auth/scope";
import { getCurrentUser } from "@/lib/auth/session";
import { buildPaginationMeta, parsePagination } from "@/lib/pagination";
import { LeadStatus } from "@/generated/prisma/enums";
import { LeadForm } from "./lead-form";
import {
  convertLeadAction,
  deleteLeadAction,
  updateLeadStatusAction,
} from "./actions";

const statusMeta: Record<
  string,
  { label: string; tone: "blue" | "amber" | "green" | "zinc" }
> = {
  [LeadStatus.NEW]: { label: "新线索", tone: "blue" },
  [LeadStatus.FOLLOWING]: { label: "跟进中", tone: "amber" },
  [LeadStatus.CONVERTED]: { label: "已转化", tone: "green" },
  [LeadStatus.INVALID]: { label: "无效", tone: "zinc" },
};

/** 线索列表页。 */
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    page?: string | string[];
    pageSize?: string | string[];
  }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return <EmptyState message="请先登录后再查看线索。" />;
  }
  const scope = accessScopeFor(currentUser);
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : undefined;
  const pagination = parsePagination(params);
  const search = q ? { search: q } : {};
  const [leads, total, users] = await Promise.all([
    listLeads(
      { ...search, skip: pagination.skip, take: pagination.take },
      scope
    ),
    countLeadsForPage(search, scope),
    listAssignableUsers(currentUser),
  ]);
  const meta = buildPaginationMeta(pagination, total);

  return (
    <div>
      <Enter>
        <PageHeader
          title="线索"
          description={`共 ${total} 条线索`}
          action={<LeadForm users={users} currentUserId={currentUser.id} />}
        />
      </Enter>

      <form className="mb-4 flex gap-2" action="/leads" method="get">
        {/* 搜索即新条件，重置到第 1 页 */}
        <input type="hidden" name="page" value="1" />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="搜索线索名称、电话或邮箱"
          className="w-full max-w-sm rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white transition-colors duration-[var(--motion-fast)] hover:bg-zinc-900"
        >
          搜索
        </button>
        <ExportButton dataset="leads" params={{ q }} />
      </form>

      {leads.length === 0 ? (
        <EmptyState message="暂无线索数据，点击右上角「新建线索」开始添加。" />
      ) : (
        <Enter
          effect="fade"
          className="overflow-x-auto rounded-xl border border-zinc-200 bg-white"
        >
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">线索名称</th>
                <th className="px-4 py-3 font-medium">来源</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">负责人</th>
                <th className="px-4 py-3 font-medium">更新状态</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {leads.map((lead) => {
                const meta =
                  statusMeta[lead.status] ?? statusMeta[LeadStatus.NEW];
                return (
                  <tr
                    key={lead.id}
                    className="transition-colors duration-[var(--motion-fast)] hover:bg-zinc-50"
                  >
                    <td className="px-4 py-3 font-medium">{lead.name}</td>
                    <td className="px-4 py-3 text-zinc-600">
                      {lead.source ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {lead.owner?.name ?? "未分配"}
                    </td>
                    <td className="px-4 py-3">
                      <form action={updateLeadStatusAction.bind(null, lead.id)}>
                        <AutoSubmitSelect
                          name="status"
                          defaultValue={lead.status}
                          options={Object.entries(statusMeta).map(
                            ([value, m]) => ({
                              value,
                              label: m.label,
                            })
                          )}
                          className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm"
                        />
                      </form>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-2">
                        {lead.status !== LeadStatus.CONVERTED ? (
                          <form
                            action={convertLeadAction.bind(null, lead.id)}
                            className="flex items-center gap-2"
                          >
                            {currentUser.role === "ADMIN" && (
                              <select
                                name="ownerId"
                                defaultValue={lead.ownerId ?? currentUser.id}
                                className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm"
                              >
                                {users.map((user) => (
                                  <option key={user.id} value={user.id}>
                                    {user.name}
                                  </option>
                                ))}
                              </select>
                            )}
                            <button
                              type="submit"
                              className="min-h-11 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700 hover:bg-blue-100"
                            >
                              转化为商机
                            </button>
                          </form>
                        ) : (
                          <NavLink
                            href="/opportunities"
                            className="text-sm text-blue-600 transition-colors duration-[var(--motion-fast)] hover:text-blue-700 hover:underline"
                          >
                            查看商机
                          </NavLink>
                        )}
                        <form action={deleteLeadAction.bind(null, lead.id)}>
                          <button
                            type="submit"
                            className="text-sm text-red-600 hover:underline"
                          >
                            删除
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {total > 0 && (
              <Pagination meta={meta} pathname="/leads" filters={{ q }} />
            )}
          </table>
        </Enter>
      )}
    </div>
  );
}
