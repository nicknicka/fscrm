"use client";

import { useActionState, useState } from "react";
import { createApiKeyAction } from "./actions";

type State = { plainKey: string; label: string } | null;

/** 创建 API Key 表单：明文 key 只在创建后展示一次，提示用户立即复制。 */
export function CreateApiKeyForm() {
  const [state, formAction, pending] = useActionState<State, FormData>(
    createApiKeyAction,
    null
  );
  const [copied, setCopied] = useState(false);

  return (
    <div className="mb-6 rounded-lg border border-zinc-200 p-4">
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <label className="flex-1 text-xs text-zinc-600">
          用途名称
          <input
            name="label"
            placeholder="如：ERP 同步"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "生成中…" : "生成 API Key"}
        </button>
      </form>

      {state?.plainKey && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">请立即复制并保存，此 key 只显示一次：</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-white px-3 py-2 text-xs">
              {state.plainKey}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(state.plainKey);
                setCopied(true);
              }}
              className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs"
            >
              {copied ? "已复制" : "复制"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
