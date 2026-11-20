"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * CRM 侧边栏导航。
 *
 * 根据当前路由高亮菜单项，集中承载各业务模块的入口。
 */

const NAV_ITEMS = [
  { href: "/", label: "概览", icon: "▦" },
  { href: "/customers", label: "客户", icon: "◉" },
  { href: "/leads", label: "线索", icon: "◇" },
  { href: "/opportunities", label: "商机", icon: "◆" },
  { href: "/settings", label: "设置", icon: "⚙" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-200 bg-white">
      <div className="flex h-16 items-center gap-2 border-b border-zinc-200 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
          F
        </span>
        <span className="text-lg font-semibold tracking-tight">fscrm</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-zinc-200 p-4 text-xs text-zinc-400">
        飞书 CRM
      </div>
    </aside>
  );
}
