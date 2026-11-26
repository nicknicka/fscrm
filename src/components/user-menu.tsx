import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { logout } from "@/app/auth/actions";

/** 侧栏底部的当前负责人与退出入口（墨玉深底）。 */
export async function UserMenu() {
  const user: CurrentUser | null = await getCurrentUser();
  if (!user) {
    return null;
  }

  const roleLabel = user.role === "ADMIN" ? "管理员" : "负责人";

  return (
    <div className="shrink-0 border-t border-white/[0.08] p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brass-100/15 text-sm font-semibold text-brass-400 ring-1 ring-inset ring-brass-400/30">
          {user.name.slice(0, 1) || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-medium text-white"
            title={user.name}
          >
            {user.name}
          </p>
          <p className="text-xs text-white/40">当前{roleLabel}</p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-md px-2 py-1 text-xs font-medium text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white/90"
          >
            退出
          </button>
        </form>
      </div>
    </div>
  );
}
