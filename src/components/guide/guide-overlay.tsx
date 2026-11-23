"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GuideStep } from "./guide-steps";

/**
 * 引导激活期间冻结页面动效的样式。
 *
 * 用 JS 动态注入 <style>，不走 Tailwind 构建链：Tailwind 4 对文件末尾的
 * 普通 CSS 规则不会原样保留，写成类选择器可能被丢弃，动态注入则必定生效。
 * 定义为模块级常量，保证引用稳定，不触发 hooks 依赖告警。
 */
const FROZEN_CSS = `.guide-active .page-enter,
.guide-active [data-enter],
.guide-active [data-stagger],
.guide-active .bar-grow {
  animation-play-state: paused !important;
  transition: none !important;
}`;

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
  /**
   * 用户点了引导范围之外的区域。
   *
   * 只是什么都发生的话，用户会以为页面卡住了——所以要回一句「先完成这一步」。
   * 用时间戳而不是布尔值，方便连续点击时重置计时器。
   */
  const [blockedAt, setBlockedAt] = useState(0);
  /** 气泡真实高度：用于把它放在目标下方且不压住目标（步骤标题可能换行）。 */
  const [bubbleHeight, setBubbleHeight] = useState(0);
  /**
   * 气泡是否已经对准过目标。
   *
   * 首次定位前气泡在左上角占位，如果此时就带 left/top 过渡，
   * 它会从 (24,24) 一路滑到目标位置，中途正好掠过页面标题，
   * 视觉上就是「两层糊在一起」。第一次直接落位，之后才启用滑动过渡。
   */
  const [positioned, setPositioned] = useState(false);
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

  // 量到位置之后才允许过渡；换步骤时不重置，保证步骤之间仍然平滑滑动
  useEffect(() => {
    if (rect && !positioned) {
      // 下一帧再启用，避免同一帧内既改位置又开过渡而失效
      const id = window.requestAnimationFrame(() => setPositioned(true));
      return () => window.cancelAnimationFrame(id);
    }
  }, [rect, positioned]);

  const step = steps[index];

  /**
   * 前进/后退/结束的定序说明：
   * 它们必须在「定位目标元素」的 effect 之前声明——那个 effect 会在
   * 目标被点击时调用 `next()`，声明顺序颠倒会让依赖数组拿到 undefined。
   */
  /** 拦截高亮区域之外的点击，并给出一次轻提示。 */
  const blockOutsideClick = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setBlockedAt(Date.now());
  }, []);

  // 提示自动消失：2 秒后回到常规状态
  useEffect(() => {
    if (!blockedAt) return;
    const id = window.setTimeout(() => setBlockedAt(0), 2000);
    return () => window.clearTimeout(id);
  }, [blockedAt]);

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

  /**
   * `next` 的稳定引用。
   *
   * 定位 effect 依赖 `next` 会导致一个隐蔽的死循环：`next` 依赖 `index`，
   * 换步时它变化 → effect 重跑 → 清理函数把「点击后延迟前进」的 timeout 清掉，
   * 于是点击目标什么也不会发生。用 ref 转一手，effect 只依赖 step 与 active。
   */
  const nextRef = useRef(next);
  useEffect(() => {
    nextRef.current = next;
  }, [next]);

  // 定位目标元素：跨页先跳转，再轮询等待元素出现
  useEffect(() => {
    if (!active || !step) return;
    let cancelled = false;
    let tries = 0;
    let boundEl: HTMLElement | null = null;
    let advanceTimer: number | null = null;

    /**
     * 在目标元素上挂监听，实现「照着做就自动进入下一步」。
     *
     * 用捕获阶段 + `pointer-events` 不拦截：点击照常传给元素本身
     * （该跳转就跳转、该弹表单就弹表单），引导只负责在旁边“听到”这一下。
     *
     * 延迟切步骤是刻意的：如果这一步会导航到别的页面，立刻切到下一步
     * 会导致新步骤在旧页面上找元素、轮询失败后报「找不到目标」。
     * 留一小段时间让导航和渲染先发生，下一步的定位逻辑会自己等元素出现。
     *
     * 两种完成方式：
     * - `navigate`（默认）：点一下目标就推进，适合导航、按钮这类点一下即达的动作；
     * - `submit`：必须等表单提交完成才推进。点到表单任意位置不算完成——
     *   否则用户刚点开下拉框、还没填内容，引导就跳走了，操作被打断。
     */
    const bindTarget = (el: HTMLElement) => {
      if (boundEl === el) return;
      boundEl = el;

      const advance = () => {
        if (cancelled) return;
        advanceTimer = window.setTimeout(() => {
          if (!cancelled) nextRef.current();
        }, 420);
      };

      if (step.completion === "submit") {
        // 表单类步骤：只认 submit，不认 click
        // 目标本身是 form，监听它的提交事件
        if (el instanceof HTMLFormElement) {
          el.addEventListener("submit", advance, {
            once: true,
            capture: true,
          });
        } else {
          // 目标不是 form 元素（可能内部嵌了 form），退一步找子 form
          const innerForm = el.querySelector<HTMLFormElement>("form");
          if (innerForm) {
            innerForm.addEventListener("submit", advance, {
              once: true,
              capture: true,
            });
          } else {
            // 找不到表单，退回 click，避免引导卡死
            el.addEventListener("click", advance, {
              once: true,
              capture: true,
            });
          }
        }
        return;
      }

      // 默认：点一下就推进
      el.addEventListener("click", advance, { once: true, capture: true });
    };

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
        bindTarget(el);
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
      if (advanceTimer !== null) window.clearTimeout(advanceTimer);
    };
  }, [active, step, router]);

  // 尺寸变化时重算位置
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

    // 页面被嵌在 iframe / IDE 预览 / 分屏容器里时，容器自身尺寸变化不会触发
    // window 的 resize，只能靠观察文档根元素来感知。否则拖一下分屏，
    // 高亮框和气泡就会停在旧位置，看起来像错位或重叠。
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(onResize);
      observer.observe(document.documentElement);
    }

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      observer?.disconnect();
    };
  }, [active, step]);

  // 引导激活时冻结页面动效。
  //
  // 引导是模态层，它自己有脉冲与气泡落位。页面上的入场动画（page-enter、
  // data-enter、bar-grow 等）此时仍在跑，多层动效叠在一起，读作"两层都在动"
  // 的混乱。冻结后引导是唯一在动的元素，优先级自然清晰。
  //
  useEffect(() => {
    if (!active) return;
    document.body.classList.add("guide-active");
    const style = document.createElement("style");
    style.id = "guide-animation-freeze";
    style.textContent = FROZEN_CSS;
    document.head.appendChild(style);
    return () => {
      document.body.classList.remove("guide-active");
      style.remove();
    };
  }, [active]);

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

  /**
   * 可视区域尺寸。
   *
   * 不用 `window.innerWidth/innerHeight`：页面被嵌在 iframe、IDE 内置预览或
   * 分屏容器里时，窗口尺寸远大于实际可见区域，按窗口算会把气泡放到看不见的地方。
   * 用文档根元素的客户区尺寸，才是「用户真正能看见的那块」。
   */
  const viewportW = document.documentElement.clientWidth || window.innerWidth;
  const viewportH = document.documentElement.clientHeight || window.innerHeight;

  // 窄容器（嵌入预览、分屏）时没有空间「绕开目标」，气泡改为贴底横跨全宽
  const isNarrow = viewportW < 720;
  const bubbleWidth = isNarrow ? viewportW - 24 : 320;

  let bubbleStyle: React.CSSProperties = {
    position: "fixed",
    width: bubbleWidth,
    left: 12,
    top: 12,
  };
  if (hole) {
    const gap = 16;
    // 用实测高度，而不是估算值：步骤标题换行时气泡会更高，按小值算会压到目标上。
    // 首次渲染还没量到高度时用 218 作为下限占位，量到后自动重算。
    const measured = bubbleHeight || 218;
    const targetCenterX = hole.left + hole.width / 2;
    const targetCenterY = hole.top + hole.height / 2;

    // 页面顶部安全区：页面标题（h1）通常落在这一带。气泡顶到顶边会与标题叠在一起，
    // 视觉上像是两层糊在一块，所以顶部至少留出这段距离。
    const SAFE_TOP = 96;
    const SAFE_EDGE = 16;

    /** 把坐标夹进可视区，任何情况下都不让气泡出界。 */
    const clampX = (x: number) =>
      Math.min(Math.max(x, 12), Math.max(viewportW - bubbleWidth - 12, 12));
    const clampY = (y: number) =>
      Math.min(
        Math.max(y, SAFE_TOP),
        Math.max(viewportH - measured - 12, SAFE_TOP)
      );

    if (isNarrow) {
      /**
       * 窄容器：气泡贴底、横跨全宽。此时「躲开目标」没有意义——
       * 内容区本身就没剩下多少空间，绕开只会和内容叠在一起。
       *
       * 底部留 64px：页面左下角常有浮动按钮（操作指南、调试工具等），
       * 贴着最底边会被它们压住「上一步」。
       */
      bubbleStyle = {
        position: "fixed",
        width: bubbleWidth,
        left: 12,
        bottom: 64,
        top: undefined,
      };
    } else {
      // 目标在左侧（如侧边栏导航）时，气泡放右侧并尽量与目标垂直居中
      const isLeftTarget = targetCenterX < viewportW * 0.35;
      if (isLeftTarget) {
        bubbleStyle = {
          position: "fixed",
          width: bubbleWidth,
          left: clampX(hole.left + hole.width + gap * 2),
          top: clampY(targetCenterY - measured / 2),
        };
      } else {
        // 其余情况优先放目标下方；下方放不下时放上方，但同样要避开顶部安全区。
        const below = hole.top + hole.height + gap;
        const fitsBelow = below + measured + SAFE_EDGE < viewportH;
        /**
         * 目标贴近右边缘时（如右上角的「新建」按钮），
         * 气泡居中会伸到目标外侧、盖住右边内容；
         * 改为右对齐到目标右边，让它往左让开，而不是压过去。
         */
        const isRightEdgeTarget = hole.left + hole.width > viewportW - 220;
        const leftAligned = isRightEdgeTarget
          ? clampX(hole.left + hole.width - bubbleWidth)
          : clampX(targetCenterX - bubbleWidth / 2);
        if (fitsBelow) {
          bubbleStyle = {
            position: "fixed",
            width: bubbleWidth,
            left: leftAligned,
            top: clampY(below),
          };
        } else {
          // 上方空间是否够（同时不侵入标题区）
          const above = hole.top - gap - measured;
          bubbleStyle = {
            position: "fixed",
            width: bubbleWidth,
            left: leftAligned,
            // 上方也不够时退化为贴着底部，让夹取逻辑兜住
            top: clampY(
              above >= SAFE_TOP ? above : hole.top + hole.height + gap
            ),
          };
        }
      }
    }
  }

  return (
    /*
     * 根容器 pointer-events-none：它铺满全屏，若整体接收点击会把高亮洞里的
     * 真实目标挡住。拦截逻辑交给下面四块遮罩各自处理——它们只在
     * 「高亮洞之外」的区域存在，所以洞里的目标仍然点得到。
     */
    <div
      className="pointer-events-none fixed inset-0 z-[100]"
      role="dialog"
      aria-modal="true"
    >
      {/*
       * 遮罩：四块暗色区域围出高亮洞。
       *
       * 每块都接收点击并调用 blockOutsideClick：引导期间只有高亮目标和气泡
       * 可以交互，点别处一律不生效，避免用户在引导中途跳走、把状态搞乱。
       * 想退出引导必须点气泡上的「跳过」或按 Esc。
       */}
      {hole ? (
        <>
          <div
            role="presentation"
            onClick={blockOutsideClick}
            className="pointer-events-auto fixed inset-x-0 top-0 cursor-not-allowed bg-zinc-900/60 transition-[top,height,width] duration-[var(--motion-base)] ease-[var(--ease-out-expo)]"
            style={{ height: hole.top }}
          />
          <div
            role="presentation"
            onClick={blockOutsideClick}
            className="pointer-events-auto fixed inset-x-0 bottom-0 cursor-not-allowed bg-zinc-900/60 transition-[top,height,width] duration-[var(--motion-base)] ease-[var(--ease-out-expo)]"
            style={{ top: hole.top + hole.height }}
          />
          <div
            role="presentation"
            onClick={blockOutsideClick}
            className="pointer-events-auto fixed left-0 cursor-not-allowed bg-zinc-900/60 transition-[top,height,width] duration-[var(--motion-base)] ease-[var(--ease-out-expo)]"
            style={{ top: hole.top, height: hole.height, width: hole.left }}
          />
          <div
            role="presentation"
            onClick={blockOutsideClick}
            className="pointer-events-auto fixed right-0 cursor-not-allowed bg-zinc-900/60 transition-[top,height,width] duration-[var(--motion-base)] ease-[var(--ease-out-expo)]"
            style={{
              top: hole.top,
              height: hole.height,
              width: Math.max(viewportW - hole.left - hole.width, 0),
            }}
          />
          {/* 高亮描边 + 脉冲光圈：只做视觉，不能拦截点击 */}
          <div
            className="pointer-events-none fixed rounded-xl ring-2 ring-blue-400 transition-[top,left,width,height] duration-[var(--motion-base)] ease-[var(--ease-out-expo)]"
            style={{
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
            }}
          >
            <span className="guide-pulse absolute -inset-1 rounded-xl" />
          </div>
        </>
      ) : (
        // 还没定位到目标时整屏拦截，避免用户在定位完成前乱点
        <div
          role="presentation"
          onClick={blockOutsideClick}
          className="pointer-events-auto fixed inset-0 cursor-not-allowed bg-zinc-900/60"
        />
      )}

      {/* 说明气泡 */}
      <div
        ref={bubbleRef}
        style={bubbleStyle}
        className={`guide-bubble pointer-events-auto rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-zinc-200 ${
          positioned ? "" : "guide-bubble-static"
        }`}
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

        {/*
          主交互是「点高亮的目标」。同时说明：引导期间点别处不会生效，
          想退出只能点「跳过」或按 Esc——否则用户会以为页面卡了。
        */}
        {!missing && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-blue-700">
            <span aria-hidden="true">👆</span>
            <span>
              直接点击高亮处即可继续；引导期间其他区域不可点，
              想退出请点「跳过」或按 Esc
            </span>
          </p>
        )}

        {/* 点了引导之外的区域：明确告诉用户为什么没反应 */}
        {blockedAt > 0 && (
          <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <span aria-hidden="true">⛔</span>
            请先完成这一步：点击高亮区域继续，或点「跳过」退出引导
          </p>
        )}

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

        {/* 底部操作行：窄气泡下允许换行，避免「上一步 / 提示语 / 下一步」挤破 320px 的卡片 */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={prev}
            disabled={index === 0}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-300"
          >
            上一步
          </button>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-zinc-400 sm:inline">
              方向键切换 · Esc 退出
            </span>
            <button
              type="button"
              onClick={next}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50"
            >
              {index + 1 === steps.length ? "完成" : "跳过这步 →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
