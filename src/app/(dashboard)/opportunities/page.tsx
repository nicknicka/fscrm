import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { listOpportunities } from "@/lib/db/repositories/sales";
import { listCustomers } from "@/lib/db/repositories/customer";
import type { AccessScope } from "@/lib/auth/scope";
import { listUsers } from "@/lib/db/repositories/user";
import { OpportunityStage } from "@/generated/prisma/enums";
import { OpportunityForm } from "./opportunity-form";
import {
  deleteOpportunityAction,
  updateOpportunityStageAction,
} from "./actions";

// #17 将收敛商机自身权限；这里只保持客户选项当前的全量行为。
const CUSTOMER_OPTIONS_SCOPE: AccessScope = {
  userId: "system",
  role: "ADMIN",
};

const stageMeta: Record<
  string,
  { label: string; tone: "blue" | "amber" | "green" | "zinc" }
> = {
  [OpportunityStage.CONTACT]: { label: "初步接触", tone: "blue" },
  [OpportunityStage.NEED_CONFIRM]: { label: "需求确认", tone: "blue" },
  [OpportunityStage.QUOTE]: { label: "报价", tone: "amber" },
  [OpportunityStage.NEGOTIATE]: { label: "谈判", tone: "blue" },
  [OpportunityStage.WON]: { label: "赢单", tone: "green" },
  [OpportunityStage.LOST]: { label: "输单", tone: "zinc" },
};

/** 商机列表页。 */
export default async function OpportunitiesPage() {
  const [opportunities, customers, users] = await Promise.all([
    listOpportunities(),
    listCustomers({}, CUSTOMER_OPTIONS_SCOPE),
    listUsers(),
  ]);

  return (
    <div>
      <PageHeader
        title="商机"
        description={`共 ${opportunities.length} 个商机`}
        action={
          <OpportunityForm
            customers={customers.map((c) => ({ id: c.id, name: c.name }))}
            users={users.map((u) => ({ id: u.id, name: u.name }))}
          />
        }
      />

      {opportunities.length === 0 ? (
        <EmptyState message="暂无商机数据，点击右上角「新建商机」开始添加。" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
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
                  stageMeta[opp.stage] ?? stageMeta[OpportunityStage.CONTACT];
                return (
                  <tr key={opp.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3 font-medium">{opp.name}</td>
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
                        <select
                          name="stage"
                          defaultValue={opp.stage}
                          onChange={(e) =>
                            e.currentTarget.form?.requestSubmit()
                          }
                          className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm"
                        >
                          {Object.entries(stageMeta).map(([value, m]) => (
                            <option key={value} value={value}>
                              {m.label}
                            </option>
                          ))}
                        </select>
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
        </div>
      )}
    </div>
  );
}
