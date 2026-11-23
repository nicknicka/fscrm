import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { Enter } from "@/components/stagger";
import { accessScopeFor } from "@/lib/auth/scope";
import { getCurrentUser } from "@/lib/auth/session";
import { listCustomers } from "@/lib/db/repositories/customer";
import { listOpportunities } from "@/lib/db/repositories/sales";
import {
  createSalesTaskAction,
  deleteSalesTaskFormAction,
  listSalesTasksForCurrentUser,
  toggleSalesTaskFormAction,
} from "./actions";

/** 任务与日程页：承接跟进提醒与销售计划，按权限可见。 */
export default async function TasksPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const [tasks, customers, opportunities] = await Promise.all([
    listSalesTasksForCurrentUser(),
    listCustomers({}, accessScopeFor(user)),
    listOpportunities({}, user),
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
        className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-5"
      >
        <label className="text-xs text-zinc-600">
          类型
          <select
            name="type"
            className="mt-1 block rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="TASK">任务</option>
            <option value="SCHEDULE">日程</option>
          </select>
        </label>
        <label className="flex-1 text-xs text-zinc-600">
          标题
          <input
            name="title"
            required
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs text-zinc-600">
          计划时间
          <input
            name="dueAt"
            type="datetime-local"
            required
            className="mt-1 block rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs text-zinc-600">
          关联客户
          <select
            name="customerId"
            className="mt-1 block max-w-[160px] rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">无</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-600">
          关联商机
          <select
            name="opportunityId"
            className="mt-1 block max-w-[160px] rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">无</option>
            {opportunities.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="w-full text-xs text-zinc-600">
          备注（可选）
          <input
            name="description"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          添加
        </button>
      </form>

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold">我的任务与日程</h2>
        {tasks.length === 0 ? (
          <EmptyState message="暂无任务或日程，用上方表单添加。" />
        ) : (
          <ul className="space-y-2">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-100 p-3 text-sm"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone={task.type === "SCHEDULE" ? "blue" : "zinc"}>
                      {task.type === "SCHEDULE" ? "日程" : "任务"}
                    </Badge>
                    <span
                      className={
                        task.status === "DONE"
                          ? "text-zinc-400 line-through"
                          : "font-medium text-zinc-900"
                      }
                    >
                      {task.title}
                    </span>
                    {task.status === "DONE" && (
                      <Badge tone="green">已完成</Badge>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
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
                        className="rounded-lg border border-zinc-300 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                      >
                        完成
                      </button>
                    </form>
                  )}
                  <form action={deleteSalesTaskFormAction.bind(null, task.id)}>
                    <button
                      type="submit"
                      className="text-xs text-red-600 hover:underline"
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
