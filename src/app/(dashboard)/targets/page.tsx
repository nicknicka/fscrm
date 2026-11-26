import { PageHeader } from "@/components/ui";
import { NavLink } from "@/components/nav-link";
import { Enter } from "@/components/stagger";
import { getCurrentUser } from "@/lib/auth/session";
import { listAssignableUsers } from "@/lib/db/repositories/user";
import {
  currentMonth,
  loadTargetBoard,
} from "@/lib/db/repositories/sales-target";
import { setSalesTargetAction } from "./actions";

/* 这些页面读取会话与数据库，属于请求时数据，无法静态预渲染。 */
export const instant = false;

/** 业绩目标看板：按负责人 × 月份展示完成率，管理员可设置目标。 */
export default async function TargetsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;
  const params = await searchParams;
  const month =
    typeof params.month === "string" && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : currentMonth();
  const [board, users] = await Promise.all([
    loadTargetBoard(user, month),
    user.role === "ADMIN" ? listAssignableUsers(user) : Promise.resolve([]),
  ]);

  return (
    <div>
      <Enter>
        <PageHeader
          title="业绩目标"
          description={`${month} · 完成额按当月赢单商机金额统计`}
        />
      </Enter>

      <div className="mb-4 flex items-center gap-2 text-sm">
        <NavLink
          href="/targets"
          className={`rounded-full px-3 py-1 ${month === currentMonth() ? "bg-ink-900 text-white" : "bg-paper-raised text-ink-soft ring-1 ring-line"}`}
        >
          本月
        </NavLink>
        <form
          action="/targets"
          method="get"
          className="flex items-center gap-2"
        >
          <input
            type="month"
            name="month"
            defaultValue={month}
            className="rounded-lg border border-line-strong px-3 py-1"
          />
          <button
            type="submit"
            className="rounded-lg border border-line-strong px-3 py-1"
          >
            查看
          </button>
        </form>
      </div>

      {user.role === "ADMIN" && (
        <form
          action={setSalesTargetAction}
          className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-paper-raised p-5"
        >
          <label className="text-xs text-ink-soft">
            负责人
            <select
              name="userId"
              className="mt-1 block rounded-lg border border-line-strong px-3 py-2 text-sm"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-ink-soft">
            月份
            <input
              name="month"
              type="month"
              defaultValue={month}
              className="mt-1 block rounded-lg border border-line-strong px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-ink-soft">
            目标金额
            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
              className="mt-1 block rounded-lg border border-line-strong px-3 py-2 text-sm"
            />
          </label>
          <label className="flex-1 text-xs text-ink-soft">
            备注（可选）
            <input
              name="note"
              className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2 text-sm"
            />
          </label>
          <button type="submit" className="btn btn-primary">
            设置目标
          </button>
        </form>
      )}

      <section className="rounded-xl border border-line bg-paper-raised p-6">
        <h2 className="mb-4 text-base font-semibold">完成率</h2>
        {board.length === 0 ? (
          <p className="text-sm text-ink-faint">本月尚未设置业绩目标。</p>
        ) : (
          <div className="space-y-4">
            {board.map((row) => (
              <div key={row.userId} className="text-sm">
                <div className="mb-1 flex justify-between">
                  <span className="font-medium text-ink">{row.userName}</span>
                  <span className="text-ink-faint">
                    ¥{row.achieved.toLocaleString("zh-CN")} / ¥
                    {row.target.toLocaleString("zh-CN")} · {row.rate}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-paper-sunk">
                  <div
                    className="h-full rounded-full bg-ok"
                    style={{ width: `${Math.min(row.rate, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
