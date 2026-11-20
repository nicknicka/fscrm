"use client";

import { useActionState } from "react";
import { syncContactsAction } from "./actions";
import type { RunContactSyncResult } from "@/lib/services/contact-sync";
import type { FeishuConfig } from "./page";

/** 手动同步按钮：调用 Server Action 并展示结果。 */
export function SyncButton() {
  // useActionState 的状态函数签名为 (prevState, formData) => newState
  const [state, formAction, pending] = useActionState<
    RunContactSyncResult | null,
    FormData
  >(async (_prevState: RunContactSyncResult | null, _formData: FormData) => {
    return await syncContactsAction();
  }, null);

  return (
    <div className="mt-4">
      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "同步中…" : "立即同步通讯录"}
        </button>
      </form>

      {state && (
        <div
          className={`mt-3 rounded-lg border px-4 py-3 text-sm ${
            state.ok
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {state.ok ? (
            <p>
              ✅ 同步成功：部门 {state.result?.departmentCount ?? 0} 个、人员{" "}
              {state.result?.personCount ?? 0} 个，耗时 {state.durationMs}ms。
              数据库现有部门 {state.totals?.departments ?? 0} 个、用户{" "}
              {state.totals?.users ?? 0} 个。
            </p>
          ) : (
            <p>❌ 同步失败：{state.error}</p>
          )}
        </div>
      )}
    </div>
  );
}

/** 飞书凭证状态提示（服务端传入）。 */
export function FeishuStatus({ config }: { config: FeishuConfig }) {
  const configured = config.appIdConfigured && config.secretConfigured;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        configured ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
      }`}
    >
      {configured ? "已配置凭证" : "凭证未配置"}
    </span>
  );
}
