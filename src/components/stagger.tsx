"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

/**
 * 首屏入场的唯一开关。
 *
 * 只在页面首次挂载时返回 true，一小段时间后自动转 false 且不再回头 ——
 * 因此入场动画只播一次，之后的重渲染（筛选、提交、刷新）不会再触发。
 *
 * 为什么不在客户端页面切换时重播：导航时 React 会给页面套上 View Transition
 * 快照，过渡结束会中止节点上的 CSS 动画；若入场动画的起始帧是 opacity:0 且带
 * fill，内容就会永久停在不可见状态（实测可复现）。所以分工是：
 * 首屏加载入场，页面切换交给 View Transition 的淡入与滑动。
 */
function useFirstMount(holdMs: number) {
  const [fresh, setFresh] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => setFresh(false), holdMs);
    return () => window.clearTimeout(id);
  }, [holdMs]);
  return fresh;
}

/** 单块内容入场：页头、指标组、表格容器、说明区块。 */
export function Enter({
  children,
  effect = "rise",
  className,
}: {
  children: ReactNode;
  /** rise：上移落入；fade：原地轻落位。 */
  effect?: "rise" | "fade";
  className?: string;
}) {
  const fresh = useFirstMount(800);
  return (
    <div data-enter={fresh ? effect : undefined} className={className}>
      {children}
    </div>
  );
}

/**
 * 列表容器的逐项入场。
 *
 * `as` 用于保持语义标签（ul / div）；表格请不要用它包 tbody ——
 * tbody 内只能有 tr，而逐行动画需要一层包裹元素，所以表格用 `<Enter>` 整体落位。
 */
export function Stagger({
  children,
  as: Tag = "div",
  className,
}: {
  children: ReactNode;
  as?: "div" | "ul";
  className?: string;
}) {
  const fresh = useFirstMount(900);
  return (
    <Tag data-stagger={fresh ? "" : undefined} className={className}>
      {children}
    </Tag>
  );
}

/** 列表中的单项；`index` 只用于算入场延迟。 */
export function StaggerItem({
  index,
  children,
  className,
}: {
  index: number;
  children: ReactNode;
  className?: string;
}) {
  const style = { "--i": index } as CSSProperties;
  return (
    <div style={style} className={className}>
      {children}
    </div>
  );
}
