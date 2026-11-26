import type { ReactNode } from "react";

/**
 * 页面标题区：编辑式排版——大标题带紧字距，描述降一级明度。
 * 标题下一道发丝线收住页头，让内容从「纸面」上长出来。
 */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex items-end justify-between gap-4 border-b border-line pb-5">
      <div>
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-faint">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

/** 状态徽章：纸面体系里重新校过的功能色，发丝描边代替实色块。 */
export function Badge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "blue" | "green" | "amber" | "red" | "zinc";
}) {
  const tones: Record<string, string> = {
    default: "bg-paper-sunk text-ink-soft ring-line-strong/60",
    blue: "bg-info-bg text-info ring-info/20",
    green: "bg-ok-bg text-ok ring-ok/20",
    amber: "bg-warn-bg text-warn ring-warn/25",
    red: "bg-danger-bg text-danger ring-danger/20",
    zinc: "bg-paper-sunk text-ink-faint ring-line-strong/60",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** 状态点：徽章里的状态指示，呼吸感的一粒颜色。 */
export function StatusDot({
  tone = "ok",
}: {
  tone?: "ok" | "warn" | "danger" | "info";
}) {
  const tones: Record<string, string> = {
    ok: "bg-ok",
    warn: "bg-warn",
    danger: "bg-danger",
    info: "bg-info",
  };
  return (
    <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${tones[tone]}`} />
  );
}

/** 空状态：虚线框改成暖纸下沉块，安静但不穷酸。 */
export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-[14px] border border-dashed border-line-strong bg-paper-sunk px-6 py-16 text-center text-sm text-ink-faint">
      {message}
    </div>
  );
}
