import { notFound } from "next/navigation";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { NavLink } from "@/components/nav-link";
import { Enter } from "@/components/stagger";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/session";
import { OPPORTUNITY_STAGES } from "@/lib/opportunity-stages";
import { OpportunityForm } from "./opportunity-form";
import { loadOpportunitiesPageData } from "./page-data";
import {
  deleteOpportunityAction,
  updateOpportunityStageAction,
} from "./actions";

const stageMeta = Object.fromEntries(
  OPPORTUNITY_STAGES.map((stage) => [stage.value, stage])
) as Record<
  string,
  { label: string; tone: "blue" | "amber" | "green" | "zinc" }
>;

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
  const { opportunities, customers, users } = await loadOpportunitiesPageData(
    user,
    stage
  );

  return (
    <div>
      <Enter>
        <PageHeader
          title="商机"
          description={`共 ${opportunities.length} 个商机`}
          action={
            <div data-guide="create-opportunity">
              <OpportunityForm
                customers={customers}
                users={users}
                defaultOwnerId={user.id}
              />
            </div>
          }
        />
      </Enter>

      {/* 筛选胶囊：切换阶段时只换底色与文字色，用过渡而不是瞬间反色 */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <NavLink
          href="/opportunities"
          className={`rounded-full px-3 py-1 transition-colors duration-[var(--motion-base)] ease-[var(--ease-standard)] ${
            !stage
              ? "bg-zinc-900 text-white"
              : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"
          }`}
        >
          全部阶段
        </NavLink>
        {OPPORTUNITY_STAGES.map((item) => (
          <NavLink
            key={item.value}
            href={`/opportunities?stage=${item.value}`}
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
          className="overflow-hidden rounded-xl border border-zinc-200 bg-white"
        >
          <table className="w-full text-left text-sm">
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
                const meta =
                  stageMeta[opp.stage] ??
                  stageMeta[OPPORTUNITY_STAGES[0].value];
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
                          options={OPPORTUNITY_STAGES.map((item) => ({
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
          </table>
        </Enter>
      )}
    </div>
  );
}
