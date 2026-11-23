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
          className={`rounded-full px-3 py-1 ${month === currentMonth() ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200"}`}
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
            className="rounded-lg border border-zinc-300 px-3 py-1"
          />
          <button
            type="submit"
            className="rounded-lg border border-zinc-300 px-3 py-1"
          >
            查看
          </button>
        </form>
      </div>

      {user.role === "ADMIN" && (
        <form
          action={setSalesTargetAction}
          className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-5"
        >
          <label className="text-xs text-zinc-600">
            负责人
            <select
              name="userId"
              className="mt-1 block rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-600">
            月份
            <input
              name="month"
              type="month"
              defaultValue={month}
              className="mt-1 block rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-zinc-600">
            目标金额
            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
              className="mt-1 block rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex-1 text-xs text-zinc-600">
            备注（可选）
            <input
              name="note"
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            设置目标
          </button>
        </form>
      )}

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold">完成率</h2>
        {board.length === 0 ? (
          <p className="text-sm text-zinc-500">本月尚未设置业绩目标。</p>
        ) : (
          <div className="space-y-4">
            {board.map((row) => (
              <div key={row.userId} className="text-sm">
                <div className="mb-1 flex justify-between">
                  <span className="font-medium text-zinc-800">
                    {row.userName}
                  </span>
                  <span className="text-zinc-500">
                    ¥{row.achieved.toLocaleString("zh-CN")} / ¥
                    {row.target.toLocaleString("zh-CN")} · {row.rate}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full bg-emerald-500"
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
