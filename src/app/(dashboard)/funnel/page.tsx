import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { loadFunnelData } from "./funnel-data";

/** 销售漏斗：按销售阶段实时统计商机数量，每阶段可下钻到商机列表。 */
export default async function FunnelPage() {
  const { stages, total } = await loadFunnelData();

  return (
    <div>
      <PageHeader
        title="销售漏斗"
        description={`按销售阶段实时统计 · 共 ${total} 个商机`}
      />

      <div className="space-y-3">
        {stages.map((stage) => {
          const width = total === 0 ? 0 : (stage.count / total) * 100;
          return (
            <Link
              key={stage.stage}
              href={stage.href}
              className="block rounded-xl border border-zinc-200 bg-white p-5 transition-shadow hover:shadow-md"
            >
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-zinc-900">{stage.label}</span>
                <span className="text-zinc-500">{stage.count} 个商机 →</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-blue-500"
                  style={{ width: `${width}%` }}
                />
              </div>
            </Link>
          );
        })}
      </div>

      <p className="mt-6 text-sm text-zinc-500">
        点击任一阶段可下钻查看该阶段的商机列表。数据来自商机销售阶段实时查询。
      </p>
    </div>
  );
}
