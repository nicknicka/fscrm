import type { ReactNode } from "react";
import { Suspense } from "react";

/**
 * 打印页布局：不渲染侧边栏，只声明该子树为请求时渲染。
 *
 * 单据打印页读取登录会话与数据库，无法静态预渲染。用 Suspense 包裹子树，
 * 与 dashboard 布局一致，让 Next 16 在 Partial Prerendering 下把运行时数据
 * 放进 dynamic 部分，而不是在构建期尝试静态生成。
 */
export const instant = false;

export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={<div className="p-8 text-sm text-ink-faint">加载单据…</div>}
    >
      {children}
    </Suspense>
  );
}
