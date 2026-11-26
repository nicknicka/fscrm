"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * 登录卡片的入场。
 *
 * 登录页是唯一没有侧边栏的页面，整屏只有一张卡片，硬出现时缺少"到来"的暗示。
 * 这里让卡片从下方 8px 淡入落定，并让卡片里的元素错开 40ms 依次出现，
 * 读起来是"卡片先到、内容跟上"，而不是一块白屏突然换成另一块。
 *
 * 只播一次、且尊重系统的减弱动效偏好（见 globals.css 的 reduce 分支）。
 */
export function LoginEntrance({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <section
      className={`w-full max-w-[26rem] rounded-2xl border border-line bg-paper-raised p-9 shadow-[var(--shadow-md)] transition-[opacity,translate,scale] duration-[var(--motion-slow)] ease-[var(--ease-out-expo)] ${
        mounted ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      style={{
        translate: mounted ? "0 0" : "0 8px",
        scale: mounted ? "1" : "0.985",
      }}
    >
      {children}
    </section>
  );
}
