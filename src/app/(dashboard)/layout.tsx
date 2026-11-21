import type { ReactNode } from "react";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { Sidebar } from "@/components/sidebar";
import { UserMenu } from "@/components/user-menu";

/**
 * 业务页面的统一布局：左侧导航 + 右侧内容区。
 *
 * 这些页面读取数据库与路由参数，属于请求时数据，无法静态预渲染，
 * 因此设置 `instant = false` 允许阻塞式渲染。
 */
export const instant = false;

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen">
      <Suspense
        fallback={
          <div className="w-56 shrink-0 border-r border-zinc-200 bg-white" />
        }
      >
        <Sidebar userMenu={<UserMenu />} currentUser={currentUser} />
      </Suspense>
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
