import { Suspense, type ReactNode } from "react";

import { LoginEntrance } from "@/components/login-entrance";
import { loginErrorMessage } from "@/lib/login/messages";

/** 品牌侧的三个要点：左侧栏用一句话讲清这套系统在做什么。 */
const HIGHLIGHTS = [
  {
    title: "在飞书里说话，系统负责记住",
    body: "团队 @机器人 说一句话就落成记录，不用切换窗口。",
  },
  {
    title: "结构、规则、权限都在服务端",
    body: "流程不能乱跳、金额由条目汇总、归属边界由代码判定。",
  },
  {
    title: "卡片上的按钮直接改数据",
    body: "认领与推进都在聊天窗口里完成，网页只负责看全局。",
  },
];

/**
 * 登录页。
 *
 * 宽屏下是双栏：左侧墨玉品牌区讲清「这是什么」，右侧纸面登录卡。
 * 单栏时只留登录卡，品牌信息收进卡片上方的字标里。
 */
function BrandPanel() {
  return (
    <aside className="relative hidden w-[46%] shrink-0 flex-col justify-between overflow-hidden bg-ink-900 p-12 lg:flex xl:p-16">
      {/* 环境光与细网格：像一张压在墨玉桌面上的纸 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-1/4 h-[520px] w-[520px] rounded-full bg-brass-500/[0.09] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgb(255_255_255/0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.025)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_70%_60%_at_30%_40%,black,transparent)]"
      />

      <div className="relative flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brass-400 to-brass-600 text-base font-bold text-ink-950 shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]">
          F
        </span>
        <div className="leading-none">
          <div className="text-lg font-semibold tracking-tight text-white">
            fscrm
          </div>
          <div className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">
            Feishu Suite
          </div>
        </div>
      </div>

      <div className="relative max-w-md">
        <h1 className="text-[32px] font-semibold leading-[1.25] tracking-[-0.02em] text-white">
          销售在飞书里说话，
          <br />
          <span className="text-brass-400">CRM 负责记住与推进。</span>
        </h1>
        <ul className="mt-10 space-y-6">
          {HIGHLIGHTS.map((item) => (
            <li key={item.title} className="flex gap-3.5">
              <span
                aria-hidden
                className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brass-400"
              />
              <div>
                <div className="text-sm font-medium text-white/90">
                  {item.title}
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-white/45">
                  {item.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <p className="relative text-xs text-white/25">
        fscrm · 与飞书一体的业务系统
      </p>
    </aside>
  );
}

function LoginForm({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-screen flex-1 items-center justify-center bg-paper-sunk px-6 py-12">
      <LoginEntrance>
        {/* 单栏时（窄屏）才显示的字标：宽屏的标识已经在左侧品牌区 */}
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brass-400 to-brass-600 text-base font-bold text-ink-950">
            F
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              fscrm
            </h1>
            <p className="text-sm text-ink-faint">飞书 CRM 登录</p>
          </div>
        </div>

        {/* 宽屏时的卡内标题 */}
        <div className="mb-8 hidden lg:block">
          <h2 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">
            登录
          </h2>
          <p className="mt-1.5 text-sm text-ink-faint">
            使用飞书账号授权后进入工作台
          </p>
        </div>

        {children}

        <a
          href="/api/auth/feishu/login"
          className="mt-8 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-brass-500 to-brass-600 text-sm font-semibold text-ink-950 shadow-[0_1px_2px_rgb(28_27_22/0.18),inset_0_1px_0_rgb(255_255_255/0.28)] transition-[filter] hover:brightness-105"
        >
          使用飞书登录
        </a>

        <p className="mt-4 text-xs leading-5 text-ink-faint">
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
      className="mt-6 rounded-xl border border-warn/25 bg-warn-bg p-4 text-sm text-warn"
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
    <div className="flex min-h-screen">
      <BrandPanel />
      <LoginForm>
        <Suspense fallback={null}>
          <LoginFeedback searchParams={searchParams} />
        </Suspense>
      </LoginForm>
    </div>
  );
}
