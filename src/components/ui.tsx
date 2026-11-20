import type { ReactNode } from "react";

/** 页面标题区。 */
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
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-zinc-500">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/** 状态徽章，按 tone 显示不同颜色。 */
export function Badge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "blue" | "green" | "amber" | "red" | "zinc";
}) {
  const tones: Record<string, string> = {
    default: "bg-zinc-100 text-zinc-700",
    blue: "bg-blue-50 text-blue-700",
    green: "bg-green-50 text-green-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    zinc: "bg-zinc-100 text-zinc-600",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** 空状态提示。 */
export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center text-sm text-zinc-500">
      {message}
    </div>
  );
}
