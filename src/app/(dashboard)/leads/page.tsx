import { ExportButton } from "@/components/export-button";
import { LeadTable, type LeadRow } from "@/components/lead-table";
import { Pagination } from "@/components/pagination";
import { Enter } from "@/components/stagger";
import { EmptyState, PageHeader } from "@/components/ui";
import { EmptyStatePanel } from "@/components/empty-state";
import { listAssignableUsers } from "@/lib/db/repositories/user";
import {
  countLeadsByStatus,
  countLeadsForPage,
  listLeads,
} from "@/lib/db/repositories/sales";
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

/* 这些页面读取会话与数据库，属于请求时数据，无法静态预渲染。 */
export const instant = false;

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
  const [leads, total, statusCounts, users] = await Promise.all([
    listLeads(
      { ...search, skip: pagination.skip, take: pagination.take },
      scope
    ),
    countLeadsForPage(search, scope),
    countLeadsByStatus(search, scope),
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

      {/* 状态带：四状态计数。全表同状态时纯比例条没有信息量，
          改用计数卡——每一项都自带分母，空状态也读得出「这里确实是 0」。
          计数来自全量 groupBy（countLeadsByStatus），分母用 total，
          所以翻页时不会变成「当前页条数」；各状态之和等于 total。 */}
      {total > 0 && (
        <Enter
          effect="fade"
          className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {(
            [
              [LeadStatus.NEW, "新线索", "bg-info"],
              [LeadStatus.FOLLOWING, "跟进中", "bg-brass-500"],
              [LeadStatus.CONVERTED, "已转化", "bg-ok"],
              [LeadStatus.INVALID, "无效", "bg-line-strong"],
            ] as const
          ).map(([status, label, color]) => {
            const count = statusCounts[status] ?? 0;
            return (
              <div
                key={status}
                className="rounded-xl border border-line bg-paper-raised px-4 py-3.5"
              >
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
                  <span className="text-xs text-ink-faint">{label}</span>
                </div>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="num-stat text-ink">{count}</span>
                  <span className="tnum text-xs text-ink-faint">/ {total}</span>
                </div>
              </div>
            );
          })}
        </Enter>
      )}

      <form className="mb-4 flex gap-2" action="/leads" method="get">
        {/* 搜索即新条件，重置到第 1 页 */}
        <input type="hidden" name="page" value="1" />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="搜索线索名称、电话或邮箱"
          className="w-full max-w-sm rounded-lg border border-line-strong bg-paper-raised px-3 py-2 text-sm outline-none focus:border-brass-500"
        />
        <button
          type="submit"
          className="rounded-lg bg-ink-800 px-4 py-2 text-sm font-medium text-white transition-colors duration-[var(--motion-fast)] hover:bg-ink-800"
        >
          搜索
        </button>
        <ExportButton dataset="leads" params={{ q }} />
      </form>

      {leads.length === 0 ? (
        <Enter effect="fade">
          <EmptyStatePanel
            title="还没有线索"
            description={
              q
                ? `没有匹配「${q}」的线索，换个关键词试试。`
                : "线索是还没建立客户关系的原始名单：记下来源和联系方式即可。谈出明确意向后，点「转化为商机」——系统会建好客户和商机，跟进记录从商机页开始记。"
            }
            action={<LeadForm users={users} currentUserId={currentUser.id} />}
          />
        </Enter>
      ) : (
        <Enter
          effect="fade"
          className="overflow-x-auto rounded-xl border border-line bg-paper-raised"
        >
          <LeadTable
            leads={leads as LeadRow[]}
            updateStatusAction={(id: string) =>
              updateLeadStatusAction.bind(null, id)
            }
            convertAction={(id: string) => convertLeadAction.bind(null, id)}
            renderActions={(lead: LeadRow) => {
              /* 已转化的线索只需「查看商机」，不再提供转化与删除入口。 */
              if (lead.status === LeadStatus.CONVERTED) return null;
              return (
                <>
                  {/* 管理员可在转化时指定负责人；普通负责人强制归属本人。 */}
                  {currentUser.role === "ADMIN" && (
                    <select
                      name="ownerId"
                      form={`convert-${lead.id}`}
                      defaultValue={lead.ownerId ?? currentUser.id}
                      className="rounded-lg border border-line-strong bg-paper-raised px-2 py-1 text-sm"
                    >
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <form action={deleteLeadAction.bind(null, lead.id)}>
                    <button
                      type="submit"
                      aria-label={`删除线索 ${lead.name}`}
                      title="删除线索"
                      className="rounded-md p-1.5 text-ink-faint opacity-0 transition-opacity duration-[var(--motion-fast)] hover:bg-danger-bg hover:text-danger focus-visible:opacity-100 group-hover/row:opacity-100"
                    >
                      ✕
                    </button>
                  </form>
                </>
              );
            }}
          />
          {total > 0 && (
            <Pagination meta={meta} pathname="/leads" filters={{ q }} />
          )}
        </Enter>
      )}
    </div>
  );
}
