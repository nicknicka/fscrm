import { PageHeader } from "@/components/ui";
import { NavLink } from "@/components/nav-link";
import { Enter, Stagger, StaggerItem } from "@/components/stagger";
import { requireCurrentUser } from "@/lib/auth/session";
import { accessScopeFor } from "@/lib/auth/scope";
import { countCustomers } from "@/lib/db/repositories/customer";
import {
  countFollowUps,
  countLeads,
  countOpportunities,
} from "@/lib/db/repositories/sales";

/**
 * CRM 概览页：展示关键业务指标与各模块入口。
 */
export default async function HomePage() {
  const currentUser = await requireCurrentUser();
  const scope = accessScopeFor(currentUser);
  const [customerCount, leadCount, opportunityCount, followUpCount] =
    await Promise.all([
      countCustomers(scope),
      countLeads(scope),
      countOpportunities(currentUser),
      countFollowUps(currentUser),
    ]);

  const stats = [
    {
      label: "客户",
      value: customerCount,
      href: "/customers",
      tone: "text-blue-600",
    },
    { label: "线索", value: leadCount, href: "/leads", tone: "text-amber-600" },
    {
      label: "商机",
      value: opportunityCount,
      href: "/opportunities",
      tone: "text-violet-600",
    },
    {
      label: "跟进记录",
      value: followUpCount,
      href: "/customers",
      tone: "text-green-600",
    },
  ];

  return (
    <div>
      <Enter>
        <PageHeader
          title="概览"
          description="fscrm 业务数据总览 · 数据来自本地 Postgres"
        />
      </Enter>

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
              <div className={`mt-2 text-3xl font-bold ${stat.tone}`}>
                {stat.value}
              </div>
            </NavLink>
          </StaggerItem>
        ))}
      </Stagger>

      <Enter
        effect="fade"
        className="mt-8 rounded-xl border border-zinc-200 bg-white p-6"
      >
        <h2 className="text-base font-semibold text-zinc-900">销售漏斗</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          按销售阶段查看商机数量的实时分布，并可点击阶段下钻到商机列表。
        </p>
        <NavLink
          href="/funnel"
          className="mt-4 inline-block text-sm text-blue-600 transition-colors duration-[var(--motion-fast)] hover:text-blue-700 hover:underline"
        >
          查看销售漏斗 →
        </NavLink>
      </Enter>

      <Enter
        effect="fade"
        className="mt-8 rounded-xl border border-zinc-200 bg-white p-6"
      >
        <h2 className="text-base font-semibold text-zinc-900">快速开始</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          这是 fscrm 的业务主页。当前已接入 Postgres 数据库与飞书集成层。
          你可以从左侧导航进入客户、线索、商机模块查看与管理数据。
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <NavLink
            href="/customers"
            className="text-blue-600 transition-colors duration-[var(--motion-fast)] hover:text-blue-700 hover:underline"
          >
            管理客户 →
          </NavLink>
          <NavLink
            href="/leads"
            className="text-blue-600 transition-colors duration-[var(--motion-fast)] hover:text-blue-700 hover:underline"
          >
            管理线索 →
          </NavLink>
          <NavLink
            href="/opportunities"
            className="text-blue-600 transition-colors duration-[var(--motion-fast)] hover:text-blue-700 hover:underline"
          >
            管理商机 →
          </NavLink>
        </div>
      </Enter>
    </div>
  );
}
