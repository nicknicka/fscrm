import type { CSSProperties } from "react";
import { PageHeader } from "@/components/ui";
import { NavLink } from "@/components/nav-link";
import { Enter, Stagger, StaggerItem } from "@/components/stagger";
import { loadFunnelData } from "./funnel-data";

/** 销售漏斗：按销售阶段实时统计商机数量，每阶段可下钻到商机列表。 */
export default async function FunnelPage() {
  const { stages, total } = await loadFunnelData();

  return (
    <div>
      <Enter>
        <PageHeader
          title="销售漏斗"
          description={`按销售阶段实时统计 · 共 ${total} 个商机`}
        />
      </Enter>

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
