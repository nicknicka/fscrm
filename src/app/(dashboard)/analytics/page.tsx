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

/* 这些页面读取会话与数据库，属于请求时数据，无法静态预渲染。 */
export const instant = false;

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
        <div className="rounded-xl border border-line bg-paper-raised p-6">
          <div className="text-sm text-ink-faint">赢单率（金额）</div>
          <div className="num-kpi mt-2 text-ink">{winRate.rate}%</div>
          <div className="mt-1 text-xs text-ink-faint">
            赢单 ¥{winRate.wonAmount.toLocaleString("zh-CN")} / 全部 ¥
            {winRate.totalAmount.toLocaleString("zh-CN")}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-paper-raised p-6">
          <div className="text-sm text-ink-faint">赢单数 / 商机总数</div>
          <div className="mt-2 text-3xl font-bold text-ink">
            {winRate.wonCount} / {winRate.totalCount}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-paper-raised p-6">
          <div className="text-sm text-ink-faint">阶段分布基数</div>
          <div className="mt-2 text-3xl font-bold text-ink">{stageTotal}</div>
          <div className="mt-1 text-xs text-ink-faint">
            个商机（按权限范围）
          </div>
        </div>
      </section>

      {/* 阶段转化：各阶段商机数占比 */}
      {stages.length > 0 && (
        <section className="mb-6 rounded-xl border border-line bg-paper-raised p-6">
          <h2 className="mb-4 text-base font-semibold text-ink">
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
                  <span className="w-20 shrink-0 text-ink-soft">
                    {stage.label}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper-sunk">
                    <div
                      className="h-full rounded-full bg-brass-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-ink-faint">
                    {stage.count} · {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-paper-raised p-6">
          <h2 className="mb-4 text-base font-semibold text-ink">
            商机阶段分布
          </h2>
          <StageChart data={stages} />
        </section>

        <section className="rounded-xl border border-line bg-paper-raised p-6">
          <h2 className="mb-4 text-base font-semibold text-ink">
            客户等级分布
          </h2>
          <LevelChart data={levels} />
        </section>

        <section className="rounded-xl border border-line bg-paper-raised p-6 lg:col-span-2">
          <h2 className="mb-4 text-base font-semibold text-ink">
            近 6 个月商机趋势
          </h2>
          <TrendChart data={trend} />
        </section>
      </div>
    </div>
  );
}
