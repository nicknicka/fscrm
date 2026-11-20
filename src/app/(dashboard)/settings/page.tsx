import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db/client";
import { SyncButton, FeishuStatus } from "./sync-button";

/** 供客户端组件使用的飞书配置状态。 */
export interface FeishuConfig {
  appIdConfigured: boolean;
  secretConfigured: boolean;
}

/** 设置页：飞书连接状态 + 通讯录手动同步。 */
export default async function SettingsPage() {
  const [departments, users] = await Promise.all([
    prisma.department.count(),
    prisma.user.count(),
  ]);
  const config: FeishuConfig = {
    appIdConfigured: Boolean(process.env.FEISHU_APP_ID),
    secretConfigured: Boolean(process.env.FEISHU_APP_SECRET),
  };

  return (
    <div>
      <PageHeader title="设置" description="飞书连接状态与通讯录同步管理" />

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
            <div className="mt-1 text-2xl font-bold text-zinc-900">{users}</div>
          </div>
        </div>
        <SyncButton />
      </section>
    </div>
  );
}
