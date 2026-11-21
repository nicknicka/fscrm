import Link from "next/link";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { requireCurrentUser } from "@/lib/auth/session";
import { accessScopeFor } from "@/lib/auth/scope";
import { listCustomers } from "@/lib/db/repositories/customer";
import { listAssignableUsers } from "@/lib/db/repositories/user";
import { CustomerLevel } from "@/generated/prisma/enums";
import {
  claimPublicCustomerAction,
  setCustomerOwnerAction,
} from "../public-pool-actions";

/**
 * 公海列表页：展示所有尚无负责人的客户。
 *
 * 认领按钮对所有负责人可见；管理员可在客户详情中指定或清空负责人。
 */
export default async function PublicPoolPage() {
  const currentUser = await requireCurrentUser();
  const scope = accessScopeFor(currentUser);
  const [customers, users] = await Promise.all([
    listCustomers({ unassignedOnly: true }, scope),
    listAssignableUsers(currentUser),
  ]);

  const levelTone: Record<string, "red" | "amber" | "zinc"> = {
    [CustomerLevel.HIGH]: "red",
    [CustomerLevel.MEDIUM]: "amber",
    [CustomerLevel.LOW]: "zinc",
  };
  const levelLabel: Record<string, string> = {
    [CustomerLevel.HIGH]: "高价值",
    [CustomerLevel.MEDIUM]: "中价值",
    [CustomerLevel.LOW]: "低价值",
  };

  return (
    <div>
      <PageHeader
        title="公海"
        description={`共 ${customers.length} 个公海客户`}
      />

      {customers.length === 0 ? (
        <EmptyState message="公海暂无客户。" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">客户名称</th>
                <th className="px-4 py-3 font-medium">等级</th>
                <th className="px-4 py-3 font-medium">行业</th>
                <th className="px-4 py-3 font-medium">联系人/商机</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {customers.map((customer) => (
                <tr key={customer.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {customer.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={levelTone[customer.level]}>
                      {levelLabel[customer.level]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {customer.industry ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {customer._count.contacts} / {customer._count.opportunities}
                  </td>
                  <td className="px-4 py-3">
                    {scope.role === "OWNER" && (
                      <form
                        action={claimPublicCustomerAction.bind(null, customer.id)}
                      >
                        <button
                          type="submit"
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                        >
                          认领
                        </button>
                      </form>
                    )}
                    {scope.role === "ADMIN" && (
                      <form
                        className="flex gap-2"
                        action={setCustomerOwnerAction.bind(null, customer.id)}
                      >
                        <select
                          name="ownerId"
                          className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm"
                          defaultValue=""
                        >
                          <option value="">移入公海</option>
                          {users.map((user) => (
                            <option key={user.id} value={user.id}>
                              指定给 {user.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="rounded-lg border border-zinc-300 px-3 py-1 text-sm text-zinc-700 hover:bg-zinc-50"
                        >
                          保存
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
