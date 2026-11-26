import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { Enter } from "@/components/stagger";
import { getCurrentUser } from "@/lib/auth/session";
import { listOpportunitiesForCurrentUser } from "@/app/(dashboard)/opportunities/scope";
import {
  listDiscountApprovalsForCurrentUser,
  requestDiscountApprovalAction,
  reviewDiscountApprovalAction,
} from "./actions";

/* 这些页面读取会话与数据库，属于请求时数据，无法静态预渲染。 */
export const instant = false;

/** 折扣审批页：负责人发起申请，管理员审批；通过后联动调整商机金额。 */
export default async function ApprovalsPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const isAdmin = user.role === "ADMIN";
  const [approvals, opportunities] = await Promise.all([
    listDiscountApprovalsForCurrentUser(),
    listOpportunitiesForCurrentUser(user),
  ]);

  const statusMeta: Record<
    string,
    { label: string; tone: "blue" | "green" | "red" | "amber" }
  > = {
    PENDING: { label: "待审批", tone: "amber" },
    APPROVED: { label: "已通过", tone: "green" },
    REJECTED: { label: "已驳回", tone: "red" },
  };

  return (
    <div>
      <Enter>
        <PageHeader
          title="折扣审批"
          description="商机折扣申请与审批，通过后自动调整商机金额"
        />
      </Enter>

      {!isAdmin && opportunities.length > 0 && (
        <form
          action={requestDiscountApprovalAction}
          className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-paper-raised p-5"
        >
          <label className="text-xs text-ink-soft">
            商机
            <select
              name="opportunityId"
              required
              className="mt-1 block max-w-xs rounded-lg border border-line-strong px-3 py-2 text-sm"
            >
              {opportunities.map((opp) => (
                <option key={opp.id} value={opp.id}>
                  {opp.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-ink-soft">
            折扣率（0.1 = 九折）
            <input
              name="discountRate"
              type="number"
              min="0.01"
              max="1"
              step="0.01"
              required
              className="mt-1 block rounded-lg border border-line-strong px-3 py-2 text-sm"
            />
          </label>
          <label className="flex-1 text-xs text-ink-soft">
            申请理由
            <input
              name="reason"
              required
              className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2 text-sm"
            />
          </label>
          <button type="submit" className="btn btn-primary">
            提交审批
          </button>
        </form>
      )}

      <section className="rounded-xl border border-line bg-paper-raised p-6">
        <h2 className="mb-4 text-base font-semibold">审批记录</h2>
        {approvals.length === 0 ? (
          <EmptyState message="暂无折扣审批记录。" />
        ) : (
          <ul className="space-y-3">
            {approvals.map((approval) => {
              const meta = statusMeta[approval.status] ?? statusMeta.PENDING;
              return (
                <li
                  key={approval.id}
                  className="rounded-lg border border-line p-4 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-medium text-ink">
                        {approval.opportunity.customer.name} ·{" "}
                        {approval.opportunity.name}
                      </span>
                      <span className="ml-2 text-ink-faint">
                        折扣 {Math.round(approval.discountRate * 100)}% off
                      </span>
                    </div>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </div>
                  <p className="mt-2 text-ink-soft">理由：{approval.reason}</p>
                  {approval.reviewNote && (
                    <p className="mt-1 text-ink-faint">
                      审批备注：{approval.reviewNote}
                    </p>
                  )}

                  {isAdmin && approval.status === "PENDING" && (
                    <form
                      action={reviewDiscountApprovalAction}
                      className="mt-3 flex flex-wrap items-center gap-2"
                    >
                      <input
                        type="hidden"
                        name="approvalId"
                        value={approval.id}
                      />
                      <input
                        name="note"
                        placeholder="审批备注（可选）"
                        className="rounded-lg border border-line-strong px-3 py-1.5 text-sm"
                      />
                      <button
                        type="submit"
                        name="decision"
                        value="APPROVED"
                        className="min-h-11 rounded-lg bg-ok px-3 py-2.5 text-sm font-medium text-white hover:bg-ok"
                      >
                        通过
                      </button>
                      <button
                        type="submit"
                        name="decision"
                        value="REJECTED"
                        className="min-h-11 rounded-lg border border-line-strong px-3 py-2.5 text-sm text-ink hover:bg-paper-sunk"
                      >
                        驳回
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
