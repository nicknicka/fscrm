import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, PageHeader } from "@/components/ui";
import { ComposerPanel } from "@/components/composer-panel";
import { EmptyStatePanel } from "@/components/empty-state";
import { DateTimeField } from "@/components/datetime-field";
import { requireCurrentUser } from "@/lib/auth/session";
import { listAssignableUsers } from "@/lib/db/repositories/user";
import { loadStageDisplays } from "@/lib/stage-display";
import { FollowUpMode, OpportunityStage } from "@/generated/prisma/enums";
import {
  createOpportunityFollowUpAction,
  deleteOpportunityFollowUpAction,
} from "../actions";
import { getOpportunityForCurrentUser } from "../scope";
import { EditableField } from "./opportunity-inline-fields";
import { formatMoney, formatPercent } from "@/lib/format-numbers";
import { listQuotationsForCurrentUser } from "./quotations/actions";
import { QuotationsManager } from "./quotations/quotations-manager";

/* 读取会话与数据库，属于请求时数据，无法静态预渲染。 */
export const instant = false;

const followUpModeLabel: Record<string, string> = {
  [FollowUpMode.CALL]: "电话",
  [FollowUpMode.MEETING]: "面谈",
  [FollowUpMode.EMAIL]: "邮件",
  [FollowUpMode.IM]: "即时消息",
  [FollowUpMode.OTHER]: "其他",
};

/**
 * 商机详情页。
 *
 * 信息层级按「这单生意值多少、走到哪、谁在推」排：
 *   1. 状态带：金额是主角（大号数字），阶段条是它的上下文，负责人紧贴金额；
 *   2. 跟进时间线：关系史，录入默认收起，不抢首屏；
 *   3. 报价：单据，占满整行。
 * 只读事实与编辑表单合并——不再「先读一遍再在同一张卡里写一遍」，
 * 表单本身就是那张卡的编辑态。
 */
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
  const stages = await loadStageDisplays();
  const quotations = await listQuotationsForCurrentUser(id);

  const isClosed =
    opportunity.stage === OpportunityStage.WON ||
    opportunity.stage === OpportunityStage.LOST;
  const pipeline = stages.filter(
    (stage) =>
      stage.value !== OpportunityStage.WON &&
      stage.value !== OpportunityStage.LOST
  );
  const currentIndex = pipeline.findIndex(
    (stage) => stage.value === opportunity.stage
  );

  // 报价总额（已确认口径）与预计金额的对照：差额是这单生意最该被看见的异常
  const confirmedAmount = quotations
    .filter((quotation) => quotation.status === "CONFIRMED")
    .reduce((sum, quotation) => sum + quotation.amount, 0);
  const variance =
    opportunity.amount != null && confirmedAmount > 0
      ? opportunity.amount - confirmedAmount
      : null;
  const confirmedRatio =
    variance !== null && opportunity.amount
      ? Math.round((confirmedAmount / opportunity.amount) * 1000) / 10
      : null;

  return (
    <div>
      <Link
        href="/opportunities"
        className="text-[13px] font-medium text-brass-600 transition-colors hover:text-brass-500"
      >
        ← 返回商机列表
      </Link>
      <div className="mt-4">
        <PageHeader title={opportunity.name} description="商机详情" />
      </div>

      {/* 状态带：金额是主角，阶段条与负责人是它的上下文 */}
      <section className="card mb-6 overflow-hidden" data-enter="rise">
        <div className="flex flex-wrap items-start justify-between gap-8 p-6">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint">
              预计金额
            </div>
            <div className="num-hero mt-2 text-ink">
              {opportunity.amount != null
                ? formatMoney(opportunity.amount)
                : "未估价"}
            </div>
            {confirmedAmount > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-ink-faint">
                  已确认报价{" "}
                  <span className="tnum font-medium text-ink-soft">
                    {formatMoney(confirmedAmount)}
                  </span>
                  {confirmedRatio !== null &&
                    ` · 占预计 ${formatPercent(confirmedRatio)}`}
                </span>
                {variance !== null && Math.abs(variance) > 0 && (
                  <span
                    className={`tnum rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${
                      variance > 0
                        ? "bg-warn-bg text-warn ring-warn/25"
                        : "bg-info-bg text-info ring-info/25"
                    }`}
                  >
                    {variance > 0 ? "待报价 " : "超出预计 "}
                    {formatMoney(Math.abs(variance))}
                  </span>
                )}
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-soft">
              <span>
                客户{" "}
                <Link
                  href={`/customers/${opportunity.customerId}`}
                  className="font-medium text-ink transition-colors hover:text-brass-600"
                >
                  {opportunity.customer?.name ?? "—"}
                </Link>
              </span>
              <span aria-hidden className="h-3 w-px bg-line-strong" />
              <span>
                负责人{" "}
                <span className="font-medium text-ink">
                  {opportunity.owner?.name ?? "未分配"}
                </span>
              </span>
              <span aria-hidden className="h-3 w-px bg-line-strong" />
              <span>
                预计成交{" "}
                <span className="tnum font-medium text-ink">
                  {opportunity.expectedCloseDate?.toLocaleDateString("zh-CN") ??
                    "未设置"}
                </span>
              </span>
            </div>
          </div>

          {isClosed && (
            <Badge
              tone={
                opportunity.stage === OpportunityStage.WON ? "green" : "red"
              }
            >
              {opportunity.stage === OpportunityStage.WON ? "已赢单" : "已输单"}
            </Badge>
          )}
        </div>

        {/* 阶段条：横贯卡底，作为金额的"进度上下文" */}
        <div className="border-t border-line bg-paper-sunk/60 px-6 py-4">
          <ol className="flex flex-wrap items-center">
            {pipeline.map((stage, index) => {
              const reached = currentIndex >= 0 && index <= currentIndex;
              const current = index === currentIndex;
              return (
                <li key={stage.value} className="flex items-center">
                  {index > 0 && (
                    <span
                      aria-hidden
                      className={`mx-1 h-px w-6 sm:w-10 ${
                        reached ? "bg-brass-500" : "bg-line-strong"
                      }`}
                    />
                  )}
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`rounded-full ${
                        current
                          ? "h-2.5 w-2.5 bg-brass-500 ring-[3px] ring-brass-500/25"
                          : reached
                            ? "h-2 w-2 bg-brass-600"
                            : "h-2 w-2 border border-line-strong bg-paper-raised"
                      }`}
                    />
                    <span
                      className={`whitespace-nowrap text-xs ${
                        current
                          ? "font-semibold text-ink"
                          : reached
                            ? "text-ink-soft"
                            : "text-ink-faint"
                      }`}
                    >
                      {stage.label}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 商机信息：字段就地编辑，没有常驻输入框，也没有"保存"按钮墙 */}
        <section className="card p-6" data-enter="fade">
          <h2 className="mb-1 text-[15px] font-semibold tracking-tight text-ink">
            商机信息
          </h2>
          <p className="mb-5 text-xs text-ink-faint">
            点任意字段的值即可修改，回车或失焦保存。
          </p>

          <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <EditableField
              opportunityId={opportunity.id}
              label="商机名称"
              name="name"
              value={opportunity.name}
              displayValue={opportunity.name}
            />
            <EditableField
              opportunityId={opportunity.id}
              label="预计金额"
              name="amount"
              type="number"
              value={
                opportunity.amount == null ? "" : String(opportunity.amount)
              }
              displayValue={
                opportunity.amount != null
                  ? formatMoney(opportunity.amount)
                  : ""
              }
              placeholder="未估价"
            />
            <EditableField
              opportunityId={opportunity.id}
              label="预计成交日期"
              name="expectedCloseDate"
              type="date"
              value={
                opportunity.expectedCloseDate?.toISOString().slice(0, 10) ?? ""
              }
              displayValue={
                opportunity.expectedCloseDate?.toLocaleDateString("zh-CN") ?? ""
              }
              placeholder="＋ 设定日期"
            />
            {user.role === "ADMIN" && (
              <EditableField
                opportunityId={opportunity.id}
                label="负责人"
                name="ownerId"
                type="select"
                value={opportunity.ownerId ?? ""}
                displayValue={opportunity.owner?.name ?? ""}
                placeholder="未分配"
                options={[
                  { value: "", label: "暂不分配" },
                  ...users.map((u) => ({ value: u.id, label: u.name })),
                ]}
              />
            )}
            <div className="sm:col-span-2">
              <EditableField
                opportunityId={opportunity.id}
                label="备注"
                name="remark"
                type="textarea"
                value={opportunity.remark ?? ""}
                displayValue={opportunity.remark ?? ""}
                placeholder="＋ 添加备注"
              />
            </div>
          </dl>
        </section>

        {/* 跟进记录：时间线，录入默认收起 */}
        <section className="card p-6" data-enter="fade">
          <h2 className="mb-5 text-[15px] font-semibold tracking-tight text-ink">
            跟进记录
            <span className="tnum ml-1.5 text-sm font-normal text-ink-faint">
              {opportunity.followUps.length}
            </span>
          </h2>

          <ComposerPanel label="记一笔跟进">
            <form action={createFollowUp} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-medium text-ink-soft">
                    方式
                  </span>
                  <select
                    name="mode"
                    defaultValue={FollowUpMode.CALL}
                    className="w-full rounded-lg border border-line-strong bg-paper-raised px-3 py-2 text-sm outline-none transition-colors focus:border-brass-500"
                  >
                    {Object.values(FollowUpMode).map((mode) => (
                      <option key={mode} value={mode}>
                        {followUpModeLabel[mode] ?? mode}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="text-sm">
                  <span className="mb-1 block text-xs font-medium text-ink-soft">
                    下一步计划跟进时间
                  </span>
                  <DateTimeField
                    name="nextFollowUpAt"
                    label="下一步计划跟进时间"
                    className="w-full rounded-lg border border-line-strong bg-paper-raised px-3 py-2 text-sm outline-none transition-colors focus:border-brass-500"
                  />
                </div>
              </div>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-ink-soft">
                  内容
                </span>
                <textarea
                  name="content"
                  required
                  rows={3}
                  className="w-full rounded-lg border border-line-strong bg-paper-raised px-3 py-2 text-sm outline-none transition-colors focus:border-brass-500"
                  placeholder="记录本次沟通内容"
                />
              </label>
              <button type="submit" className="min-h-11 btn btn-primary">
                保存跟进
              </button>
            </form>
          </ComposerPanel>

          {opportunity.followUps.length === 0 ? (
            <EmptyStatePanel
              variant="inline"
              title="还没有跟进记录"
              description="每次通话、拜访、邮件都可以记在这里，形成这条商机的推进轨迹。"
            />
          ) : (
            <ol className="relative">
              <span
                aria-hidden
                className="absolute bottom-2 left-[5px] top-2 w-px bg-line-strong"
              />
              {opportunity.followUps.map((f, index) => (
                <li key={f.id} className="relative pb-5 pl-7 last:pb-0">
                  <span
                    aria-hidden
                    className={`absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full ring-2 ring-paper-raised ${
                      index === 0
                        ? "bg-brass-500"
                        : "bg-paper-raised ring-line-strong"
                    }`}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge tone="zinc">
                        {followUpModeLabel[f.mode] ?? f.mode}
                      </Badge>
                      {f.nextFollowUpAt && (
                        <span className="text-xs text-ink-faint">
                          下次跟进：{f.nextFollowUpAt.toLocaleString("zh-CN")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {f.nextFollowUpAt && (
                        <Link
                          href={`/tasks?customerId=${encodeURIComponent(opportunity.customerId ?? "")}&opportunityId=${encodeURIComponent(id)}&followUpId=${encodeURIComponent(f.id)}&dueAt=${encodeURIComponent(toDateTimeLocal(f.nextFollowUpAt))}&title=${encodeURIComponent(`跟进：${opportunity.name}`)}`}
                          className="text-xs font-medium text-brass-600 transition-colors hover:text-brass-500"
                        >
                          建任务
                        </Link>
                      )}
                      <span className="tnum text-xs text-ink-faint">
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
                          aria-label="删除这条跟进"
                          title="删除"
                          className="rounded p-1 text-xs text-ink-faint opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover/li:opacity-100"
                        >
                          ✕
                        </button>
                      </form>
                    </div>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                    {f.content}
                  </p>
                </li>
              ))}
            </ol>
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
