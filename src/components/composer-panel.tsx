"use client";

import { useState, type ReactNode } from "react";

/**
 * 可折叠的录入区。
 *
 * 详情页的第一屏应该让人读懂这单生意，而不是迎面撞上一组输入框。
 * 录入表单默认收起，点「+ 记一笔」展开——原生 <details> 不够用，
 * 因为要在展开后自动聚焦第一个输入框，这里用受控展开。
 */
export function ComposerPanel({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mb-4 flex w-full items-center gap-2 rounded-lg border border-dashed border-line-strong px-4 py-2.5 text-sm text-ink-faint transition-colors hover:border-brass-500 hover:text-brass-600"
        >
          <span aria-hidden className="text-base leading-none">
            +
          </span>
          {label}
        </button>
      )}

      {open && (
        <div className="mb-4 rounded-xl bg-paper-sunk p-4 ring-1 ring-inset ring-line">
          {children}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 text-xs text-ink-faint transition-colors hover:text-ink-soft"
          >
            收起
          </button>
        </div>
      )}
    </div>
  );
}
