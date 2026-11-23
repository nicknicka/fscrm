"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { usePathname } from "next/navigation";

/**
 * CRM 侧边栏导航。
 *
 * 根据当前路由高亮菜单项，集中承载各业务模块的入口。
 *
 * 侧边栏本体只在客户端处理高亮；管理员入口依赖会话角色，由服务端布局传入
 * `currentUser` 后决定是否渲染，避免普通负责人仅靠隐藏样式看到入口。
 */

import type { CurrentUser } from "@/lib/auth/session";
import { NavLink } from "./nav-link";
import { pickActiveNavHref } from "./sidebar-active";
import { GuideLauncher } from "./guide/guide-launcher";
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
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "概览", icon: <DashboardIcon /> },
  {
    href: "/customers",
    label: "客户",
    icon: <CustomersIcon />,
    guide: "nav-customers",
  },
  { href: "/customers/public-pool", label: "公海", icon: <PublicPoolIcon /> },
  { href: "/leads", label: "线索", icon: <LeadsIcon /> },
  {
    href: "/opportunities",
    label: "商机",
    icon: <OpportunitiesIcon />,
    guide: "nav-opportunities",
  },
  { href: "/contracts", label: "合同", icon: <ContractsIcon /> },
  { href: "/orders", label: "订单", icon: <OrdersIcon />, guide: "nav-orders" },
  {
    href: "/funnel",
    label: "销售漏斗",
    icon: <FunnelIcon />,
    guide: "nav-funnel",
  },
  { href: "/analytics", label: "销售分析", icon: <ChartIcon /> },
  { href: "/targets", label: "业绩目标", icon: <TargetIcon /> },
  { href: "/approvals", label: "折扣审批", icon: <UsersRoleIcon /> },
  { href: "/tasks", label: "任务与日程", icon: <TaskIcon /> },
  { href: "/audit", label: "审计日志", icon: <AuditIcon /> },
  { href: "/reminders", label: "待办提醒", icon: <RemindersIcon /> },
  { href: "/settings", label: "设置", icon: <SettingsIcon /> },
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
  ...NAV_ITEMS.map((item) => item.href),
  ADMIN_NAV_HREFS.users,
];

/** 管理员专属入口，按会话角色由服务端决定是否渲染。 */
export function AdminNavItem({ active }: { active: boolean }) {
  return (
    <NavLink
      href={ADMIN_NAV_HREFS.users}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-blue-50 text-blue-700"
          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
      }`}
    >
      <UsersRoleIcon />
      用户与角色
    </NavLink>
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
      <div className="flex h-16 items-center gap-2 border-b border-zinc-200 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
          F
        </span>
        <span className="text-lg font-semibold tracking-tight">fscrm</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => {
          const active = activeHref === item.href;
          return (
            <NavLink
              key={item.href}
              href={item.href}
              data-guide={item.guide}
              onClick={onNavigate}
              className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              }`}
            >
              {item.icon}
              {item.label}
            </NavLink>
          );
        })}
        {currentUser?.role === "ADMIN" && (
          <AdminNavItem active={activeHref === ADMIN_NAV_HREFS.users} />
        )}
      </nav>

      <div className="border-t border-zinc-200 p-3">
        <GuideLauncher />
      </div>

      {userMenu ?? (
        <div className="border-t border-zinc-200 p-4 text-xs text-zinc-400">
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

  return (
    <>
      {/* 移动端顶部栏：桌面隐藏（md 以上显示固定侧栏） */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 md:hidden">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
            F
          </span>
          <span className="font-semibold">fscrm</span>
        </div>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="打开导航菜单"
          className="min-h-11 min-w-11 rounded-lg border border-zinc-300 px-3 py-2 text-zinc-700"
        >
          ☰
        </button>
      </div>

      {/* 桌面固定侧栏 */}
      <aside
        className="hidden w-56 shrink-0 flex-col border-r border-zinc-200 bg-white md:flex"
        style={{ viewTransitionName: "site-sidebar" }}
      >
        <SidebarContent
          userMenu={userMenu}
          currentUser={currentUser}
          activeHref={activeHref}
        />
      </aside>

      {/* 移动端抽屉 */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="关闭导航菜单"
              className="absolute right-3 top-4 z-10 min-h-11 min-w-11 rounded-lg px-3 text-zinc-600"
            >
              ✕
            </button>
            <SidebarContent
              userMenu={userMenu}
              currentUser={currentUser}
              activeHref={activeHref}
              onNavigate={() => setDrawerOpen(false)}
            />
          </aside>
        </div>
      )}
    </>
  );
}
