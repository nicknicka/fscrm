import type { CSSProperties } from "react";
import { PageHeader } from "@/components/ui";
import { NavLink } from "@/components/nav-link";
import { Enter, Stagger, StaggerItem } from "@/components/stagger";
import { loadFunnelData } from "./funnel-data";

/** 销售漏斗：按销售阶段实时统计商机数量，每阶段可下钻到商机列表。 */
export default async function FunnelPage() {
  const { stages, total, summary } = await loadFunnelData();
  const { winRate, stageConversions } = summary;

  return (
    <div>
      <Enter>
        <PageHeader
          title="销售漏斗"
          description={`按销售阶段实时统计 · 共 ${total} 个商机`}
        />
      </Enter>

      {/* 顶部汇总：赢单率（金额口径）与阶段转化，复用 analytics 数据层 */}
      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="text-sm text-zinc-500">赢单率（金额）</div>
          <div className="mt-2 text-3xl font-bold text-emerald-600">
            {winRate.rate}%
          </div>
          <div className="mt-1 text-xs text-zinc-400">
            赢单 ¥{winRate.wonAmount.toLocaleString("zh-CN")} / 全部 ¥
            {winRate.totalAmount.toLocaleString("zh-CN")}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="text-sm text-zinc-500">商机金额</div>
          <div className="mt-2 text-3xl font-bold text-zinc-900">
            ¥{winRate.totalAmount.toLocaleString("zh-CN")}
          </div>
          <div className="mt-1 text-xs text-zinc-400">
            赢单 ¥{winRate.wonAmount.toLocaleString("zh-CN")}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5 sm:col-span-2">
          <div className="text-sm text-zinc-500">阶段转化（占全部商机）</div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
            {stageConversions.map((item) => (
              <div key={item.stage} className="text-sm">
                <span className="text-zinc-600">{item.label}</span>{" "}
                <span className="font-semibold text-zinc-900">
                  {item.rate}%
                </span>{" "}
                <span className="text-xs text-zinc-400">({item.count})</span>
              </div>
            ))}
            {stageConversions.length === 0 && (
              <span className="text-sm text-zinc-400">暂无阶段数据</span>
            )}
          </div>
        </div>
      </section>

      <Stagger className="space-y-3">
        {stages.map((stage, index) => {
          const width = total === 0 ? 0 : (stage.count / total) * 100;
          return (
            <StaggerItem key={stage.stage} index={index}>
              <NavLink
                href={stage.href}
                className="group block rounded-xl border border-zinc-200 bg-white p-5 transition-[box-shadow,border-color] duration-[var(--motion-base)] ease-[var(--ease-out-expo)] hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-zinc-900">
                    {stage.label}
                  </span>
                  <span className="text-zinc-500">{stage.count} 个商机 →</span>
                </div>
                {/* 条从左展开：先看到行的长度，再读出比例，比直接出现一截色块更好读 */}
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="bar-grow h-full rounded-full bg-blue-500 transition-colors duration-[var(--motion-fast)] group-hover:bg-blue-600"
                    style={
                      {
                        width: `${width}%`,
                        "--i": index,
                      } as CSSProperties
                    }
                  />
                </div>
              </NavLink>
            </StaggerItem>
          );
        })}
      </Stagger>

      <p className="mt-6 text-sm text-zinc-500">
        点击任一阶段可下钻查看该阶段的商机列表。数据来自商机销售阶段实时查询。
      </p>
    </div>
  );
}
