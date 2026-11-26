"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { patchOpportunityFieldAction } from "../actions";

type EditState = { ok: boolean; message: string };

const initialState: EditState = { ok: false, message: "" };

/**
 * 商机字段的就地编辑。
 *
 * 详情页不该是一张常驻表单——先在只读状态读清楚这单生意，需要改时才点进去。
 * 所以字段默认是「标签 + 值」，悬停出现铅笔，点击原地变成输入框，回车或
 * 失焦保存。保存仍走原来的 Server Action，一次改一个字段，避免整表重填。
 *
 * 所有字段共用一个 action：提交时只带被改的那个字段，其余保持原值由服务端忽略。
 */
export function EditableField({
  opportunityId,
  label,
  name,
  value,
  displayValue,
  type = "text",
  placeholder,
  align = "left",
  emphasis = false,
  options,
}: {
  opportunityId: string;
  label: string;
  name: string;
  value: string;
  displayValue: string;
  type?: "text" | "number" | "date" | "textarea" | "select";
  placeholder?: string;
  align?: "left" | "right";
  /** 金额等关键字段：值用更大的字重显示。 */
  emphasis?: boolean;
  options?: { value: string; label: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
  >(null);

  const [state, formAction, pending] = useActionState<EditState, FormData>(
    async (_prev, formData) => {
      try {
        await patchOpportunityFieldAction(opportunityId, formData);
        // 在 action 里直接收尾：合上编辑态、亮一下"已保存"。
        // 放进 effect 里做会触发 lint 的 set-state-in-effect 警告，
        // 而且这里本来就是一次副作用完成后的连续动作。
        setEditing(false);
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1800);
        return { ok: true, message: "已保存" };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "保存失败",
        };
      }
    },
    initialState
  );

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (!editing) {
    return (
      <div>
        <dt className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">
          {label}
        </dt>
        <dd className="mt-1">
          <button
            type="button"
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
            className={`group/edit flex items-center gap-1.5 rounded-md text-left transition-colors hover:text-brass-600 ${
              align === "right" ? "ml-auto" : ""
            }`}
          >
            <span
              className={
                emphasis
                  ? "tnum text-lg font-semibold text-ink"
                  : displayValue
                    ? "text-sm text-ink"
                    : "text-sm text-ink-faint"
              }
            >
              {displayValue || placeholder || "未设置"}
            </span>
            <span
              aria-hidden
              className="text-xs text-ink-faint opacity-0 transition-opacity group-hover/edit:opacity-100"
            >
              ✎
            </span>
          </button>
          {saved && <span className="ml-2 text-xs text-ok">已保存</span>}
        </dd>
      </div>
    );
  }

  return (
    <div>
      <span className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">
        {label}
      </span>
      <form
        action={formAction}
        className="mt-1"
        onBlur={(event) => {
          // 焦点离开整块表单才提交，避免在字段间切换时误存
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            event.currentTarget.requestSubmit();
          }
        }}
      >
        <input type="hidden" name="__editing" value={name} />
        {type === "textarea" ? (
          <textarea
            ref={(el) => {
              inputRef.current = el;
            }}
            name={name}
            rows={3}
            defaultValue={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full rounded-lg border border-brass-500 bg-paper-raised px-3 py-2 text-sm outline-none"
          />
        ) : type === "select" ? (
          <select
            ref={(el) => {
              inputRef.current = el;
            }}
            name={name}
            defaultValue={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full rounded-lg border border-brass-500 bg-paper-raised px-3 py-2 text-sm outline-none"
          >
            {options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            ref={(el) => {
              inputRef.current = el;
            }}
            type={type}
            name={name}
            defaultValue={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.currentTarget.form as HTMLFormElement).requestSubmit();
              }
              if (e.key === "Escape") setEditing(false);
            }}
            className="w-full rounded-lg border border-brass-500 bg-paper-raised px-3 py-2 text-sm outline-none"
          />
        )}
        <div className="mt-1.5 flex items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="btn btn-primary min-h-8 px-2.5 py-1 text-xs"
          >
            {pending ? "保存中…" : "保存"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-xs text-ink-faint transition-colors hover:text-ink-soft"
          >
            取消
          </button>
          {state.message && !state.ok && (
            <span className="text-xs text-danger">{state.message}</span>
          )}
        </div>
      </form>
    </div>
  );
}
