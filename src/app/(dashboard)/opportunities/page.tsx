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
import { OpportunityForm } from "./opportunity-form";
import { loadOpportunitiesPageData } from "./page-data";
import {
  deleteOpportunityAction,
  updateOpportunityStageAction,
} from "./actions";

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
  const { opportunities, total, customers, users } =
    await loadOpportunitiesPageData(user, { stage, q, ownerId }, pagination);
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
  const meta = buildPaginationMeta(pagination, total);
  // 搜索/负责人筛选表单需保留当前阶段；阶段胶囊需保留搜索与负责人。
  const activeFilters = { stage, q, ownerId };

  return (
    <div>
      <Enter>
        <PageHeader
          title="商机"
          description={`共 ${total} 个商机`}
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

      {/* 搜索 + 负责人筛选。切换条件都重置到第 1 页，并保留当前阶段。 */}
      <form
        className="mb-4 flex flex-wrap items-center gap-2"
        action="/opportunities"
        method="get"
      >
        <input type="hidden" name="page" value="1" />
        {stage && <input type="hidden" name="stage" value={stage} />}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="搜索商机名称、客户或备注"
          className="w-full max-w-xs rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
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
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
            />
          </>
        )}
        <button
          type="submit"
          className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white transition-colors duration-[var(--motion-fast)] hover:bg-zinc-900"
        >
          筛选
        </button>
        <ExportButton
          dataset="opportunities"
          params={{
            q,
            stage,
            ...(user.role === "ADMIN" ? { ownerId } : {}),
          }}
        />
      </form>

      {/* 筛选胶囊：切换阶段时只换底色与文字色，用过渡而不是瞬间反色 */}
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
              ? "bg-zinc-900 text-white"
              : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"
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
                ? "bg-zinc-900 text-white"
                : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"
            }`}
          >
            {item.label}
          </NavLink>
        ))}
      </div>

      {opportunities.length === 0 ? (
        <EmptyState message="暂无商机数据，点击右上角「新建商机」开始添加。" />
      ) : (
        <Enter
          effect="fade"
          className="overflow-x-auto rounded-xl border border-zinc-200 bg-white"
        >
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-500">
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
            <tbody className="divide-y divide-zinc-100">
              {opportunities.map((opp) => {
                const meta = stageMeta[opp.stage] ?? stageMeta[stages[0].value];
                return (
                  <tr
                    key={opp.id}
                    className="transition-colors duration-[var(--motion-fast)] hover:bg-zinc-50"
                  >
                    <td className="px-4 py-3 font-medium">
                      <NavLink
                        href={`/opportunities/${opp.id}`}
                        className="text-blue-600 transition-colors duration-[var(--motion-fast)] hover:text-blue-700 hover:underline"
                      >
                        {opp.name}
                      </NavLink>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {opp.customer?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {opp.amount != null
                        ? `¥${opp.amount.toLocaleString("zh-CN")}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
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
                          className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm"
                        />
                      </form>
                    </td>
                    <td className="px-4 py-3">
                      <form action={deleteOpportunityAction.bind(null, opp.id)}>
                        <button
                          type="submit"
                          className="text-sm text-red-600 hover:underline"
                        >
                          删除
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {total > 0 && (
              <Pagination
                meta={meta}
                pathname="/opportunities"
                filters={activeFilters}
              />
            )}
          </table>
        </Enter>
      )}
    </div>
  );
}
