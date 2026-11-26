import { PageHeader } from "@/components/ui";
import { NavLink } from "@/components/nav-link";
import { Enter } from "@/components/stagger";
import { EmptyStatePanel } from "@/components/empty-state";
import { loadFunnelData } from "./funnel-data";
import {
  formatMoney,
  formatMoneyCompact,
  formatPercent,
} from "@/lib/format-numbers";

/* 这些页面读取会话与数据库，属于请求时数据，无法静态预渲染。 */
export const instant = false;

/**
 * 逐级转化的三种真实情况，分开表达——混成一个百分比会读出不可能的漏斗：
 * - no_upstream：上一级为 0，无从比较
 * - empty：本级为 0，说明这一级暂时没有商机
 * - backwards：本级多于上一级。商机可以跳过阶段直接推进（先报价后补需求确认），
 *   这类记作「回流」，不冒充转化率
 * - normal：正常留存比例
 */
type StepConversion =
  | { kind: "no_upstream" }
  | { kind: "empty" }
  | { kind: "backwards"; rate: number }
  | { kind: "normal"; rate: number };

function stepConversion(current: number, previous: number): StepConversion {
  if (previous === 0) return { kind: "no_upstream" };
  if (current === 0) return { kind: "empty" };
  const rate = Math.round((current / previous) * 1000) / 10;
  return rate > 100 ? { kind: "backwards", rate } : { kind: "normal", rate };
}

/**
 * 销售漏斗。
 *
 * 真的画成漏斗：每一级是一个居中的梯形色带，宽度按该阶段商机数递减，
 * 级与级之间嵌一条「↓ 转化率」的窄条——读起来是从上往下漏，而不是
 * 六张并列的卡片。零数据的阶段不再画成一条看不见的细线，而是显式的空态。
 */
export default async function FunnelPage() {
  const { stages, total, summary } = await loadFunnelData();
  const { winRate } = summary;

  // 流水线阶段（排除终态），漏斗只画"在途"的部分
  const pipeline = stages.filter(
    (stage) => stage.stage !== "WON" && stage.stage !== "LOST"
  );
  const won = stages.find((stage) => stage.stage === "WON");
  const lost = stages.find((stage) => stage.stage === "LOST");
  const pipelineMax = Math.max(...pipeline.map((s) => s.count), 0);

  return (
    <div>
      <Enter>
        <PageHeader
          title="销售漏斗"
          description={`按销售阶段实时统计 · 共 ${total} 个商机`}
        />
      </Enter>

      {/* 汇总：赢单率是漏斗最重要的一句话，单独占一大格 */}
      <Enter effect="fade" className="card mb-6 p-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint">
              赢单率（金额口径）
            </div>
            {/* 赢单率是全页最重要的数字，但不该和琥珀抢"唯一重音"——
                用墨色数字 + 琥珀下划线，绿色只留给真正的胜负状态 */}
            <div className="num-kpi mt-2 text-ink">
              {formatPercent(winRate.rate)}
            </div>
            <div className="tnum mt-2 text-xs text-ink-faint">
              赢单 {formatMoney(winRate.wonAmount)} / 全部{" "}
              {formatMoney(winRate.totalAmount)}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint">
              在途商机
            </div>
            <div className="num-kpi mt-2 text-ink">
              {pipeline.reduce((sum, s) => sum + s.count, 0)}
            </div>
            <div className="mt-2 text-xs text-ink-faint">
              {pipeline.length} 个阶段推进中
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint">
              已结案
            </div>
            <div className="mt-2 flex items-baseline gap-4">
              <span className="num-kpi text-ok">{won?.count ?? 0}</span>
              <span className="tnum text-[22px] font-semibold leading-none tracking-[-0.02em] text-danger">
                {lost?.count ?? 0}
              </span>
            </div>
            <div className="mt-2 text-xs text-ink-faint">赢单 / 输单</div>
          </div>
        </div>
      </Enter>

      {/* 漏斗本体 */}
      <section className="card p-6">
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">
            阶段流转
          </h2>
          <span className="text-xs text-ink-faint">点击任一级下钻商机列表</span>
        </div>

        {total === 0 ? (
          <EmptyStatePanel
            variant="inline"
            title="还没有商机进入漏斗"
            description="商机按阶段推进后，这里会显示逐级转化与人均金额。"
            action={
              <NavLink href="/opportunities" className="btn btn-primary">
                去商机列表
              </NavLink>
            }
          />
        ) : (
          <ol className="mx-auto max-w-2xl">
            {pipeline.map((stage, index) => {
              const prev = index > 0 ? pipeline[index - 1] : null;
              const conv = prev
                ? stepConversion(stage.count, prev.count)
                : null;
              // 宽度按全漏斗最大值归一：最宽的一级占满，其余等比收窄；
              // 保留 52% 下限，保证「阶段名 + 数字」不会挤破。
              const ratio = pipelineMax === 0 ? 0 : stage.count / pipelineMax;
              const width = 52 + ratio * 48;
              const isEmpty = stage.count === 0;

              return (
                <li key={stage.stage}>
                  {/* 级间转化条。空阶段本身已写成「暂无商机」，
                      这里不再重复挂一次胶囊，避免同一件事说三遍 */}
                  {index > 0 && !isEmpty && prev && prev.count > 0 && (
                    <div className="flex items-center justify-center gap-2 py-2">
                      <span aria-hidden className="h-4 w-px bg-line-strong" />
                      <ConversionBadge conv={conv} />
                      <span aria-hidden className="h-4 w-px bg-line-strong" />
                    </div>
                  )}

                  {/* 空阶段：压成一行细提示，不做成大虚线块——
                      它没有数据可对比，占同样的高度只会让漏斗显得更空 */}
                  {isEmpty ? (
                    <NavLink
                      href={stage.href}
                      className="mx-auto flex max-w-2xl items-center gap-3 rounded-md px-3 py-2 text-xs text-ink-faint transition-colors hover:bg-paper-sunk hover:text-ink-soft"
                    >
                      <span
                        aria-hidden
                        className="h-px flex-1 bg-line-strong"
                      />
                      <span className="whitespace-nowrap">
                        {stage.label} · 暂无商机
                      </span>
                      <span
                        aria-hidden
                        className="h-px flex-1 bg-line-strong"
                      />
                    </NavLink>
                  ) : (
                    <NavLink
                      href={stage.href}
                      className="group mx-auto flex items-center justify-between gap-4 rounded-lg bg-brass-500/12 px-5 py-4 transition-colors duration-[var(--motion-fast)] hover:bg-brass-500/20"
                      style={{ width: `${width}%` }}
                    >
                      <span className="min-w-0 truncate text-sm font-medium text-ink">
                        {stage.label}
                      </span>
                      <span className="flex shrink-0 items-baseline gap-1.5">
                        <span className="tnum text-lg font-semibold leading-none text-ink">
                          {stage.count}
                        </span>
                        <span className="text-xs text-ink-faint">
                          个 · {formatMoneyCompact(stage.amount)}
                        </span>
                      </span>
                    </NavLink>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {/* 终态：不参与漏斗宽度，单独列一行 */}
        {(won || lost) && total > 0 && (
          <div className="mx-auto mt-6 flex max-w-2xl gap-3 border-t border-line pt-5">
            <NavLink
              href={won!.href}
              className="flex flex-1 items-baseline justify-between gap-2 rounded-lg bg-ok-bg px-4 py-3 text-sm transition-opacity hover:opacity-80"
            >
              <span className="font-medium text-ok">赢单</span>
              <span className="tnum flex items-baseline gap-1.5 text-ok">
                <span className="font-semibold">{won!.count} 个</span>
                <span className="text-xs opacity-70">
                  {formatMoneyCompact(won!.amount)}
                </span>
              </span>
            </NavLink>
            <NavLink
              href={lost!.href}
              className="flex flex-1 items-baseline justify-between gap-2 rounded-lg bg-danger-bg px-4 py-3 text-sm transition-opacity hover:opacity-80"
            >
              <span className="font-medium text-danger">输单</span>
              <span className="tnum flex items-baseline gap-1.5 text-danger">
                <span className="font-semibold">{lost!.count} 个</span>
                <span className="text-xs opacity-70">
                  {formatMoneyCompact(lost!.amount)}
                </span>
              </span>
            </NavLink>
          </div>
        )}
      </section>
    </div>
  );
}

/** 阶段间的转化标记：把四种真实情况分别画出来。 */
function ConversionBadge({ conv }: { conv: StepConversion | null }) {
  // 第一级没有上一级可比，不画转化标记
  if (conv === null) return null;
  if (conv.kind === "empty") {
    return (
      <span className="rounded-full bg-paper-sunk px-2.5 py-0.5 text-[11px] text-ink-faint">
        本阶段暂无商机
      </span>
    );
  }
  if (conv.kind === "no_upstream") {
    return <span className="text-[11px] text-ink-faint">上一阶段为空</span>;
  }
  if (conv.kind === "backwards") {
    return (
      <span className="tnum rounded-full bg-paper-sunk px-2 py-0.5 text-[11px] font-medium text-ink-soft ring-1 ring-inset ring-line-strong">
        ↺ 回流 {conv.rate}%
      </span>
    );
  }
  return (
    <span
      className={`tnum rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
        conv.rate >= 50
          ? "bg-ok-bg text-ok ring-ok/20"
          : "bg-warn-bg text-warn ring-warn/25"
      }`}
    >
      ↓ {conv.rate}%
    </span>
  );
}
