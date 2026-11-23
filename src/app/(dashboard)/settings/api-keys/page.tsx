import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/session";
import { listApiKeys } from "@/lib/api-key";
import { CreateApiKeyForm } from "./create-form";
import { revokeApiKeyFormAction } from "./actions";

/** API Key 管理页 + 只读 API 使用说明。 */
export default async function ApiKeysPage() {
  const user = await getCurrentUser();
  const keys = user ? await listApiKeys(user) : [];

  return (
    <div>
      <Link href="/settings" className="text-sm text-blue-600 hover:underline">
        ← 返回设置
      </Link>
      <div className="mt-4">
        <PageHeader
          title="API 访问"
          description="管理只读业务数据 API 的凭据"
        />
      </div>

      <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="mb-3 text-base font-semibold">我的 API Key</h2>
        <CreateApiKeyForm />

        {keys.length === 0 ? (
          <p className="text-sm text-zinc-500">尚无 API Key。</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {keys.map((key) => (
              <li
                key={key.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
              >
                <div>
                  <span className="font-medium text-zinc-900">{key.label}</span>
                  <span className="ml-2 text-xs text-zinc-500">
                    归属 {key.user.name} · {key.isActive ? "启用" : "已吊销"}
                    {key.lastUsedAt &&
                      ` · 最近使用 ${key.lastUsedAt.toLocaleString("zh-CN")}`}
                  </span>
                </div>
                {key.isActive && (
                  <form action={revokeApiKeyFormAction.bind(null, key.id)}>
                    <button
                      type="submit"
                      className="text-xs text-red-600 hover:underline"
                    >
                      吊销
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700">
        <h2 className="mb-3 text-base font-semibold">接口说明（只读）</h2>
        <p className="mb-3 text-zinc-600">
          API Key
          关联创建它的用户，读取权限与网页端一致：负责人仅见本人数据，管理员可见全部。仅支持
          GET，不提供写入。
        </p>
        <pre className="overflow-x-auto rounded-lg bg-zinc-900 p-4 text-xs text-zinc-100">{`GET /api/v1/{resource}
Authorization: Bearer <你的 API Key>

resource 可选：
  customers       客户
  leads           线索
  opportunities   商机
  contracts       合同
  orders          订单

响应：{ "data": [...], "count": 数量 }
错误：401 未授权 / 404 未知资源 / 500 服务错误`}</pre>
        <p className="mt-3 text-xs text-zinc-500">
          鉴权也可用网页登录会话（Cookie）。当前版本未实现服务端限流，请在网关层按需配置。
        </p>
      </section>
    </div>
  );
}
