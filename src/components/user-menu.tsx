import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { logout } from "@/app/auth/actions";

/** 侧栏底部的当前负责人与退出入口。 */
export async function UserMenu() {
  const user: CurrentUser | null = await getCurrentUser();
  if (!user) {
    return null;
  }

  const roleLabel = user.role === "ADMIN" ? "管理员" : "负责人";

  return (
    <div className="border-t border-zinc-200 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700">
          {user.name.slice(0, 1) || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-900" title={user.name}>
            {user.name}
          </p>
          <p className="text-xs text-zinc-500">当前{roleLabel}</p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-md px-2 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          >
            退出
          </button>
        </form>
      </div>
    </div>
  );
}
