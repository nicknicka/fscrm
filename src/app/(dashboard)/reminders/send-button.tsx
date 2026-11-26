"use client";

import { useActionState } from "react";
import { sendRemindersAction, type SendRemindersResult } from "./actions";

/** 管理员手动触发一次提醒推送，便于演示与排查。 */
export function SendRemindersButton() {
  const [state, formAction, pending] = useActionState<
    SendRemindersResult | null,
    FormData
  >(async () => sendRemindersAction(), null);

  return (
    <div className="flex flex-col items-end gap-2">
      <form action={formAction}>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "推送中…" : "立即推送到飞书"}
        </button>
      </form>
      {state && (
        <p className={`text-xs ${state.ok ? "text-ok" : "text-danger"}`}>
          {state.message}
        </p>
      )}
    </div>
  );
}
