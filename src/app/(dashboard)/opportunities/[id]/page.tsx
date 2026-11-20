import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db/client";
import { OpportunityStage } from "@/generated/prisma/enums";

const stageLabel: Record<string, string> = {
  [OpportunityStage.CONTACT]: "初步接触",
  [OpportunityStage.NEED_CONFIRM]: "需求确认",
  [OpportunityStage.QUOTE]: "报价",
  [OpportunityStage.NEGOTIATE]: "谈判",
  [OpportunityStage.WON]: "赢单",
  [OpportunityStage.LOST]: "输单",
};

/** 商机详情页。 */
export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const opportunity = await prisma.opportunity.findUnique({
    where: { id },
    include: {
      customer: true,
      owner: true,
      followUps: { include: { owner: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!opportunity) notFound();

  return (
    <div>
      <Link
        href="/opportunities"
        className="text-sm text-blue-600 hover:underline"
      >
        ← 返回商机列表
      </Link>
      <div className="mt-4">
        <PageHeader title={opportunity.name} description="商机详情" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold">基本信息</h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Info label="关联客户" value={opportunity.customer?.name ?? "—"} />
            <div>
              <dt className="text-xs text-zinc-500">销售阶段</dt>
              <dd className="mt-0.5">
                <Badge tone="blue">
                  {stageLabel[opportunity.stage] ?? opportunity.stage}
                </Badge>
              </dd>
            </div>
            <Info
              label="预计金额"
              value={
                opportunity.amount != null
                  ? `¥${opportunity.amount.toLocaleString("zh-CN")}`
                  : "—"
              }
            />
            <Info label="负责人" value={opportunity.owner?.name ?? "未分配"} />
            <Info
              label="预计成交日期"
              value={
                opportunity.expectedCloseDate?.toLocaleDateString("zh-CN") ??
                "—"
              }
            />
            <Info
              label="创建时间"
              value={opportunity.createdAt.toLocaleDateString("zh-CN")}
            />
          </dl>
          {opportunity.remark && (
            <div className="mt-4 border-t border-zinc-100 pt-4 text-sm">
              <div className="mb-1 text-zinc-500">备注</div>
              <div className="text-zinc-700">{opportunity.remark}</div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold">
            跟进记录（{opportunity.followUps.length}）
          </h2>
          {opportunity.followUps.length === 0 ? (
            <p className="text-sm text-zinc-500">暂无跟进记录</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {opportunity.followUps.map((f) => (
                <li key={f.id} className="py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <Badge tone="zinc">{f.mode}</Badge>
                    <span className="text-xs text-zinc-400">
                      {f.createdAt.toLocaleString("zh-CN")}
                    </span>
                  </div>
                  <div className="mt-1 text-zinc-700">{f.content}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-zinc-800">{value}</dd>
    </div>
  );
}
