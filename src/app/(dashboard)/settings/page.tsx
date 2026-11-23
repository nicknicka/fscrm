import { Badge, PageHeader } from "@/components/ui";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { listUsers } from "@/lib/db/repositories/user";
import { prisma } from "@/lib/db/client";
import { getActiveModelConfigView } from "@/lib/ai/model-config";
import { SyncButton, FeishuStatus } from "./sync-button";

/** 供客户端组件使用的飞书配置状态。 */
export interface FeishuConfig {
  appIdConfigured: boolean;
  secretConfigured: boolean;
}

/** 设置页：飞书连接状态 + 通讯录手动同步。 */
export default async function SettingsPage() {
  const [departments, users, currentUser, modelConfig] = await Promise.all([
    prisma.department.count(),
    listUsers(),
    getCurrentUser(),
    getActiveModelConfigView(),
  ]);
  const config: FeishuConfig = {
    appIdConfigured: Boolean(process.env.FEISHU_APP_ID),
    secretConfigured: Boolean(process.env.FEISHU_APP_SECRET),
  };

  return (
    <div>
      <PageHeader title="设置" description="飞书连接状态与通讯录同步管理" />

      <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">API 访问</h2>
            <p className="mt-2 text-sm text-zinc-600">
              生成只读业务数据 API 的凭据。
            </p>
          </div>
          <Link
            href="/settings/api-keys"
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            管理 API Key
          </Link>
        </div>
      </section>

      {currentUser?.role === "ADMIN" && (
        <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">字段级权限</h2>
              <p className="mt-2 text-sm text-zinc-600">
                控制负责人可见的客户敏感字段。
              </p>
            </div>
            <Link
              href="/settings/field-permissions"
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              配置字段权限
            </Link>
          </div>
        </section>
      )}

      {currentUser?.role === "ADMIN" && (
        <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">销售阶段</h2>
              <p className="mt-2 text-sm text-zinc-600">
                调整商机阶段的显示名、顺序与启停。
              </p>
            </div>
            <Link
              href="/settings/stages"
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              配置阶段
            </Link>
          </div>
        </section>
      )}

      {currentUser?.role === "ADMIN" && (
        <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">用户与角色</h2>
              <p className="mt-2 text-sm text-zinc-600">
                查看负责人的当前角色，并任命或撤销管理员。系统中有{" "}
                {users.length} 位用户。
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge tone="blue">管理员</Badge>
              <Link
                href="/settings/users"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                管理用户与角色
              </Link>
            </div>
          </div>
        </section>
      )}

      <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold">模型服务</h2>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  modelConfig?.lastTestOk
                    ? "bg-green-50 text-green-700"
                    : modelConfig
                      ? "bg-amber-50 text-amber-700"
                      : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {modelConfig
                  ? modelConfig.lastTestOk
                    ? "已配置 · 连通正常"
                    : "已配置 · 待测试"
                  : "未配置"}
              </span>
            </div>
            <p className="mt-2 text-sm text-zinc-600">
              {modelConfig
                ? `当前使用 ${modelConfig.label} / ${modelConfig.model}。飞书机器人用它解析销售随手发的跟进消息。`
                : "配置 OpenAI 兼容接口后，飞书机器人才能把「今天电话聊了，预算 80 万」解析成结构化跟进记录。"}
            </p>
          </div>
          {currentUser?.role === "ADMIN" && (
            <Link
              href="/settings/model"
              className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              配置模型
            </Link>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">飞书连接</h2>
          <FeishuStatus config={config} />
        </div>
        <p className="mt-2 text-sm text-zinc-600">
          应用凭证来自{" "}
          <code className="rounded bg-zinc-100 px-1">.env.local</code>，
          通讯录同步需要开通相应权限并配置飞书开放平台应用。
        </p>
      </section>

      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-base font-semibold">通讯录同步</h2>
        <p className="mt-2 text-sm text-zinc-600">
          从飞书拉取部门与用户，写入本地数据库。按飞书 ID 幂等更新，可重复运行。
        </p>
        <div className="mt-4 flex gap-6 text-sm">
          <div>
            <div className="text-zinc-500">部门</div>
            <div className="mt-1 text-2xl font-bold text-zinc-900">
              {departments}
            </div>
          </div>
          <div>
            <div className="text-zinc-500">用户</div>
            <div className="mt-1 text-2xl font-bold text-zinc-900">
              {users.length}
            </div>
          </div>
        </div>
        <SyncButton />
      </section>
    </div>
  );
}
