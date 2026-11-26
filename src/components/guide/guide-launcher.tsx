"use client";

import { useEffect, useState } from "react";
import { GuideOverlay } from "./guide-overlay";
import { ONBOARDING_STEPS } from "./guide-steps";

const STORAGE_KEY = "fscrm:guide:onboarding";

/**
 * 引导入口：侧边栏按钮 + 首次自动播放。
 *
 * 全应用只挂载一个引导实例，避免自动播放与手动播放叠加导致键盘事件重复。
 * 首次登录且未完成过时自动打开一次；用户可随时点「操作指南」重看。
 */
export function GuideLauncher() {
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let done = true;
    try {
      done = window.localStorage.getItem(STORAGE_KEY) === "done";
    } catch {
      done = true;
    }
    if (done) return;
    const timer = window.setTimeout(() => setRunning(true), 700);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setRunning(true)}
        data-guide="guide-launcher"
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white/90"
        title="播放操作指南"
      >
        <span className="text-base">◈</span>
        操作指南
      </button>

      {running && (
        <GuideOverlay
          steps={ONBOARDING_STEPS}
          storageKey={STORAGE_KEY}
          onClose={() => setRunning(false)}
        />
      )}
    </>
  );
}
