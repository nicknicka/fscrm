import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { formatMoney, formatPercent } from "@/lib/format-numbers";
import { NavLink } from "@/components/nav-link";
import { Stagger, StaggerItem } from "@/components/stagger";
import { CountUp } from "@/components/count-up";
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
  loadWinRate,
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
 * 视觉设计：工作台是全页的主角——墨玉深卡衬琥珀金，与侧栏同一块料子，
 * 让「飞书能力」一眼可读；下方的业务数字是纸面上的编辑式排版，
 * 数字用 tabular-nums 对齐，悬停时卡片被「光抬起来」。
 */

/* 读取会话与数据库，属于请求时数据，无法静态预渲染。 */
export const instant = false;

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
    winRate,
  ] = await Promise.all([
    countCustomers(scope),
    countLeads(scope),
    countOpportunities(currentUser),
    countFollowUps(currentUser),
    loadFeishuWorkbench(currentUser, modelReady),
    getDashboardCards(currentUser.id),
    loadWinRate(currentUser),
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

  // 每张卡都要有口径：只有一个数字的卡片读者无法判断它意味着什么。
  // 金额口径来自同一份图表数据，不额外查询。
  const oppAmount =
    trendData.reduce((sum, item) => sum + (item.amount ?? 0), 0) ||
    stageData.reduce((sum, item) => sum + (item.count ?? 0) * 0, 0);
  const statByCard: Record<
    string,
    { label: string; value: number; hint: string; href: string }
  > = {
    stat_customers: {
      label: "客户",
      value: customerCount,
      hint: "在你的权限范围内",
      href: "/customers",
    },
    stat_leads: {
      label: "线索",
      value: leadCount,
      hint: "待培育与转化",
      href: "/leads",
    },
    stat_opportunities: {
      label: "商机",
      value: opportunityCount,
      hint: oppAmount > 0 ? `预计 ${formatMoney(oppAmount)}` : "在推进中",
      href: "/opportunities",
    },
    stat_followups: {
      label: "跟进记录",
      value: followUpCount,
      hint: "团队累计触达",
      href: "/customers",
    },
  };
  const stats = cards
    .filter((card) => card.startsWith("stat_"))
    .map((card) => statByCard[card])
    .filter(Boolean);

  // 飞书机器人四项指标：全为 0 说明工作台还没跑起来
  const botMetrics = [
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
  ];
  const botIdle = botMetrics.every((metric) => metric.value === 0);
  // 模型未配置时机器人根本跑不起来，工作台细节没有信息可给，
  // 首屏应该留给业务数字——这里只保留一条可操作的状态条。
  const workbenchCollapsed = !workbench.modelReady;
  const hasBusinessData = customerCount + leadCount + opportunityCount > 0;

  return (
    <div>
      <div data-enter="rise">
        <PageHeader
          title="概览"
          description="销售在飞书里说话，CRM 负责记住与推进 · 数据来自本地 Postgres"
        />
      </div>

      {/* 模型未配置：工作台折叠成一条状态条，首屏留给业务数字 */}
      {workbenchCollapsed && (
        <section
          data-enter="rise"
          className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-brass-400/35 bg-brass-50 px-5 py-4"
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brass-500 text-xs font-bold text-ink-950"
            >
              !
            </span>
            <div>
              <p className="text-sm font-medium text-ink">
                飞书机器人还没有接入模型
              </p>
              <p className="mt-0.5 text-xs text-ink-soft">
                配好模型后，同事在飞书里 @机器人 说一句话就能落成跟进，
                卡片按钮也能直接改 CRM 数据。
              </p>
            </div>
          </div>
          <NavLink href="/settings" className="btn btn-primary shrink-0">
            去配置
          </NavLink>
        </section>
      )}

      {/* 业务数字与图表：纸面上的编辑式排版，按当前用户的仪表盘配置显示 */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
            业务数据
          </h2>
          <span className="hidden h-px w-16 bg-line-strong sm:block" />
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-[13px] font-medium text-brass-600 transition-colors hover:text-brass-500">
            自定义卡片
          </summary>
          <form
            action={saveDashboardCardsAction}
            className="mt-3 flex flex-wrap gap-3 rounded-xl border border-line bg-paper-raised p-4 shadow-[var(--shadow-sm)]"
          >
            {DASHBOARD_CARDS.map((card) => (
              <label
                key={card}
                className="flex items-center gap-1.5 text-ink-soft"
              >
                <input
                  type="checkbox"
                  name="cards"
                  value={card}
                  defaultChecked={cardSet.has(card)}
                  className="rounded border-line-strong accent-brass-600"
                />
                {CARD_LABELS[card]}
              </label>
            ))}
            <button
              type="submit"
              className="ml-auto min-h-11 rounded-lg bg-ink-900 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink-800"
            >
              保存布局
            </button>
          </form>
        </details>
      </div>

      {/*
       * 首屏主角：管道里的钱。
       * 四张等宽数字卡每一张都在喊，结果没有一张被看见——这里让「商机金额」
       * 独占大半屏宽、用 hero 字号，其余计数退成右侧的一列细线行。
       */}
      <section
        data-enter="rise"
        className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-5"
      >
        {/* 主角卡：深墨底 + 琥珀金，与侧栏同料 */}
        <NavLink
          href="/opportunities"
          className="group relative col-span-1 flex flex-col overflow-hidden rounded-[16px] p-7 lg:col-span-3"
          style={{
            backgroundColor: "var(--hero-surface)",
            // 凸起感 = 底色抬升 + 顶面内高光 + 更重的下投影，三者一起说话
            boxShadow:
              "inset 0 1px 0 rgb(255 255 255 / 0.10), 0 2px 4px rgb(0 0 0 / 0.18), 0 18px 40px -16px rgb(0 0 0 / 0.55)",
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brass-400/70 to-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-brass-500/10 blur-3xl"
          />

          <div className="relative flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-brass-400" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
              管道中的金额
            </span>
          </div>

          <div
            className="num-hero relative mt-4"
            style={{ color: "var(--hero-text)" }}
          >
            {formatMoney(winRate.totalAmount)}
          </div>

          {/* 主角旁边的辅助信息：小标签 + 可读的中号数字，不做竖线拼接 */}
          <dl className="relative mt-5 flex flex-wrap gap-x-10 gap-y-4">
            {[
              {
                label: "已赢单",
                value: formatMoney(winRate.wonAmount),
                tone: "brass",
              },
              {
                label: "赢单率",
                value: formatPercent(winRate.rate),
                tone: "plain",
              },
              {
                label: "在跑商机",
                value: String(opportunityCount),
                tone: "plain",
              },
            ].map((item) => (
              <div key={item.label}>
                <dt
                  className="text-[11px] font-medium uppercase tracking-[0.1em]"
                  style={{ color: "var(--hero-muted)" }}
                >
                  {item.label}
                </dt>
                <dd
                  className={`tnum mt-1 whitespace-nowrap text-[15px] font-semibold ${
                    item.tone === "brass" ? "text-brass-400" : ""
                  }`}
                  style={
                    item.tone === "brass"
                      ? undefined
                      : { color: "var(--hero-text)" }
                  }
                >
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>

          <span className="relative mt-auto pt-6 inline-flex items-center gap-1 text-xs font-medium text-brass-400 transition-colors group-hover:text-brass-300">
            去商机列表
            <span
              aria-hidden
              className="transition-transform group-hover:translate-x-0.5"
            >
              →
            </span>
          </span>
        </NavLink>

        {/* 次要列：三行细线计数，不再抢主角的位置 */}
        <div className="col-span-1 flex flex-col justify-between gap-px overflow-hidden rounded-[16px] border border-line bg-line lg:col-span-2">
          {stats
            .filter((stat) => stat.label !== "商机")
            .map((stat) => (
              <NavLink
                key={stat.label}
                href={stat.href}
                className="group flex flex-1 items-center justify-between gap-3 bg-paper-raised px-5 py-4 transition-colors hover:bg-paper-sunk"
              >
                <span className="flex items-baseline gap-2.5">
                  <span className="tnum num-stat text-ink">
                    <CountUp value={stat.value} duration={700} />
                  </span>
                  <span className="text-[13px] text-ink-soft">
                    {stat.label}
                  </span>
                </span>
                <span
                  aria-hidden
                  className="text-ink-faint/60 transition-[color,translate] duration-[var(--motion-fast)] group-hover:translate-x-0.5 group-hover:text-brass-500"
                >
                  →
                </span>
              </NavLink>
            ))}
        </div>
      </section>

      {(cardSet.has("chart_stage") ||
        cardSet.has("chart_level") ||
        cardSet.has("chart_trend")) && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {cardSet.has("chart_stage") && (
            <section className="card p-6" data-enter="fade">
              <h3 className="mb-4 text-sm font-semibold text-ink">
                商机阶段分布
              </h3>
              <StageChart data={stageData} />
            </section>
          )}
          {cardSet.has("chart_level") && (
            <section className="card p-6" data-enter="fade">
              <h3 className="mb-4 text-sm font-semibold text-ink">
                客户等级分布
              </h3>
              <LevelChart data={levelData} />
            </section>
          )}
          {cardSet.has("chart_trend") && (
            <section className="card p-6 lg:col-span-2" data-enter="fade">
              <h3 className="mb-4 text-sm font-semibold text-ink">
                近 6 个月商机趋势
              </h3>
              <TrendChart data={trendData} />
            </section>
          )}
        </div>
      )}

      {/* 飞书工作台：墨玉深卡，与侧栏同料。模型没配好时折叠成状态条 */}
      {!workbenchCollapsed && (
        <section
          data-enter="rise"
          className="relative mb-6 overflow-hidden rounded-[18px] bg-ink-900 p-6 shadow-[var(--shadow-lg)] sm:p-6"
        >
          {/* 深卡内部的光泽：顶部一线琥珀高光 + 左上环境光 */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brass-400/70 to-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -left-24 -top-32 h-72 w-72 rounded-full bg-brass-500/[0.07] blur-3xl"
          />

          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="h-1.5 w-1.5 rounded-full bg-brass-400" />
                <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-white/50">
                  飞书工作台
                </h2>
              </div>
              <p className="mt-2.5 max-w-xl text-[15px] leading-relaxed text-white/85">
                销售在飞书里 @机器人 说一句话就能落成跟进；卡片上的按钮能直接改
                CRM 数据，不用打开网页。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                  workbench.selfBound
                    ? "bg-ok/15 text-emerald-300 ring-emerald-400/25"
                    : "bg-brass-500/15 text-brass-400 ring-brass-400/30"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    workbench.selfBound ? "bg-emerald-400" : "bg-brass-400"
                  }`}
                />
                {workbench.selfBound ? "飞书已绑定" : "飞书未绑定"}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                  workbench.modelReady
                    ? "bg-ok/15 text-emerald-300 ring-emerald-400/25"
                    : "bg-brass-500/15 text-brass-400 ring-brass-400/30"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    workbench.modelReady ? "bg-emerald-400" : "bg-brass-400"
                  }`}
                />
                {workbench.modelReady ? "模型已配置" : "模型未配置"}
              </span>
            </div>
          </div>

          {botIdle && !hasBusinessData ? (
            /* 全新工作台：四个 0 不如一句「怎么开始」 */
            <div className="relative mt-6 rounded-xl bg-brass-500/[0.10] px-5 py-4 ring-1 ring-inset ring-brass-400/25">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brass-500 text-sm font-semibold text-ink-950"
                >
                  1
                </span>
                <div>
                  <p className="text-sm font-medium text-white/90">
                    工作台还没跑起来——先在飞书里 @机器人 说一句话
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-white/45">
                    消息会被落成跟进记录；认不出的客户机器人会主动追问。 运行{" "}
                    <code className="text-brass-400">
                      npm run feishu:events
                    </code>{" "}
                    启动事件监听，然后对着机器人随便说一句试试。
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <Stagger className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {botMetrics.map((item, index) => (
                <StaggerItem key={item.label} index={index}>
                  <div className="rounded-xl bg-paper-raised/[0.045] px-4 py-3.5 ring-1 ring-inset ring-white/[0.07]">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-white/40">
                      {item.label}
                    </div>
                    <div className="tnum mt-1.5 text-[26px] font-semibold leading-none text-white">
                      <CountUp value={item.value} />
                    </div>
                    <div className="mt-1.5 text-xs text-white/35">
                      {item.hint}
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          )}

          {/* 主动推送：说明机器人不只会回答，还会定时催办 */}
          <div className="relative mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brass-500/[0.12] px-4 py-3.5 ring-1 ring-inset ring-brass-400/25">
            <p className="text-sm leading-relaxed text-[#f6ecd7]">
              <strong className="font-semibold text-brass-400">主动催办</strong>
              　机器人每天扫描一次，把「跟进超期 / 客户沉默 /
              待回款」按负责人聚合成卡片推到飞书。当前待办{" "}
              <strong className="tnum">{workbench.reminders.items}</strong> 条
              {workbench.reminders.undeliverable > 0 && (
                <span className="text-brass-400/80">
                  （{workbench.reminders.undeliverable}{" "}
                  类因负责人未绑定飞书发不出去）
                </span>
              )}
            </p>
            <NavLink
              href="/reminders"
              className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-brass-500 px-3.5 py-2.5 text-sm font-semibold text-ink-950 shadow-[0_2px_8px_-2px_rgb(0_0_0/0.5),inset_0_1px_0_rgb(255_255_255/0.25)] transition-[background-color,translate] duration-[var(--motion-fast)] hover:bg-brass-400 active:translate-y-px"
            >
              查看待办 →
            </NavLink>
          </div>

          <div className="relative mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* 机器人最近活动 */}
            <div>
              <h3 className="mb-2.5 text-[13px] font-semibold text-white/70">
                机器人最近处理
              </h3>
              {workbench.bot.recent.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-white/40">
                  这里会按时间倒序列出机器人最近处理的消息与落成的记录。
                </div>
              ) : (
                <ul className="space-y-2">
                  {workbench.bot.recent.map((item) => (
                    <li
                      key={item.messageId}
                      className="rounded-xl bg-paper-raised/[0.045] px-4 py-3 ring-1 ring-inset ring-white/[0.06]"
                    >
                      <div className="flex items-center justify-between gap-3 text-xs text-white/40">
                        <span className="font-medium text-white/75">
                          {describeOutcome(item.outcome)}
                        </span>
                        <span>{relativeTime(item.createdAt)}</span>
                      </div>
                      {item.followUp ? (
                        <p className="mt-1 text-sm leading-relaxed text-white/65">
                          {item.followUp.customerName ?? "未知客户"} ·{" "}
                          {item.followUp.content}
                        </p>
                      ) : (
                        <p className="mt-1 text-sm text-white/35">
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
              <h3 className="mb-2.5 text-[13px] font-semibold text-white/70">
                飞书卡片完成的操作
              </h3>
              {workbench.bot.recentCardActions.filter(
                (a) => a.action !== "open_customer"
              ).length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-white/40">
                  有人点卡片按钮后，这里会显示谁在飞书里改了什么数据。
                </div>
              ) : (
                <ul className="space-y-2">
                  {workbench.bot.recentCardActions
                    .filter((a) => a.action !== "open_customer")
                    .map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-3 rounded-xl bg-paper-raised/[0.045] px-4 py-3 text-sm ring-1 ring-inset ring-white/[0.06]"
                      >
                        <span className="text-white/65">
                          <strong className="font-medium text-white/90">
                            {item.operatorName ?? "某位同事"}
                          </strong>
                          {" 在飞书里"}
                          {describeCardAction(item.action)}
                        </span>
                        <span className="shrink-0 text-xs text-white/35">
                          {relativeTime(item.createdAt)}
                        </span>
                      </li>
                    ))}
                </ul>
              )}

              {/* 管理员专属：未绑定身份的用户，直接影响机器人可用性 */}
              {workbench.unboundUsers.length > 0 && (
                <div className="mt-4 rounded-xl bg-warn/[0.14] px-4 py-3.5 text-sm text-[#f0dcae] ring-1 ring-inset ring-amber-400/25">
                  <p className="font-medium">
                    有 {workbench.unboundUsers.length} 位同事的飞书身份还没绑定
                  </p>
                  <p className="mt-1 leading-relaxed text-[#d9c392]">
                    {workbench.unboundUsers.map((u) => u.name).join("、")}
                    在飞书里 @机器人 时会被提示「账号未绑定」，无法记录跟进。
                  </p>
                  <Link
                    href="/settings/users"
                    className="mt-2 inline-block font-medium text-brass-400 underline underline-offset-2"
                  >
                    去绑定 →
                  </Link>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                <NavLink
                  href="/customers/public-pool"
                  className="rounded-lg px-3 py-1.5 text-white/70 ring-1 ring-inset ring-white/15 transition-colors hover:bg-paper-raised/[0.06] hover:text-white"
                >
                  去公海体验卡片认领
                </NavLink>
                <NavLink
                  href="/funnel"
                  className="rounded-lg px-3 py-1.5 text-white/70 ring-1 ring-inset ring-white/15 transition-colors hover:bg-paper-raised/[0.06] hover:text-white"
                >
                  看销售漏斗
                </NavLink>
                <NavLink
                  href="/settings"
                  className="rounded-lg px-3 py-1.5 text-white/70 ring-1 ring-inset ring-white/15 transition-colors hover:bg-paper-raised/[0.06] hover:text-white"
                >
                  飞书与模型配置
                </NavLink>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 价值说明：三栏编辑式排版，字标用编号而不是色块 */}
      <div className="card mt-8 p-7" data-enter="fade">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">
          为什么不在飞书里直接管客户
        </h2>
        <div className="mt-5 grid grid-cols-1 gap-6 text-sm leading-[1.75] text-ink-soft sm:grid-cols-3">
          <div className="border-t-2 border-brass-500/75 pt-4">
            <div className="font-semibold text-ink">飞书管不住结构化事实</div>
            <p className="mt-2">
              群聊里的「预算 80 万」「下周三交方案」散落在对话里，
              三个月后查不出来。CRM 把它们变成可查询的字段。
            </p>
          </div>
          <div className="border-t-2 border-brass-500/50 pt-4">
            <div className="font-semibold text-ink">飞书没有业务规则</div>
            <p className="mt-2">
              商机阶段不能乱跳、报价金额由条目汇总、订单要能追溯到合同。
              这些约束必须在代码里，不在聊天记录里。
            </p>
          </div>
          <div className="border-t-2 border-brass-500/25 pt-4">
            <div className="font-semibold text-ink">飞书没有归属边界</div>
            <p className="mt-2">
              谁能看哪个客户由负责人决定，在服务端判定。
              群成员和客户负责人本来就是两件事。
            </p>
          </div>
        </div>
        <p className="mt-6 border-t border-line pt-5 text-sm text-ink-faint">
          所以分工是：
          <strong className="font-semibold text-ink">
            结构、规则、权限放 CRM，触达与交互放飞书
          </strong>
          。销售不用打开网页，老板在网页看全局。
        </p>
      </div>
    </div>
  );
}
