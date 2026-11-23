import { PageHeader } from "@/components/ui";
import { Enter } from "@/components/stagger";
import { getCurrentUser } from "@/lib/auth/session";
import {
  loadCustomerLevelDistribution,
  loadOpportunityTrend,
  loadStageDistribution,
  loadWinRate,
} from "@/lib/analytics/dashboard";
import { LevelChart, StageChart, TrendChart } from "./charts";

/**
 * 销售分析页：阶段分布、商机趋势、客户等级分布。
 * 数据全部按当前会话权限实时聚合，与漏斗/列表口径一致。
 */
export default async function AnalyticsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [stages, trend, levels, winRate] = await Promise.all([
    loadStageDistribution(user),
    loadOpportunityTrend(user),
    loadCustomerLevelDistribution(user),
    loadWinRate(user),
  ]);
  const stageTotal = stages.reduce((sum, s) => sum + s.count, 0);

  return (
    <div>
      <Enter>
        <PageHeader
          title="销售分析"
          description="阶段分布 · 商机趋势 · 客户等级，数据按你的权限范围实时统计"
        />
      </Enter>

      {/* 赢单率 KPI（金额口径） */}
      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <div className="text-sm text-zinc-500">赢单率（金额）</div>
          <div className="mt-2 text-3xl font-bold text-emerald-600">
            {winRate.rate}%
          </div>
          <div className="mt-1 text-xs text-zinc-400">
            赢单 ¥{winRate.wonAmount.toLocaleString("zh-CN")} / 全部 ¥
            {winRate.totalAmount.toLocaleString("zh-CN")}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <div className="text-sm text-zinc-500">赢单数 / 商机总数</div>
          <div className="mt-2 text-3xl font-bold text-zinc-900">
            {winRate.wonCount} / {winRate.totalCount}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <div className="text-sm text-zinc-500">阶段分布基数</div>
          <div className="mt-2 text-3xl font-bold text-zinc-900">
            {stageTotal}
          </div>
          <div className="mt-1 text-xs text-zinc-400">个商机（按权限范围）</div>
        </div>
      </section>

      {/* 阶段转化：各阶段商机数占比 */}
      {stages.length > 0 && (
        <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-zinc-900">
            阶段转化分布
          </h2>
          <div className="space-y-2">
            {stages.map((stage) => {
              const pct =
                stageTotal > 0
                  ? Math.round((stage.count / stageTotal) * 100)
                  : 0;
              return (
                <div
                  key={stage.stage}
                  className="flex items-center gap-3 text-sm"
                >
                  <span className="w-20 shrink-0 text-zinc-600">
                    {stage.label}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-zinc-500">
                    {stage.count} · {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-zinc-900">
            商机阶段分布
          </h2>
          <StageChart data={stages} />
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-zinc-900">
            客户等级分布
          </h2>
          <LevelChart data={levels} />
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-6 lg:col-span-2">
          <h2 className="mb-4 text-base font-semibold text-zinc-900">
            近 6 个月商机趋势
          </h2>
          <TrendChart data={trend} />
        </section>
      </div>
    </div>
  );
}
