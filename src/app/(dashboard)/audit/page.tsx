import { PageHeader } from "@/components/ui";
import { Enter } from "@/components/stagger";
import { requireCurrentUser } from "@/lib/auth/session";
import { listAuditLogs } from "@/lib/db/repositories/audit-log";

/** 业务审计日志页：管理员看全部，负责人仅看自己的操作记录。 */
export default async function AuditPage() {
  const user = await requireCurrentUser();
  const logs = await listAuditLogs(user);

  return (
    <div>
      <Enter>
        <PageHeader
          title="审计日志"
          description="业务数据的关键写操作记录（与飞书集成日志分开）"
        />
      </Enter>

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        {logs.length === 0 ? (
          <p className="text-sm text-zinc-500">暂无审计记录。</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {logs.map((log) => (
              <li
                key={log.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
              >
                <div>
                  <span className="font-medium text-zinc-900">
                    {log.actorName}
                  </span>
                  <span className="mx-2 text-zinc-400">·</span>
                  <span className="text-zinc-700">{log.action}</span>
                  <span className="mx-2 text-zinc-400">·</span>
                  <span className="text-zinc-600">
                    {log.entityType} {log.entityId.slice(0, 8)}
                  </span>
                  <div className="mt-1 text-xs text-zinc-500">
                    {log.summary}
                  </div>
                </div>
                <span className="text-xs text-zinc-400">
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
