"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 数字滚动计数。
 *
 * 首屏入场时数字从 0 滚到目标值，读起来是"仪表盘在加载数据"，
 * 而不是一块静态文本。只在挂载后滚一次——之后的重渲染（筛选、刷新）
 * 直接显示目标值，不重复表演。
 *
 * 实现要点：
 * - requestAnimationFrame 驱动，600ms、ease-out-expo 形状（手算缓动，
 *   不引动画库）；
 * - 尊重 prefers-reduced-motion：直接显示终值，一帧都不滚；
 * - 组件不可见时不滚（IntersectionObserver 进视口才启动），
 *   避免屏幕外的数字悄悄滚完，滚到一半被看见又显得突兀。
 */
export function CountUp({
  value,
  duration = 600,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reduced || startedRef.current) {
      setDisplay(value);
      return;
    }

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || startedRef.current) return;
        startedRef.current = true;
        observer.disconnect();

        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min((now - start) / duration, 1);
          // ease-out-expo：前快后慢，落点干脆
          const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
          setDisplay(Math.round(eased * value));
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
}
