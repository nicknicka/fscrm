"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, type ReactNode } from "react";

/** 导航方向：进入下级页面用 forward，回到上级页面用 back。 */
export type NavDirection = "forward" | "back";

/** 路由段数，用来判断层级深浅。 */
function segmentCount(pathname: string): number {
  return pathname.split("/").filter(Boolean).length;
}

/**
 * 判断一次导航的方向：变深算前进，变浅算后退，同级算前进
 * （并列模块之间是"继续往前走"，不是"退回去"）。
 */
export function navDirection(from: string, to: string): NavDirection {
  return segmentCount(to) < segmentCount(from) ? "back" : "forward";
}

/**
 * 站内链接：悬停/聚焦时预取，点击时记录导航方向。
 *
 * 过渡本身由 `PageTransition` 在路由变化后播放（见同目录 page-transition.tsx）。
 * 这里只负责两件便宜的事：
 *   1. 预取 —— 减少"点了但页面还没换"的空档，空档才是手感差的真正来源；
 *   2. 记录方向 —— 写进模块级变量，过渡据此决定水平滑动的左右。
 */
let pendingDirection: NavDirection = "forward";

/** 最近一次导航的方向，供 `PageTransition` 读取。 */
export function lastNavigationDirection() {
  return pendingDirection;
}

export function NavLink({
  href,
  children,
  className,
  ...rest
}: {
  href: string;
  children: ReactNode;
  className?: string;
} & Omit<
  React.ComponentProps<typeof Link>,
  "href" | "children" | "className"
>) {
  const router = useRouter();
  const pathname = usePathname();
  const prefetch = useCallback(() => router.prefetch(href), [router, href]);

  return (
    <Link
      href={href}
      className={className}
      prefetch={false}
      onMouseEnter={prefetch}
      onFocus={prefetch}
      onClick={() => {
        pendingDirection = navDirection(pathname, href);
      }}
      {...rest}
    >
      {children}
    </Link>
  );
}
