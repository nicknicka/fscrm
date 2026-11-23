"use client";

import { useActionState } from "react";
import {
  bindChatToCustomerAction,
  unbindChatAction,
  type BindChatResult,
} from "./chat-bind-actions";

/**
 * 群绑定管理：把飞书群关联到这个客户。
 *
 * 面向的痛点是「每次在群里 @机器人都要念一遍公司名」。
 * 绑定后机器人会先用群对应的客户作为默认上下文。
 *
 * 提交后由 Server Action 内部的 `revalidatePath` 触发页面刷新，
 * 不在这里调 `router.refresh()`——保持与其它表单一致的刷新路径。
 */

export interface ChatBindingItem {
  chatId: string;
  boundByName: string | null;
  createdAt: string;
}

export function ChatBindingManager({
  customerId,
  bindings,
}: {
  customerId: string;
  bindings: ChatBindingItem[];
}) {
  const [state, formAction, pending] = useActionState<
    BindChatResult | null,
    FormData
  >(async (_prev, formData) => {
    return await bindChatToCustomerAction(customerId, formData);
  }, null);

  const [unbindState, unbindAction, unbinding] = useActionState<
    BindChatResult | null,
    FormData
  >(async (_prev, formData) => {
    return await unbindChatAction(
      customerId,
      String(formData.get("chatId") ?? "")
    );
  }, null);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-base font-semibold">飞书群绑定</h2>
      <p className="mt-1 text-sm text-zinc-600">
        绑定后，在这个群里 @机器人 记跟进会自动带出该客户，不用每次都念公司名。
        绑定不改变数据权限——群里其他人仍然只能看到自己负责的客户。
      </p>

      {bindings.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">还没有绑定任何群。</p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-100">
          {bindings.map((binding) => (
            <li
              key={binding.chatId}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
            >
              <div>
                <code className="rounded bg-zinc-100 px-1 text-xs">
                  {binding.chatId}
                </code>
                <span className="ml-2 text-xs text-zinc-500">
                  {binding.boundByName ?? "其他同事"} 绑定于 {binding.createdAt}
                </span>
              </div>
              <form action={unbindAction}>
                <input type="hidden" name="chatId" value={binding.chatId} />
                <button
                  type="submit"
                  disabled={unbinding}
                  className="text-xs text-red-600 hover:underline disabled:opacity-50"
                >
                  解绑
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex-1 text-sm">
          <span className="mb-1 block font-medium text-zinc-700">
            飞书群 ID
          </span>
          <input
            name="chatId"
            placeholder="oc_xxxxxxxxxxxx"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
            required
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
        >
          {pending ? "绑定中…" : "绑定"}
        </button>
      </form>

      {(state ?? unbindState) && (
        <p
          className={`mt-2 text-xs ${
            (state ?? unbindState)!.ok ? "text-green-700" : "text-red-700"
          }`}
        >
          {(state ?? unbindState)!.message}
        </p>
      )}
    </section>
  );
}
