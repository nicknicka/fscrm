import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/session";
import { listUsers } from "@/lib/db/repositories/user";
import { grantAdminAction, revokeAdminAction } from "./actions";

/**
 * 管理员可见的用户与角色页面。
 *
 * 页面通过签名会话的管理员守卫读取用户列表；普通负责人即使直接访问路由也
 * 会在服务端被拒绝。角色变更由 Server Action 再次校验权限。
 */
export default async function AdminUsersPage() {
  // 非管理员直接访问该路由时展示说明页，而不是抛出 500 错误页。
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "ADMIN") {
    return (
      <div>
        <PageHeader title="用户与角色" description="仅管理员可访问" />
        <EmptyState message="你没有访问权限：用户与角色管理仅对管理员开放。" />
      </div>
    );
  }

  const users = await listUsers();

  return (
    <div>
      <PageHeader
        title="用户与角色"
        description="查看负责人的当前角色，并任命或撤销管理员"
      />

      <section className="rounded-xl border border-line bg-paper-raised p-6">
        {users.length === 0 ? (
          <EmptyState message="暂无用户" />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs text-ink-faint">
              <tr>
                <th className="pb-3 font-medium">用户</th>
                <th className="pb-3 font-medium">角色</th>
                <th className="pb-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.map((user) => (
                <tr key={user.id} className="row-glow">
                  <td className="py-3">
                    <div className="font-medium text-ink">{user.name}</div>
                    {user.email && (
                      <div className="mt-0.5 text-xs text-ink-faint">
                        {user.email}
                      </div>
                    )}
                  </td>
                  <td className="py-3">
                    <Badge tone={user.role === "ADMIN" ? "blue" : "zinc"}>
                      {user.role === "ADMIN" ? "管理员" : "普通负责人"}
                    </Badge>
                  </td>
                  <td className="py-3 text-right">
                    {user.role === "ADMIN" ? (
                      <form action={revokeAdminAction}>
                        <input type="hidden" name="userId" value={user.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-medium text-ink hover:bg-paper-sunk"
                        >
                          撤销管理员
                        </button>
                      </form>
                    ) : (
                      <form action={grantAdminAction}>
                        <input type="hidden" name="userId" value={user.id} />
                        <button
                          type="submit"
                          className="btn btn-primary text-xs"
                        >
                          任命为管理员
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
