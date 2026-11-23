import { Suspense, type ReactNode } from "react";

import { LoginEntrance } from "@/components/login-entrance";
import { loginErrorMessage } from "@/lib/login/messages";

function LoginCard({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <LoginEntrance>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-base font-bold text-white">
            F
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
              fscrm
            </h1>
            <p className="text-sm text-zinc-500">飞书 CRM 登录</p>
          </div>
        </div>
        {children}
        <a
          href="/api/auth/feishu/login"
          className="mt-8 flex h-11 w-full items-center justify-center rounded-lg bg-blue-600 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
        >
          使用飞书登录
        </a>
        <p className="mt-4 text-center text-xs leading-5 text-zinc-500">
          授权后将自动返回 CRM；你可以随时退出并使用其他飞书账号重新授权。
        </p>
      </LoginEntrance>
    </main>
  );
}

async function LoginFeedback({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { error } = await searchParams;
  const message = loginErrorMessage(error);
  if (!message) {
    return null;
  }

  return (
    <div
      role="alert"
      className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <p className="font-semibold">{message.title}</p>
      <p className="mt-1 leading-6">{message.detail}</p>
    </div>
  );
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  return (
    <LoginCard>
      <Suspense fallback={null}>
        <LoginFeedback searchParams={searchParams} />
      </Suspense>
    </LoginCard>
  );
}
