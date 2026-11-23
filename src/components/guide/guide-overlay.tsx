"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GuideStep } from "./guide-steps";

/**
 * 指引式操作引导层。
 *
 * 依次高亮页面上的目标元素，用脉冲光圈吸引注意，并在旁边浮出气泡说明。
 * 目标不存在时自动跳过该步；跨页步骤会先跳转再定位。
 * 全部步骤完成后记录完成标记，后续不再自动弹出。
 */
export function GuideOverlay({
  steps,
  storageKey = "fscrm:guide:onboarding",
  onClose,
}: {
  steps: GuideStep[];
  storageKey?: string;
  /** 引导结束时回调（完成或跳过都会触发）。 */
  onClose?: () => void;
}) {
  const router = useRouter();
  const [active, setActive] = useState(true);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [missing, setMissing] = useState(false);
  /** 气泡真实高度：用于把它放在目标下方且不压住目标（步骤标题可能换行）。 */
  const [bubbleHeight, setBubbleHeight] = useState(0);
  const bubbleRef = useRef<HTMLDivElement>(null);

  // 每步换目标、或窗口尺寸变化后重新量一次气泡高度
  useEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const measure = () => setBubbleHeight(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [index, rect]);

  const step = steps[index];

  // 定位目标元素：跨页先跳转，再轮询等待元素出现
  useEffect(() => {
    if (!active || !step) return;
    let cancelled = false;
    let tries = 0;

    const locate = () => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(
        `[data-guide="${step.id}"]`
      );
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        window.setTimeout(() => {
          if (!cancelled) setRect(el.getBoundingClientRect());
        }, 320);
        setMissing(false);
        return;
      }
      tries += 1;
      if (tries < 40) {
        window.setTimeout(locate, 150);
      } else {
        setMissing(true);
      }
    };

    if (step.path && window.location.pathname !== step.path) {
      router.push(step.path);
      window.setTimeout(locate, 350);
    } else {
      locate();
    }

    return () => {
      cancelled = true;
    };
  }, [active, step, router]);

  // 窗口尺寸变化时重算位置
  useEffect(() => {
    if (!active) return;
    const onResize = () => {
      const el = step
        ? document.querySelector<HTMLElement>(`[data-guide="${step.id}"]`)
        : null;
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [active, step]);

  const finish = useCallback(() => {
    setActive(false);
    setRect(null);
    try {
      window.localStorage.setItem(storageKey, "done");
    } catch {
      /* 忽略隐私模式下的存储失败 */
    }
    onClose?.();
  }, [storageKey, onClose]);

  const next = useCallback(() => {
    if (index + 1 >= steps.length) finish();
    else setIndex((value) => value + 1);
  }, [index, steps.length, finish]);

  const prev = useCallback(() => setIndex((v) => Math.max(0, v - 1)), []);

  // 键盘操作
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
      if (event.key === "ArrowRight" || event.key === "Enter") next();
      if (event.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finish, next, prev]);

  if (!active || !step) return null;

  const padding = 8;
  const hole = rect
    ? {
        top: Math.max(rect.top - padding, 0),
        left: Math.max(rect.left - padding, 0),
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      }
    : null;

  // 气泡位置：默认放在目标下方，空间不足则放上方
  const bubbleWidth = 320;
  let bubbleStyle: React.CSSProperties = {
    position: "fixed",
    width: bubbleWidth,
    left: 24,
    top: 24,
  };
  if (hole) {
    const gap = 16;
    // 用实测高度，而不是估算值：步骤标题换行时气泡会更高，按小值算会压到目标上。
    // 首次渲染还没量到高度时用 218 作为下限占位，量到后自动重算。
    const measured = bubbleHeight || 218;
    const targetCenterX = hole.left + hole.width / 2;
    const targetCenterY = hole.top + hole.height / 2;

    // 目标在左侧（如侧边栏导航）时，气泡放右边，避免遮挡高亮区域
    if (targetCenterX < window.innerWidth * 0.35) {
      bubbleStyle = {
        position: "fixed",
        width: bubbleWidth,
        left: Math.min(
          hole.left + hole.width + gap * 2,
          window.innerWidth - bubbleWidth - 16
        ),
        top: Math.min(
          Math.max(targetCenterY - measured / 2, 16),
          window.innerHeight - measured - 16
        ),
      };
    } else {
      // 其余情况放在目标下方，空间不足则放上方
      const below = hole.top + hole.height + gap;
      const fitsBelow = below + measured + 12 < window.innerHeight;
      const left = Math.min(
        Math.max(targetCenterX - bubbleWidth / 2, 16),
        window.innerWidth - bubbleWidth - 16
      );
      bubbleStyle = {
        position: "fixed",
        width: bubbleWidth,
        left,
        top: fitsBelow ? below : undefined,
        bottom: fitsBelow ? undefined : window.innerHeight - hole.top + gap,
      };
    }
  }

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
      {/* 遮罩：用四块暗色区域围出高亮洞，避免挡住目标本身的交互 */}
      {hole ? (
        <>
          <div
            className="pointer-events-none fixed inset-x-0 top-0 bg-zinc-900/60 transition-[top,height,width] duration-[var(--motion-base)] ease-[var(--ease-out-expo)]"
            style={{ height: hole.top }}
          />
          <div
            className="pointer-events-none fixed inset-x-0 bottom-0 bg-zinc-900/60 transition-[top,height,width] duration-[var(--motion-base)] ease-[var(--ease-out-expo)]"
            style={{ top: hole.top + hole.height }}
          />
          <div
            className="pointer-events-none fixed left-0 bg-zinc-900/60 transition-[top,height,width] duration-[var(--motion-base)] ease-[var(--ease-out-expo)]"
            style={{ top: hole.top, height: hole.height, width: hole.left }}
          />
          <div
            className="pointer-events-none fixed right-0 bg-zinc-900/60 transition-[top,height,width] duration-[var(--motion-base)] ease-[var(--ease-out-expo)]"
            style={{
              top: hole.top,
              height: hole.height,
              width: window.innerWidth - hole.left - hole.width,
            }}
          />
          {/* 高亮描边 + 脉冲光圈 */}
          <div
            className="pointer-events-none fixed rounded-xl ring-2 ring-blue-400 transition-[top,left,width,height] duration-[var(--motion-base)] ease-[var(--ease-out-expo)]"
            style={{
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0)",
            }}
          >
            <span className="guide-pulse absolute -inset-1 rounded-xl" />
          </div>
        </>
      ) : (
        <div className="fixed inset-0 bg-zinc-900/60" />
      )}

      {/* 说明气泡 */}
      <div
        ref={bubbleRef}
        style={bubbleStyle}
        className="guide-bubble rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-zinc-200"
      >
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
            第 {index + 1} / {steps.length} 步
          </span>
          <button
            type="button"
            onClick={finish}
            className="text-xs text-zinc-400 hover:text-zinc-700"
            aria-label="关闭引导"
          >
            跳过
          </button>
        </div>

        <h3 className="mt-3 text-base font-semibold text-zinc-900">
          {step.title}
        </h3>
        <p className="mt-1.5 text-sm leading-6 text-zinc-600">{step.body}</p>

        {missing && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            当前页面上没有找到目标元素（可能需要先有数据），可以点「下一步」继续。
          </p>
        )}

        {/* 进度条 */}
        <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-full rounded-full bg-blue-500 transition-[width] duration-[var(--motion-slow)] ease-[var(--ease-out-expo)]"
            style={{ width: `${((index + 1) / steps.length) * 100}%` }}
          />
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={prev}
            disabled={index === 0}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-300"
          >
            上一步
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">方向键切换 · Esc 退出</span>
            <button
              type="button"
              onClick={next}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              {index + 1 === steps.length ? "完成" : "下一步"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
