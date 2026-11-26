import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { Enter } from "@/components/stagger";
import { requireCurrentUser } from "@/lib/auth/session";
import { listAuditLogs } from "@/lib/db/repositories/audit-log";

/* 这些页面读取会话与数据库，属于请求时数据，无法静态预渲染。 */
export const instant = false;

/** 审计日志页：管理员看全部，负责人仅看自己的操作记录；支持按实体与摘要筛选。 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    entityType?: string | string[];
    q?: string | string[];
  }>;
}) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const entityType =
    typeof params.entityType === "string" ? params.entityType : "";
  const q = typeof params.q === "string" ? params.q : "";
  const logs = await listAuditLogs(user, {
    ...(entityType ? { entityType } : {}),
    ...(q ? { search: q } : {}),
  });

  return (
    <div>
      <Enter>
        <PageHeader
          title="审计日志"
          description="业务数据的关键写操作记录（与飞书集成日志分开）"
        />
      </Enter>

      <form
        method="get"
        className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-paper-raised p-4"
      >
        <label className="text-xs text-ink-soft">
          对象类型
          <select
            name="entityType"
            defaultValue={entityType}
            className="mt-1 block rounded-lg border border-line-strong px-3 py-2 text-sm"
          >
            <option value="">全部</option>
            {[
              "Customer",
              "Contact",
              "Lead",
              "Opportunity",
              "Quotation",
              "Contract",
              "Order",
              "Payment",
              "PaymentPlan",
              "Reconciliation",
              "SalesTask",
              "DiscountApproval",
            ].map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-48 flex-1 text-xs text-ink-soft">
          摘要关键词
          <input
            name="q"
            defaultValue={q}
            placeholder="如：回款、赢单、认领"
            className="mt-1 block w-full rounded-lg border border-line-strong px-3 py-2 text-sm"
          />
        </label>
        <button type="submit" className="btn btn-primary">
          筛选
        </button>
        {(entityType || q) && (
          <Link
            href="/audit"
            className="px-2 py-2 text-sm text-ink-faint hover:underline"
          >
            清除
          </Link>
        )}
      </form>

      <section className="rounded-xl border border-line bg-paper-raised p-6">
        {logs.length === 0 ? (
          <p className="text-sm text-ink-faint">暂无审计记录。</p>
        ) : (
          <ul className="divide-y divide-line">
            {logs.map((log) => (
              <li
                key={log.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
              >
                <div>
                  <span className="font-medium text-ink">{log.actorName}</span>
                  <span className="mx-2 text-ink-faint">·</span>
                  <span className="text-ink">{log.action}</span>
                  <span className="mx-2 text-ink-faint">·</span>
                  <span className="text-ink-soft">
                    {log.entityType} {log.entityId.slice(0, 8)}
                  </span>
                  <div className="mt-1 text-xs text-ink-faint">
                    {log.summary}
                  </div>
                </div>
                <span className="text-xs text-ink-faint">
                  {log.createdAt.toLocaleString("zh-CN")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
