import { notFound } from "next/navigation";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { NavLink } from "@/components/nav-link";
import { ExportButton } from "@/components/export-button";
import { Pagination } from "@/components/pagination";
import { Enter } from "@/components/stagger";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/session";
import {
  buildPaginationMeta,
  paginationHref,
  parsePagination,
} from "@/lib/pagination";
import { OPPORTUNITY_STAGES } from "@/lib/opportunity-stages";
import { listStageConfigs } from "@/lib/db/repositories/stage-config";
import { LeadTable, type LeadRow } from "@/components/lead-table";
import {
  convertLeadAction,
  updateLeadStatusAction,
} from "@/app/(dashboard)/leads/actions";
import { OpportunityForm } from "./opportunity-form";
import {
  loadLeadsPageData,
  loadOpportunitiesPageData,
  loadPipelineCounts,
  parsePipelineView,
} from "./page-data";
import {
  deleteOpportunityAction,
  updateOpportunityStageAction,
} from "./actions";

/* 这些页面读取会话与数据库，属于请求时数据，无法静态预渲染。 */
export const instant = false;

type LeadRowsData = Awaited<ReturnType<typeof loadLeadsPageData>>;
type PaginationMeta = ReturnType<typeof buildPaginationMeta>;

/**
 * 线索视图的列表。
 *
 * 与商机表共用一页，但列不同：线索没有客户、金额、销售阶段，
 * 只有来源与培育状态。金额列在这里刻意不出现——它就是「还没谈」的证明。
 */
function LeadRows({
  data,
  meta,
}: {
  data: LeadRowsData;
  meta: PaginationMeta;
}) {
  const { leads, total } = data;

  if (leads.length === 0) {
    return (
      <EmptyState message="暂无线索，点击页面右上角新建，或切换到「商机」看在谈的单子。" />
    );
  }

  return (
    <Enter
      effect="fade"
      className="overflow-x-auto rounded-xl border border-line bg-paper-raised"
    >
      {/* 与 /leads 页面共用同一张表：线索视图是只读的，不多带删除与负责人选择。 */}
      <LeadTable
        leads={leads as LeadRow[]}
        updateStatusAction={(id: string) =>
          updateLeadStatusAction.bind(null, id)
        }
        convertAction={(id: string) => convertLeadAction.bind(null, id)}
      />
      {total > 0 && (
        <Pagination
          meta={meta}
          pathname="/opportunities"
          filters={{ view: "leads" }}
        />
      )}
    </Enter>
  );
}

/** 商机列表页。 */
export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getCurrentUser();
  if (!user) notFound();

  const params = await searchParams;
  const stageParam = params.stage;
  const stage = typeof stageParam === "string" ? stageParam : undefined;
  const q = typeof params.q === "string" ? params.q : undefined;
  const ownerId =
    typeof params.ownerId === "string" ? params.ownerId : undefined;
  const pagination = parsePagination(params);
  // 视图轴：商机（在谈）与线索（未谈）共用这一页，用 view 切换。
  // 线索没有销售阶段，切到线索视图时忽略 stage，避免两套筛选互相干扰。
  const view = parsePipelineView(params.view);
  const isLeadView = view === "leads";
  const leadData = isLeadView
    ? await loadLeadsPageData(user, { q, ownerId }, pagination)
    : null;
  const { opportunities, total, customers, users } =
    await loadOpportunitiesPageData(
      user,
      { stage: isLeadView ? undefined : stage, q, ownerId },
      pagination
    );
  const pageTotal = leadData ? leadData.total : total;
  // 切换条的计数是固定基数（不受筛选影响），两个视图都能看到彼此有多少
  const pipelineCounts = await loadPipelineCounts(user);
  const stageConfigs = await listStageConfigs();
  const stages = stageConfigs.length > 0 ? stageConfigs : OPPORTUNITY_STAGES;
  const stageMeta = Object.fromEntries(
    stages.map((s) => [
      s.value,
      { label: s.label, tone: s.tone as "blue" | "amber" | "green" | "zinc" },
    ])
  ) as Record<
    string,
    { label: string; tone: "blue" | "amber" | "green" | "zinc" }
  >;
  const meta = buildPaginationMeta(pagination, pageTotal);
  // 搜索/负责人筛选表单需保留当前阶段；阶段胶囊需保留搜索与负责人。
  const activeFilters = { stage, q, ownerId };

  return (
    <div>
      <Enter>
        <PageHeader
          title="商机"
          description={
            isLeadView
              ? `共 ${pageTotal} 条线索 · 还没谈，谈出意向就转成商机`
              : `共 ${pageTotal} 个商机 · 已经在谈`
          }
          action={
            <div data-guide="create-opportunity">
              <OpportunityForm
                customers={customers}
                users={users}
                defaultOwnerId={user.id}
                stages={stages.map((s) => ({ value: s.value, label: s.label }))}
              />
            </div>
          }
        />
      </Enter>

      {/* 视图切换：同一条销售动线的上下游放在一页里。
          「商机」= 已挂客户、在谈；「线索」= 未挂客户、未谈。
          用真实数量做副标题，新人不用猜两边到底有什么区别。 */}
      <div
        role="tablist"
        aria-label="销售线索与商机"
        className="mb-4 inline-flex rounded-xl border border-line bg-paper-sunk p-1"
      >
        {(
          [
            ["opportunities", "商机", "在谈", pipelineCounts.opportunities],
            ["leads", "线索", "未谈", pipelineCounts.leads],
          ] as const
        ).map(([value, label, hint, count]) => {
          const active = view === value;
          return (
            <NavLink
              key={value}
              href={paginationHref(
                "/opportunities",
                { view: value },
                1,
                pagination.pageSize
              )}
              role="tab"
              aria-selected={active}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm transition-colors duration-[var(--motion-base)] ease-[var(--ease-standard)] ${
                active
                  ? "bg-paper-raised font-semibold text-ink shadow-sm"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {label}
              <span className="text-xs font-normal text-ink-faint">
                {hint} · {count}
              </span>
            </NavLink>
          );
        })}
      </div>

      {/* 搜索 + 负责人筛选。切换条件都重置到第 1 页，并保留当前阶段。 */}
      <form
        className="mb-4 flex flex-wrap items-center gap-2"
        action="/opportunities"
        method="get"
      >
        <input type="hidden" name="page" value="1" />
        {isLeadView && <input type="hidden" name="view" value="leads" />}
        {!isLeadView && stage && (
          <input type="hidden" name="stage" value={stage} />
        )}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={
            isLeadView ? "搜索线索名称、电话或邮箱" : "搜索商机名称、客户或备注"
          }
          className="w-full max-w-xs rounded-lg border border-line-strong bg-paper-raised px-3 py-2 text-sm outline-none focus:border-brass-500"
        />
        {user.role === "ADMIN" && (
          <>
            <AutoSubmitSelect
              name="ownerId"
              defaultValue={ownerId ?? ""}
              options={[
                { value: "", label: "全部负责人" },
                ...users.map((u) => ({ value: u.id, label: u.name })),
              ]}
              className="rounded-lg border border-line-strong bg-paper-raised px-3 py-2 text-sm"
            />
          </>
        )}
        <button
          type="submit"
          className="rounded-lg bg-ink-800 px-4 py-2 text-sm font-medium text-white transition-colors duration-[var(--motion-fast)] hover:bg-ink-800"
        >
          筛选
        </button>
        <ExportButton
          dataset={isLeadView ? "leads" : "opportunities"}
          params={
            isLeadView
              ? { q, ...(user.role === "ADMIN" ? { ownerId } : {}) }
              : { q, stage, ...(user.role === "ADMIN" ? { ownerId } : {}) }
          }
        />
      </form>

      {/* 筛选胶囊：切换阶段时只换底色与文字色，用过渡而不是瞬间反色。
          线索没有销售阶段，只看商机视图。 */}
      {!isLeadView && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <NavLink
            href={paginationHref(
              "/opportunities",
              { ...activeFilters, stage: undefined },
              1,
              pagination.pageSize
            )}
            className={`rounded-full px-3 py-1 transition-colors duration-[var(--motion-base)] ease-[var(--ease-standard)] ${
              !stage
                ? "bg-ink-900 text-white"
                : "bg-paper-raised text-ink-soft ring-1 ring-line hover:bg-paper-sunk"
            }`}
          >
            全部阶段
          </NavLink>
          {stages.map((item) => (
            <NavLink
              key={item.value}
              href={paginationHref(
                "/opportunities",
                { ...activeFilters, stage: item.value },
                1,
                pagination.pageSize
              )}
              className={`rounded-full px-3 py-1 transition-colors duration-[var(--motion-base)] ease-[var(--ease-standard)] ${
                stage === item.value
                  ? "bg-ink-900 text-white"
                  : "bg-paper-raised text-ink-soft ring-1 ring-line hover:bg-paper-sunk"
              }`}
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      )}

      {isLeadView && leadData ? (
        <LeadRows data={leadData} meta={meta} />
      ) : opportunities.length === 0 ? (
        <EmptyState message="暂无商机数据，点击右上角「新建商机」开始添加。" />
      ) : (
        <Enter
          effect="fade"
          className="overflow-x-auto rounded-xl border border-line bg-paper-raised"
        >
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="bg-paper-sunk text-ink-faint">
              <tr>
                <th className="px-4 py-3 font-medium">商机名称</th>
                <th className="px-4 py-3 font-medium">客户</th>
                <th className="px-4 py-3 font-medium">阶段</th>
                <th className="px-4 py-3 font-medium">预计金额</th>
                <th className="px-4 py-3 font-medium">负责人</th>
                <th className="px-4 py-3 font-medium">更新阶段</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {opportunities.map((opp) => {
                const meta = stageMeta[opp.stage] ?? stageMeta[stages[0].value];
                return (
                  <tr key={opp.id} className="row-glow">
                    <td className="px-4 py-3 font-medium">
                      <NavLink
                        href={`/opportunities/${opp.id}`}
                        className="text-brass-600 transition-colors duration-[var(--motion-fast)] hover:text-brass-500 hover:underline"
                      >
                        {opp.name}
                      </NavLink>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {opp.customer?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {opp.amount != null
                        ? `¥${opp.amount.toLocaleString("zh-CN")}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {opp.owner?.name ?? "未分配"}
                    </td>
                    <td className="px-4 py-3">
                      <form
                        action={updateOpportunityStageAction.bind(null, opp.id)}
                      >
                        <AutoSubmitSelect
                          name="stage"
                          defaultValue={opp.stage}
                          options={stages.map((item) => ({
                            value: item.value,
                            label: item.label,
                          }))}
                          className="rounded-lg border border-line-strong bg-paper-raised px-2 py-1 text-sm"
                        />
                      </form>
                    </td>
                    <td className="px-4 py-3">
                      <form action={deleteOpportunityAction.bind(null, opp.id)}>
                        <button
                          type="submit"
                          className="text-sm text-danger hover:underline"
                        >
                          删除
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {total > 0 && (
            <Pagination
              meta={meta}
              pathname="/opportunities"
              filters={activeFilters}
            />
          )}
        </Enter>
      )}
    </div>
  );
}
