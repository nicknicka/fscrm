import { Suspense, type ReactNode } from "react";

type LoginErrorCode =
  | "unbound"
  | "denied"
  | "cancelled"
  | "invalid_state"
  | "auth_failed"
  | "config_missing";

const LOGIN_MESSAGES: Record<LoginErrorCode, { title: string; detail: string }> = {
  unbound: {
    title: "尚未绑定 CRM 负责人",
    detail: "当前飞书账号尚未绑定到 CRM 负责人，请联系管理员完成绑定后再登录。",
  },
  denied: {
    title: "未通过飞书授权",
    detail: "飞书未授予登录所需权限，请在授权页同意所需权限后重试。",
  },
  cancelled: {
    title: "已取消飞书授权",
    detail: "你已取消本次飞书授权，可以重新发起授权继续登录。",
  },
  invalid_state: {
    title: "授权状态校验失败",
    detail: "本次授权链接已失效或校验不通过，请重新发起授权。",
  },
  auth_failed: {
    title: "飞书授权或登录失败",
    detail: "授权码兑换或身份校验未成功，请稍后重试；若持续失败，请联系管理员。",
  },
  config_missing: {
    title: "飞书应用或会话配置缺失",
    detail: "请检查飞书应用凭证、回调地址、用户授权 scope 与会话密钥配置后重试。",
  },
};

function loginErrorMessage(value: string | string[] | undefined) {
  const code = Array.isArray(value) ? value[0] : value;
  if (code && code in LOGIN_MESSAGES) {
    return LOGIN_MESSAGES[code as LoginErrorCode];
  }
  return null;
}

function LoginCard({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
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
      </section>
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
