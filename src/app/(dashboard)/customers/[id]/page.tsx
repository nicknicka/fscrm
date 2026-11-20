import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, PageHeader } from "@/components/ui";
import { requireCurrentUser } from "@/lib/auth/session";
import { accessScopeFor } from "@/lib/auth/scope";
import { getCustomer } from "@/lib/db/repositories/customer";
import { OpportunityStage } from "@/generated/prisma/enums";

const stageLabel: Record<string, string> = {
  [OpportunityStage.CONTACT]: "初步接触",
  [OpportunityStage.NEED_CONFIRM]: "需求确认",
  [OpportunityStage.QUOTE]: "报价",
  [OpportunityStage.NEGOTIATE]: "谈判",
  [OpportunityStage.WON]: "赢单",
  [OpportunityStage.LOST]: "输单",
};

/** 客户详情页：基本信息 + 联系人 + 商机 + 跟进记录。 */
export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const currentUser = await requireCurrentUser();
  const customer = await getCustomer(id, accessScopeFor(currentUser));
  if (!customer) {
    notFound();
  }

  return (
    <div>
      <Link href="/customers" className="text-sm text-blue-600 hover:underline">
        ← 返回客户列表
      </Link>
      <div className="mt-4">
        <PageHeader
          title={customer.name}
          description={customer.industry ?? "客户详情"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 基本信息 */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold">基本信息</h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Info label="客户等级" value={customer.level} />
            <Info label="负责人" value={customer.owner?.name ?? "未分配"} />
            <Info label="电话" value={customer.phone ?? "—"} />
            <Info label="邮箱" value={customer.email ?? "—"} />
            <Info label="地址" value={customer.address ?? "—"} />
            <Info
              label="创建时间"
              value={customer.createdAt.toLocaleDateString("zh-CN")}
            />
          </dl>
          {customer.remark && (
            <div className="mt-4 border-t border-zinc-100 pt-4 text-sm">
              <div className="mb-1 text-zinc-500">备注</div>
              <div className="text-zinc-700">{customer.remark}</div>
            </div>
          )}
        </section>

        {/* 联系人 */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold">
            联系人（{customer.contacts.length}）
          </h2>
          {customer.contacts.length === 0 ? (
            <p className="text-sm text-zinc-500">暂无联系人</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {customer.contacts.map((contact) => (
                <li key={contact.id} className="py-2 text-sm">
                  <span className="font-medium">{contact.name}</span>
                  {contact.position && (
                    <span className="ml-2 text-zinc-500">
                      {contact.position}
                    </span>
                  )}
                  <div className="text-xs text-zinc-400">
                    {contact.phone ?? ""} {contact.email ?? ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 商机 */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold">
            商机（{customer.opportunities.length}）
          </h2>
          {customer.opportunities.length === 0 ? (
            <p className="text-sm text-zinc-500">暂无商机</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {customer.opportunities.map((opp) => (
                <li
                  key={opp.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <Link
                    href={`/opportunities/${opp.id}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {opp.name}
                  </Link>
                  <Badge tone="blue">
                    {stageLabel[opp.stage] ?? opp.stage}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 跟进记录 */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold">
            跟进记录（{customer.followUps.length}）
          </h2>
          {customer.followUps.length === 0 ? (
            <p className="text-sm text-zinc-500">暂无跟进记录</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {customer.followUps.map((followUp) => (
                <li key={followUp.id} className="py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <Badge tone="zinc">{followUp.mode}</Badge>
                    <span className="text-xs text-zinc-400">
                      {followUp.createdAt.toLocaleString("zh-CN")}
                    </span>
                  </div>
                  <div className="mt-1 text-zinc-700">{followUp.content}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/** 信息项。 */
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-zinc-800">{value}</dd>
    </div>
  );
}
