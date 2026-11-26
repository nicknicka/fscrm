"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "fscrm:theme";

type Theme = "light" | "dark";

function readInitialTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    /* 隐私模式下忽略 */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * 亮 / 暗主题切换。
 *
 * 状态写在 <html data-theme> 上，globals.css 的令牌据此换值；
 * 切换瞬间给 <html> 挂一次 theme-animating，让颜色平滑过渡，
 * 动画令牌只播一次——之后的悬停等交互不再带着颜色过渡，避免迟滞感。
 * 选择持久化在 localStorage，首屏由内联脚本（layout.tsx）读出，
 * 避免深色用户先看到一帧白闪。
 */
export function ThemeToggle() {
  /*
   * 初始值走惰性初始化：服务端与首帧都渲染 light，挂载后如果真实主题不同，
   * 由 effect 里的 matchMedia 订阅一次性纠正。这样 setState 不在 effect
   * 体里同步触发，不会级联重渲染（react-hooks/set-state-in-effect）。
   */
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const initial = readInitialTheme();
      setTheme(initial);
      document.documentElement.dataset.theme = initial;
      setMounted(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    const root = document.documentElement;
    root.classList.add("theme-animating");
    root.dataset.theme = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* 隐私模式下忽略 */
    }
    window.setTimeout(() => root.classList.remove("theme-animating"), 300);
  }

  const dark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "切换到亮色主题" : "切换到暗色主题"}
      aria-pressed={dark}
      title={dark ? "切换到亮色" : "切换到暗色"}
      className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/55 transition-colors hover:bg-paper-raised/[0.06] hover:text-white/90"
    >
      <span
        aria-hidden
        className="relative flex h-5 w-9 items-center rounded-full bg-paper-raised/10 px-0.5 ring-1 ring-inset ring-white/15"
      >
        <span
          className={`h-4 w-4 rounded-full bg-brass-400 shadow-[0_1px_3px_rgb(0_0_0/0.5)] transition-transform duration-[var(--motion-base)] ease-[var(--ease-spring)] ${
            mounted && dark ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
      {mounted && dark ? "亮色模式" : "暗色模式"}
    </button>
  );
}
