import type { ReactNode } from "react";

/**
 * 空态的统一语言。
 *
 * 空态不是"这里没东西"，是"这里本该有什么、怎么让它出现"。
 * 一个系统里八处空态各画各的虚线框，读起来像八个没做完的半成品；
 * 统一成一个组件后，空态本身成了产品语气的一部分。
 *
 * 三段结构：一句陈述（发生了什么）+ 一句解释（为什么会这样）+ 一个动作（怎么开始）。
 * 没有动作的地方就不要给空态——那是布局没想清楚。
 */
export function EmptyStatePanel({
  title,
  description,
  action,
  variant = "panel",
  className = "",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  /** panel：占位的整块区域；inline：卡片内的一小段；plain：表格里的空行 */
  variant?: "panel" | "inline" | "plain";
  className?: string;
}) {
  if (variant === "plain") {
    return (
      <div className={`py-16 text-center ${className}`}>
        <p className="text-sm font-medium text-ink-soft">{title}</p>
        {description && (
          <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-ink-soft">
            {description}
          </p>
        )}
        {action && <div className="mt-4 flex justify-center">{action}</div>}
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <div
        className={`rounded-xl bg-paper-sunk px-4 py-5 text-center ring-1 ring-inset ring-line ${className}`}
      >
        <p className="text-sm font-medium text-ink-soft">{title}</p>
        {description && (
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            {description}
          </p>
        )}
        {action && <div className="mt-3">{action}</div>}
      </div>
    );
  }

  return (
    <div
      className={`flex min-h-[52vh] flex-col items-center justify-center rounded-[14px] border border-line bg-paper-raised px-6 py-14 text-center shadow-[var(--shadow-xs)] ${className}`}
    >
      {/* 一个安静的记号：不是插画，是一枚印章感的圆点 */}
      <span
        aria-hidden
        className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-paper-sunk text-base text-ink-faint ring-1 ring-inset ring-line-strong"
      >
        ∅
      </span>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && (
        <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-ink-soft">
          {description}
        </p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
