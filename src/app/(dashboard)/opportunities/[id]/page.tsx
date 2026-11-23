import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, PageHeader } from "@/components/ui";
import { requireCurrentUser } from "@/lib/auth/session";
import { listAssignableUsers } from "@/lib/db/repositories/user";
import { loadStageLabelMap } from "@/lib/stage-display";
import { FollowUpMode } from "@/generated/prisma/enums";
import {
  createOpportunityFollowUpAction,
  deleteOpportunityFollowUpAction,
} from "../actions";
import { getOpportunityForCurrentUser } from "../scope";
import { OpportunityDetailForm } from "./opportunity-detail-form";
import { listQuotationsForCurrentUser } from "./quotations/actions";
import { QuotationsManager } from "./quotations/quotations-manager";

const followUpModeLabel: Record<string, string> = {
  [FollowUpMode.CALL]: "电话",
  [FollowUpMode.MEETING]: "面谈",
  [FollowUpMode.EMAIL]: "邮件",
  [FollowUpMode.IM]: "即时消息",
  [FollowUpMode.OTHER]: "其他",
};

/** 商机详情页。 */
export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const createFollowUp = createOpportunityFollowUpAction.bind(null, id);
  const user = await requireCurrentUser();
  const opportunity = await getOpportunityForCurrentUser(id, user);
  if (!opportunity) notFound();
  const users =
    user.role === "ADMIN"
      ? (await listAssignableUsers(user)).map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
        }))
      : [];
  const stageLabel = await loadStageLabelMap();
  const quotations = await listQuotationsForCurrentUser(id);

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
          <OpportunityDetailForm
            opportunityId={opportunity.id}
            name={opportunity.name}
            amount={opportunity.amount}
            expectedCloseDate={opportunity.expectedCloseDate}
            remark={opportunity.remark}
            ownerId={opportunity.ownerId}
            canReassignOwner={user.role === "ADMIN"}
            users={users}
          />
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold">
            跟进记录（{opportunity.followUps.length}）
          </h2>
          <form
            action={createFollowUp}
            className="mb-4 space-y-3 border-b border-zinc-100 pb-4"
          >
            <div className="text-sm font-medium">新增跟进</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-zinc-600">方式</span>
                <select
                  name="mode"
                  defaultValue={FollowUpMode.CALL}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                >
                  {Object.values(FollowUpMode).map((mode) => (
                    <option key={mode} value={mode}>
                      {followUpModeLabel[mode] ?? mode}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-600">
                  下一步计划跟进时间
                </span>
                <input
                  name="nextFollowUpAt"
                  type="datetime-local"
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-600">内容</span>
              <textarea
                name="content"
                required
                rows={3}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                placeholder="记录本次沟通内容"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              保存跟进
            </button>
          </form>
          {opportunity.followUps.length === 0 ? (
            <p className="text-sm text-zinc-500">暂无跟进记录</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {opportunity.followUps.map((f) => (
                <li key={f.id} className="py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge tone="zinc">
                        {followUpModeLabel[f.mode] ?? f.mode}
                      </Badge>
                      {f.nextFollowUpAt && (
                        <span className="text-xs text-zinc-500">
                          下次跟进：{f.nextFollowUpAt.toLocaleString("zh-CN")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {f.nextFollowUpAt && (
                        <Link
                          href={`/tasks?customerId=${encodeURIComponent(opportunity.customerId ?? "")}&opportunityId=${encodeURIComponent(id)}&followUpId=${encodeURIComponent(f.id)}&dueAt=${encodeURIComponent(toDateTimeLocal(f.nextFollowUpAt))}&title=${encodeURIComponent(`跟进：${opportunity.name}`)}`}
                          className="text-xs font-medium text-blue-600 hover:underline"
                        >
                          建任务
                        </Link>
                      )}
                      <span className="text-xs text-zinc-400">
                        {f.createdAt.toLocaleString("zh-CN")}
                      </span>
                      <form
                        action={deleteOpportunityFollowUpAction.bind(
                          null,
                          id,
                          f.id
                        )}
                      >
                        <button
                          type="submit"
                          className="text-xs text-red-600 hover:underline"
                        >
                          删除
                        </button>
                      </form>
                    </div>
                  </div>
                  <div className="mt-1 text-zinc-700">{f.content}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <QuotationsManager
          opportunityId={id}
          quotations={quotations.map((quotation) => ({
            id: quotation.id,
            status: quotation.status,
            amount: quotation.amount,
            items: quotation.items.map((item) => ({
              id: item.id,
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            })),
          }))}
        />
      </div>
    </div>
  );
}

/** 把 Date 转为 datetime-local 输入可接受的值（本地时区）。 */
function toDateTimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-zinc-800">{value}</dd>
    </div>
  );
}
