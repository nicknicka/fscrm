"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { lastNavigationDirection } from "./nav-link";

/**
 * 页面内容的进出场。
 *
 * 页面数据在服务端取，导航时新内容要等一会儿才回来；这段空档里页面是不动的，
 * 换页那一刻又整屏硬切，整体就读作"卡一下，然后闪一下"。
 *
 * 这里做三件事把两段接起来：
 *   1. 路由一变，立刻把新内容以"从进入方向偏移 12px + 透明"的起点挂上去；
 *   2. 下一帧解除，由 CSS 过渡推到终态 —— 新内容滑入落定；
 *   3. 方向来自点击时记录的结果：深入层级从右侧进入，返回从左侧进入。
 *
 * 为什么不用 View Transitions：本项目的路由数据在导航后才返回，浏览器在
 * 点击那一刻拍到的"旧画面"和稍后拍到的"新画面"之间没有稳定的中间态，
 * 实测 startViewTransition 在各种挂载方式下都拿不到可用的帧（详见提交说明）。
 * 直接对内容做 CSS 过渡既没有这个时序问题，也不阻塞导航。
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  const lastPath = useRef(pathname);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;

    const el = ref.current;
    if (!el) return;

    const startClass =
      lastNavigationDirection() === "forward"
        ? "is-from-right"
        : "is-from-left";

    // 先关掉过渡：写起点时不能有过渡，否则起点本身会被补间掉
    el.style.transition = "none";
    el.classList.add(startClass);
    void el.offsetWidth; // 强制一次样式计算，起点就此落定
    // 再打开过渡、下一帧解除起点，于是"起点 → 终态"被补间一次
    el.style.transition = "";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ref.current?.classList.remove(startClass);
      });
    });
  }, [pathname]);

  return (
    <div ref={ref} className="page-enter">
      {children}
    </div>
  );
}
