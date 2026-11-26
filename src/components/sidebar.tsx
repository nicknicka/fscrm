"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * CRM 侧边栏导航。
 *
 * 设计：墨玉深色导航是整页的空间锚。内容区是暖白纸面，导航是一块压住的
 * 深色缎面——选中态不用色块，用一条左侧金色短线（nav-mark）加文字提亮，
 * 像编辑页边的批注记号。未选中项降到次级明度，悬停才回亮。
 *
 * 侧边栏本体只在客户端处理高亮；管理员入口依赖会话角色，由服务端布局传入
 * `currentUser` 后决定是否渲染，避免普通负责人仅靠隐藏样式看到入口。
 */

import type { CurrentUser } from "@/lib/auth/session";
import { NavLink } from "./nav-link";
import { pickActiveNavHref } from "./sidebar-active";
import { GuideLauncher } from "./guide/guide-launcher";
import { ThemeToggle } from "./theme-toggle";
import {
  AuditIcon,
  ChartIcon,
  ContractsIcon,
  CustomersIcon,
  DashboardIcon,
  FunnelIcon,
  LeadsIcon,
  OpportunitiesIcon,
  OrdersIcon,
  PublicPoolIcon,
  RemindersIcon,
  SettingsIcon,
  TaskIcon,
  TargetIcon,
  UsersRoleIcon,
} from "./icons";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  /** 供操作引导定位的锚点。 */
  guide?: string;
  /** 括注：一句话点明这个板块在业务链条上的位置，消解同类板块的歧义。 */
  note?: string;
}

/** 导航按业务动线分组：概览 → 开拓 → 成交 → 复盘 → 管理。 */
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "",
    items: [{ href: "/", label: "概览", icon: <DashboardIcon /> }],
  },
  {
    title: "开拓",
    items: [
      {
        href: "/customers",
        label: "客户",
        icon: <CustomersIcon />,
        guide: "nav-customers",
      },
      {
        href: "/customers/public-pool",
        label: "公海",
        icon: <PublicPoolIcon />,
      },
      {
        href: "/leads",
        label: "线索",
        icon: <LeadsIcon />,
        note: "未谈",
      },
      {
        href: "/opportunities",
        label: "商机",
        icon: <OpportunitiesIcon />,
        guide: "nav-opportunities",
        note: "在谈",
      },
    ],
  },
  {
    title: "成交",
    items: [
      { href: "/contracts", label: "合同", icon: <ContractsIcon /> },
      {
        href: "/orders",
        label: "订单",
        icon: <OrdersIcon />,
        guide: "nav-orders",
      },
    ],
  },
  {
    title: "复盘",
    items: [
      {
        href: "/funnel",
        label: "销售漏斗",
        icon: <FunnelIcon />,
        guide: "nav-funnel",
      },
      { href: "/analytics", label: "销售分析", icon: <ChartIcon /> },
      { href: "/targets", label: "业绩目标", icon: <TargetIcon /> },
    ],
  },
  {
    title: "管理",
    items: [
      { href: "/approvals", label: "折扣审批", icon: <UsersRoleIcon /> },
      { href: "/tasks", label: "任务与日程", icon: <TaskIcon /> },
      { href: "/audit", label: "审计日志", icon: <AuditIcon /> },
      { href: "/reminders", label: "待办提醒", icon: <RemindersIcon /> },
      { href: "/settings", label: "设置", icon: <SettingsIcon /> },
    ],
  },
];

/** 管理员专属入口的路由，按会话角色由服务端决定是否渲染。 */
const ADMIN_NAV_HREFS = { users: "/settings/users" };

/**
 * 参与选中态判定的全部入口。
 *
 * 管理员入口即使未渲染也纳入候选：命中更具体的 `/settings/users` 时，
 * 其父级「设置」不应再高亮。
 */
export const ALL_NAV_HREFS: readonly string[] = [
  ...NAV_GROUPS.flatMap((group) => group.items.map((item) => item.href)),
  ADMIN_NAV_HREFS.users,
];

function navItemClass(active: boolean) {
  return [
    "group relative flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors duration-[var(--motion-fast)]",
    active
      ? "font-semibold text-white"
      : "font-medium text-white/60 hover:bg-white/[0.06] hover:text-white/95",
  ].join(" ");
}

/** 选中标记：左侧金色短线，从中间向上下长出 */
function NavMark({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-[var(--brass-500)] transition-opacity duration-[var(--motion-fast)] ${
        active ? "nav-mark opacity-100" : "opacity-0"
      }`}
    />
  );
}

/** 管理员专属入口，按会话角色由服务端决定是否渲染。 */
export function AdminNavItem({ active }: { active: boolean }) {
  return (
    <NavLink href={ADMIN_NAV_HREFS.users} className={navItemClass(active)}>
      <NavMark active={active} />
      <UsersRoleIcon />
      用户与角色
    </NavLink>
  );
}

/** 品牌标识：墨金方块 + 字标，深侧栏顶部 */
function Brand() {
  return (
    <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
      <span className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-brass-400 to-brass-600 text-[13px] font-bold text-ink-950 shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_2px_6px_-1px_rgb(0_0_0/0.5)]">
        F
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-tight text-white">
          fscrm
        </span>
        <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-white/40">
          Feishu Suite
        </span>
      </span>
    </div>
  );
}

/** 侧栏内部的导航内容（logo + 链接 + 引导 + 用户菜单），桌面与移动抽屉共用。 */
function SidebarContent({
  userMenu,
  currentUser,
  activeHref,
  onNavigate,
}: {
  userMenu?: ReactNode;
  currentUser?: CurrentUser | null;
  activeHref: string | null;
  onNavigate?: () => void;
}) {
  return (
    <>
      <Brand />

      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain px-3 pb-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.title || "root"} className="mt-1 first:mt-0">
            {group.title && (
              <div className="mb-1.5 mt-4 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
                {group.title}
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = activeHref === item.href;
                return (
                  <NavLink
                    key={item.href}
                    href={item.href}
                    data-guide={item.guide}
                    onClick={onNavigate}
                    className={navItemClass(active)}
                  >
                    <NavMark active={active} />
                    {item.icon}
                    {item.label}
                    {item.note && (
                      <span
                        aria-hidden
                        className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-normal tracking-wide ${
                          active
                            ? "bg-white/15 text-white/80"
                            : "bg-white/[0.06] text-white/40"
                        }`}
                      >
                        {item.note}
                      </span>
                    )}
                  </NavLink>
                );
              })}
              {group.title === "管理" && currentUser?.role === "ADMIN" && (
                <AdminNavItem active={activeHref === ADMIN_NAV_HREFS.users} />
              )}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/[0.08] p-3">
        <ThemeToggle />
        <GuideLauncher />
      </div>

      {userMenu ?? (
        <div className="border-t border-white/[0.08] p-4 text-xs text-white/35">
          飞书 CRM
        </div>
      )}
    </>
  );
}

export function Sidebar({
  userMenu,
  currentUser,
}: {
  userMenu?: ReactNode;
  currentUser?: CurrentUser | null;
}) {
  const pathname = usePathname();
  const activeHref = pickActiveNavHref(pathname, ALL_NAV_HREFS);
  const [drawerOpen, setDrawerOpen] = useState(false);

  /**
   * 引导层需要打开移动端抽屉。
   *
   * 引导是挂在 body 上的全屏遮罩，它自己的遮罩会挡住顶栏的「☰」，
   * 点不动；直接派发一个自定义事件由侧边栏自己开抽屉，比模拟点击可靠。
   */
  useEffect(() => {
    const open = () => setDrawerOpen(true);
    window.addEventListener("fscrm:open-nav", open);
    return () => window.removeEventListener("fscrm:open-nav", open);
  }, []);
  const drawerRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!drawerOpen) return;

    drawerRef.current?.querySelector<HTMLElement>("button")?.focus();

    function handleTabKey(event: KeyboardEvent) {
      if (event.key !== "Tab" || !drawerRef.current) return;

      const focusables = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function handleEscapeKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeDrawer();
    }

    document.addEventListener("keydown", handleTabKey);
    document.addEventListener("keydown", handleEscapeKey);
    return () => {
      document.removeEventListener("keydown", handleTabKey);
      document.removeEventListener("keydown", handleEscapeKey);
    };
  }, [drawerOpen]);

  function openDrawer() {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    restoreFocusRef.current?.focus();
  }

  return (
    <>
      {/* 移动端顶部栏：桌面隐藏（md 以上显示固定侧栏） */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-paper-raised px-4 md:hidden">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brass-400 to-brass-600 text-[12px] font-bold text-ink-950">
            F
          </span>
          <span className="font-semibold tracking-tight">fscrm</span>
        </div>
        <button
          type="button"
          onClick={openDrawer}
          aria-label="打开导航菜单"
          className="min-h-11 min-w-11 rounded-lg border border-line-strong px-3 py-2 text-ink-soft"
        >
          ☰
        </button>
      </div>

      {/*
       * 桌面侧栏分两层：
       *   外层是整列高度的深色底——长页面滚动时左侧不会露出白缝；
       *   内层 sticky + h-screen 承载真实内容，导航中段独立滚动，
       *   品牌与「退出」始终固定可见。
       */}
      <div
        data-guide-root="desktop"
        className="hidden w-60 shrink-0 border-r border-ink-950 bg-ink-900 md:block"
        style={{ viewTransitionName: "site-sidebar" }}
      >
        <aside className="sticky top-0 flex h-screen flex-col">
          <SidebarContent
            userMenu={userMenu}
            currentUser={currentUser}
            activeHref={activeHref}
          />
        </aside>
      </div>

      {/* 移动端抽屉 */}
      {drawerOpen && (
        <div
          ref={drawerRef}
          className="fixed inset-0 z-[60] md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="导航菜单"
        >
          <div
            className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm"
            onClick={closeDrawer}
            aria-hidden="true"
          />
          <aside
            data-guide-root="drawer"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-ink-900 shadow-xl"
          >
            <button
              type="button"
              onClick={closeDrawer}
              aria-label="关闭导航菜单"
              className="absolute right-3 top-4 z-10 min-h-11 min-w-11 rounded-lg px-3 text-white/60 hover:text-white"
            >
              ✕
            </button>
            <SidebarContent
              userMenu={userMenu}
              currentUser={currentUser}
              activeHref={activeHref}
              onNavigate={closeDrawer}
            />
          </aside>
        </div>
      )}
    </>
  );
}
