import Link from "next/link";
import { PageHeader, Badge } from "@/components/ui";
import { NavLink } from "@/components/nav-link";
import { Stagger, StaggerItem } from "@/components/stagger";
import { requireCurrentUser } from "@/lib/auth/session";
import { accessScopeFor } from "@/lib/auth/scope";
import { countCustomers } from "@/lib/db/repositories/customer";
import {
  countFollowUps,
  countLeads,
  countOpportunities,
} from "@/lib/db/repositories/sales";
import { isModelConfigured } from "@/lib/ai/model-config";
import { getDashboardCards } from "@/lib/analytics/dashboard-config";
import {
  CARD_LABELS,
  DASHBOARD_CARDS,
  type DashboardCard,
} from "@/lib/analytics/dashboard-cards";
import {
  loadCustomerLevelDistribution,
  loadOpportunityTrend,
  loadStageDistribution,
} from "@/lib/analytics/dashboard";
import { LevelChart, StageChart, TrendChart } from "./analytics/charts";
import { saveDashboardCardsAction } from "./dashboard-config-actions";
import {
  describeCardAction,
  describeOutcome,
  loadFeishuWorkbench,
} from "./feishu-workbench-data";

/**
 * 概览页：先回答「飞书在这个系统里干了什么」，再给业务数字。
 *
 * 页面结构刻意如此排序：以前这一页只有四个数字和一句营销文案，
 * 看不出飞书的存在。现在第一屏就是机器人做过的事、卡片完成的操作、
 * 以及「你在飞书里能做什么」的可执行入口。
 */

function relativeTime(from: Date): string {
  const diffMs = Date.now() - from.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return from.toLocaleDateString("zh-CN");
}

export default async function HomePage() {
  const currentUser = await requireCurrentUser();
  const scope = accessScopeFor(currentUser);
  const modelReady = await isModelConfigured();

  const [
    customerCount,
    leadCount,
    opportunityCount,
    followUpCount,
    workbench,
    cards,
  ] = await Promise.all([
    countCustomers(scope),
    countLeads(scope),
    countOpportunities(currentUser),
    countFollowUps(currentUser),
    loadFeishuWorkbench(currentUser, modelReady),
    getDashboardCards(currentUser.id),
  ]);

  const cardSet = new Set<DashboardCard>(cards);
  const needsCharts =
    cardSet.has("chart_stage") ||
    cardSet.has("chart_level") ||
    cardSet.has("chart_trend");
  const emptyStages: Awaited<ReturnType<typeof loadStageDistribution>> = [];
  const emptyLevels: Awaited<ReturnType<typeof loadCustomerLevelDistribution>> =
    [];
  const emptyTrend: Awaited<ReturnType<typeof loadOpportunityTrend>> = [];
  const chartData = needsCharts
    ? await Promise.all([
        cardSet.has("chart_stage")
          ? loadStageDistribution(currentUser)
          : Promise.resolve(emptyStages),
        cardSet.has("chart_level")
          ? loadCustomerLevelDistribution(currentUser)
          : Promise.resolve(emptyLevels),
        cardSet.has("chart_trend")
          ? loadOpportunityTrend(currentUser)
          : Promise.resolve(emptyTrend),
      ])
    : ([emptyStages, emptyLevels, emptyTrend] as const);
  const [stageData, levelData, trendData] = chartData;

  const statByCard: Record<
    string,
    { label: string; value: number; href: string }
  > = {
    stat_customers: { label: "客户", value: customerCount, href: "/customers" },
    stat_leads: { label: "线索", value: leadCount, href: "/leads" },
    stat_opportunities: {
      label: "商机",
      value: opportunityCount,
      href: "/opportunities",
    },
    stat_followups: {
      label: "跟进记录",
      value: followUpCount,
      href: "/customers",
    },
  };
  const stats = cards
    .filter((card) => card.startsWith("stat_"))
    .map((card) => statByCard[card])
    .filter(Boolean);

  return (
    <div>
      <div data-enter="rise">
        <PageHeader
          title="概览"
          description="销售在飞书里说话，CRM 负责记住与推进 · 数据来自本地 Postgres"
        />
      </div>

      {/* 第一屏：飞书工作台 */}
      <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">
              飞书工作台
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              销售在飞书里 @机器人 说一句话就能落成跟进；卡片上的按钮能直接改
              CRM 数据，不用打开网页。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={workbench.selfBound ? "green" : "amber"}>
              {workbench.selfBound ? "你的飞书已绑定" : "你的飞书未绑定"}
            </Badge>
            <Badge tone={workbench.modelReady ? "green" : "amber"}>
              {workbench.modelReady ? "模型已配置" : "模型未配置"}
            </Badge>
          </div>
        </div>

        <Stagger className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            {
              label: "机器人处理消息",
              value: workbench.bot.totalMessages,
              hint: "收到的 @提及",
            },
            {
              label: "落成跟进记录",
              value: workbench.bot.followUpsFromFeishu,
              hint: "无需打开网页",
            },
            {
              label: "主动追问",
              value: workbench.bot.clarifications,
              hint: "认不出的客户会问",
            },
            {
              label: "卡片完成操作",
              value: workbench.bot.cardActions,
              hint: "按钮直接改数据",
            },
          ].map((item, index) => (
            <StaggerItem key={item.label} index={index}>
              <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3">
                <div className="text-xs text-zinc-500">{item.label}</div>
                <div className="mt-1 text-2xl font-bold text-zinc-900">
                  {item.value}
                </div>
                <div className="mt-0.5 text-xs text-zinc-400">{item.hint}</div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        {/* 主动推送：说明机器人不只会回答，还会定时催办 */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
          <p className="text-sm text-blue-900">
            <strong className="font-medium">主动催办</strong>
            　机器人每天扫描一次， 把「跟进超期 / 客户沉默 /
            待回款」按负责人聚合成卡片推到飞书。 当前待办{" "}
            <strong>{workbench.reminders.items}</strong> 条
            {workbench.reminders.undeliverable > 0 && (
              <span className="text-amber-700">
                （{workbench.reminders.undeliverable}{" "}
                类因负责人未绑定飞书发不出去）
              </span>
            )}
          </p>
          <NavLink
            href="/reminders"
            className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            查看待办 →
          </NavLink>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* 机器人最近活动 */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-zinc-700">
              机器人最近处理
            </h3>
            {workbench.bot.recent.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-500">
                还没有收到消息。启动 <code>npm run feishu:events</code>{" "}
                后在飞书里 @机器人 说一句试试。
              </div>
            ) : (
              <ul className="space-y-2">
                {workbench.bot.recent.map((item) => (
                  <li
                    key={item.messageId}
                    className="rounded-lg border border-zinc-100 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
                      <span className="font-medium text-zinc-700">
                        {describeOutcome(item.outcome)}
                      </span>
                      <span>{relativeTime(item.createdAt)}</span>
                    </div>
                    {item.followUp ? (
                      <p className="mt-1 text-sm text-zinc-700">
                        {item.followUp.customerName ?? "未知客户"} ·{" "}
                        {item.followUp.content}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-zinc-500">
                        消息 {item.messageId.slice(0, 12)}…
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 卡片操作 + 引导 */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-zinc-700">
              飞书卡片完成的操作
            </h3>
            {workbench.bot.recentCardActions.filter(
              (a) => a.action !== "open_customer"
            ).length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-500">
                还没有人点过卡片按钮。这些按钮能直接改 CRM
                数据——认领客户、推进销售阶段。
              </div>
            ) : (
              <ul className="space-y-2">
                {workbench.bot.recentCardActions
                  .filter((a) => a.action !== "open_customer")
                  .map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-zinc-100 px-4 py-3 text-sm"
                    >
                      <span className="text-zinc-700">
                        <strong className="font-medium">
                          {item.operatorName ?? "某位同事"}
                        </strong>
                        {" 在飞书里"}
                        {describeCardAction(item.action)}
                      </span>
                      <span className="shrink-0 text-xs text-zinc-400">
                        {relativeTime(item.createdAt)}
                      </span>
                    </li>
                  ))}
              </ul>
            )}

            {/* 管理员专属：未绑定身份的用户，直接影响机器人可用性 */}
            {workbench.unboundUsers.length > 0 && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <p className="font-medium">
                  有 {workbench.unboundUsers.length} 位同事的飞书身份还没绑定
                </p>
                <p className="mt-1 text-amber-700">
                  {workbench.unboundUsers.map((u) => u.name).join("、")}
                  在飞书里 @机器人 时会被提示「账号未绑定」，无法记录跟进。
                </p>
                <Link
                  href="/settings/users"
                  className="mt-2 inline-block text-amber-900 underline"
                >
                  去绑定 →
                </Link>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <NavLink
                href="/customers/public-pool"
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                去公海体验卡片认领
              </NavLink>
              <NavLink
                href="/funnel"
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                看销售漏斗
              </NavLink>
              <NavLink
                href="/settings"
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                飞书与模型配置
              </NavLink>
            </div>
          </div>
        </div>
      </section>

      {/* 业务数字与图表：按当前用户的仪表盘配置显示 */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-700">业务数据</h2>
        <details className="text-sm">
          <summary className="cursor-pointer text-blue-600 hover:underline">
            自定义卡片
          </summary>
          <form
            action={saveDashboardCardsAction}
            className="mt-3 flex flex-wrap gap-3 rounded-lg border border-zinc-200 bg-white p-4"
          >
            {DASHBOARD_CARDS.map((card) => (
              <label
                key={card}
                className="flex items-center gap-1.5 text-zinc-700"
              >
                <input
                  type="checkbox"
                  name="cards"
                  value={card}
                  defaultChecked={cardSet.has(card)}
                  className="rounded border-zinc-300"
                />
                {CARD_LABELS[card]}
              </label>
            ))}
            <button
              type="submit"
              className="ml-auto min-h-11 rounded-lg bg-zinc-800 px-3 py-2.5 text-sm font-medium text-white hover:bg-zinc-900"
            >
              保存布局
            </button>
          </form>
        </details>
      </div>

      {stats.length > 0 && (
        <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, index) => (
            <StaggerItem key={stat.label} index={index}>
              <NavLink
                href={stat.href}
                className="group block rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-[box-shadow,border-color] duration-[var(--motion-base)] ease-[var(--ease-out-expo)] hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"
              >
                <div className="text-sm font-medium text-zinc-500">
                  {stat.label}
                </div>
                <div className="mt-2 text-3xl font-bold text-zinc-900">
                  {stat.value}
                </div>
              </NavLink>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      {(cardSet.has("chart_stage") ||
        cardSet.has("chart_level") ||
        cardSet.has("chart_trend")) && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {cardSet.has("chart_stage") && (
            <section className="rounded-xl border border-zinc-200 bg-white p-6">
              <h3 className="mb-4 text-sm font-semibold text-zinc-900">
                商机阶段分布
              </h3>
              <StageChart data={stageData} />
            </section>
          )}
          {cardSet.has("chart_level") && (
            <section className="rounded-xl border border-zinc-200 bg-white p-6">
              <h3 className="mb-4 text-sm font-semibold text-zinc-900">
                客户等级分布
              </h3>
              <LevelChart data={levelData} />
            </section>
          )}
          {cardSet.has("chart_trend") && (
            <section className="rounded-xl border border-zinc-200 bg-white p-6 lg:col-span-2">
              <h3 className="mb-4 text-sm font-semibold text-zinc-900">
                近 6 个月商机趋势
              </h3>
              <TrendChart data={trendData} />
            </section>
          )}
        </div>
      )}

      <div
        className="mt-8 rounded-xl border border-zinc-200 bg-white p-6"
        data-enter="fade"
      >
        <h2 className="text-base font-semibold text-zinc-900">
          为什么不在飞书里直接管客户
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-4 text-sm leading-6 text-zinc-600 sm:grid-cols-3">
          <div>
            <div className="font-medium text-zinc-800">
              飞书管不住结构化事实
            </div>
            群聊里的「预算 80 万」「下周三交方案」散落在对话里，
            三个月后查不出来。CRM 把它们变成可查询的字段。
          </div>
          <div>
            <div className="font-medium text-zinc-800">飞书没有业务规则</div>
            商机阶段不能乱跳、报价金额由条目汇总、订单要能追溯到合同。
            这些约束必须在代码里，不在聊天记录里。
          </div>
          <div>
            <div className="font-medium text-zinc-800">飞书没有归属边界</div>
            谁能看哪个客户由负责人决定，在服务端判定。
            群成员和客户负责人本来就是两件事。
          </div>
        </div>
        <p className="mt-4 text-sm text-zinc-500">
          所以分工是：
          <strong className="text-zinc-700">
            结构、规则、权限放 CRM， 触达与交互放飞书
          </strong>
          。销售不用打开网页，老板在网页看全局。
        </p>
      </div>
    </div>
  );
}
