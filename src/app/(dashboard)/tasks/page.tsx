import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { Enter } from "@/components/stagger";
import { accessScopeFor } from "@/lib/auth/scope";
import { getCurrentUser } from "@/lib/auth/session";
import { listCustomers } from "@/lib/db/repositories/customer";
import { listAssignableUsers } from "@/lib/db/repositories/user";
import { listOpportunities } from "@/lib/db/repositories/sales";
import {
  createSalesTaskAction,
  deleteSalesTaskFormAction,
  listSalesTasksForCurrentUser,
  toggleSalesTaskFormAction,
} from "./actions";

/* 这些页面读取会话与数据库，属于请求时数据，无法静态预渲染。 */
export const instant = false;

/** 任务与日程页：承接跟进提醒与销售计划，按权限可见。 */
export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;
  const query = await searchParams;
  const first = (key: string) => {
    const value = query[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const prefill = {
    customerId: first("customerId") ?? "",
    opportunityId: first("opportunityId") ?? "",
    followUpId: first("followUpId") ?? "",
    dueAt: first("dueAt") ?? "",
    title: first("title") ?? "",
  };
  const [tasks, customers, opportunities, users] = await Promise.all([
    listSalesTasksForCurrentUser(),
    listCustomers({}, accessScopeFor(user)),
    listOpportunities({}, user),
    listAssignableUsers(user),
  ]);

  return (
    <div>
      <Enter>
        <PageHeader
          title="任务与日程"
          description="你的待办与计划，支持关联客户和商机"
        />
      </Enter>

      <form
        action={createSalesTaskAction}
        className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-paper-raised p-5"
      >
        <input type="hidden" name="followUpId" value={prefill.followUpId} />
        <label className="text-xs text-ink-soft">
          类型
          <select
            name="type"
            className="mt-1 block rounded-lg border border-line-strong px-3 py-2 text-sm"
          >
            <option value="TASK">任务</option>
            <option value="SCHEDULE">日程</option>
          </select>
        </label>
        <label className="flex-1 text-xs text-ink-soft">
          标题
          <input
            name="title"
            required
            defaultValue={prefill.title}
            className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2 text-sm"
          />
        </label>
        {user.role === "ADMIN" && (
          <label className="text-xs text-ink-soft">
            负责人
            <select
              name="ownerId"
              className="mt-1 block rounded-lg border border-line-strong px-3 py-2 text-sm"
            >
              {users.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-xs text-ink-soft">
          计划时间
          <input
            name="dueAt"
            type="datetime-local"
            lang="zh-CN"
            required
            defaultValue={prefill.dueAt}
            className="mt-1 block rounded-lg border border-line-strong px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs text-ink-soft">
          关联客户
          <select
            name="customerId"
            defaultValue={prefill.customerId}
            className="mt-1 block max-w-[160px] rounded-lg border border-line-strong px-3 py-2 text-sm"
          >
            <option value="">无</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink-soft">
          关联商机
          <select
            name="opportunityId"
            defaultValue={prefill.opportunityId}
            className="mt-1 block max-w-[160px] rounded-lg border border-line-strong px-3 py-2 text-sm"
          >
            <option value="">无</option>
            {opportunities.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="w-full text-xs text-ink-soft">
          备注（可选）
          <input
            name="description"
            className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2 text-sm"
          />
        </label>
        <button type="submit" className="btn btn-primary">
          添加
        </button>
      </form>

      <section className="rounded-xl border border-line bg-paper-raised p-6">
        <h2 className="mb-4 text-base font-semibold">我的任务与日程</h2>
        {tasks.length === 0 ? (
          <EmptyState message="暂无任务或日程，用上方表单添加。" />
        ) : (
          <ul className="space-y-2">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3 text-sm"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone={task.type === "SCHEDULE" ? "blue" : "zinc"}>
                      {task.type === "SCHEDULE" ? "日程" : "任务"}
                    </Badge>
                    <span
                      className={
                        task.status === "DONE"
                          ? "text-ink-faint line-through"
                          : "font-medium text-ink"
                      }
                    >
                      {task.title}
                    </span>
                    {task.status === "DONE" && (
                      <Badge tone="green">已完成</Badge>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-ink-faint">
                    {task.dueAt.toLocaleString("zh-CN")}
                    {task.customer && ` · ${task.customer.name}`}
                    {task.opportunity && ` · ${task.opportunity.name}`}
                    {task.description && ` · ${task.description}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {task.status === "OPEN" && (
                    <form
                      action={toggleSalesTaskFormAction.bind(
                        null,
                        task.id,
                        "DONE"
                      )}
                    >
                      <button
                        type="submit"
                        className="min-h-11 rounded-lg border border-line-strong px-3 py-2 text-xs text-ink hover:bg-paper-sunk"
                      >
                        完成
                      </button>
                    </form>
                  )}
                  <form action={deleteSalesTaskFormAction.bind(null, task.id)}>
                    <button
                      type="submit"
                      className="text-xs text-danger hover:underline"
                    >
                      删除
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
