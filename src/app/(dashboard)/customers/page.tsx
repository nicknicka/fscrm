import Link from "next/link";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { listCustomers } from "@/lib/db/repositories/customer";
import { CustomerLevel } from "@/generated/prisma/enums";
import { CustomerForm } from "./customer-form";
import { deleteCustomerAction } from "./actions";

/**
 * 客户列表页。
 *
 * 通过 `searchParams` 支持按名称/电话/邮箱搜索。
 */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const customers = await listCustomers({ search: q });

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
        title="客户"
        description={`共 ${customers.length} 个客户`}
        action={<CustomerForm />}
      />

      <form className="mb-4 flex gap-2" action="/customers">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="搜索客户名称、电话或邮箱"
          className="w-full max-w-sm rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-900"
        >
          搜索
        </button>
      </form>

      {customers.length === 0 ? (
        <EmptyState message="暂无客户数据，点击右上角「新建客户」开始添加。" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">客户名称</th>
                <th className="px-4 py-3 font-medium">等级</th>
                <th className="px-4 py-3 font-medium">行业</th>
                <th className="px-4 py-3 font-medium">负责人</th>
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
                    {customer.owner?.name ?? "未分配"}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {(
                      customer as {
                        _count?: { contacts: number; opportunities: number };
                      }
                    )._count?.contacts ?? 0}
                    {" / "}
                    {(
                      customer as {
                        _count?: { contacts: number; opportunities: number };
                      }
                    )._count?.opportunities ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    <form action={deleteCustomerAction.bind(null, customer.id)}>
                      <button
                        type="submit"
                        className="text-sm text-red-600 hover:underline"
                      >
                        删除
                      </button>
                    </form>
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
