"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { GuideStep } from "./guide-steps";

/**
 * 引导期间关闭页面入场动效，只保留引导自身的动效。
 *
 * 入场动画以 opacity: 0 开始，不能在这里暂停：跨页导航时会渲染出新内容，
 * 暂停会让它一直停在透明起始帧。取消动画则让内容直接呈现最终可见状态。
 */
const FROZEN_CSS = `.guide-active .page-enter,
.guide-active [data-enter],
.guide-active [data-stagger],
.guide-active .bar-grow {
  animation: none !important;
  transition: none !important;
}
.guide-active .page-enter {
  opacity: 1 !important;
  translate: none !important;
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
   * 用户已经动手（点了按钮 / 提交了表单），正在等他这一步真正生效。
   *
   * 有了它，气泡可以明确写「正在等待保存结果」，而不是看起来毫无反应。
   */
  const [waiting, setWaiting] = useState(false);
  /**
   * 动作做了但迟迟没有生效（校验没过、保存报错、数据没出现）。
   *
   * 引导这时必须停在原地，让用户看到问题；不能替他“跳过这一步”。
   */
  const [interrupted, setInterrupted] = useState(false);
  /**
   * 用户点了引导范围之外的区域。
   *
   * 只是什么都发生的话，用户会以为页面卡住了——所以要回一句「先完成这一步」。
   * 用时间戳而不是布尔值，方便连续点击时重置计时器。
   */
  const [blockedAt, setBlockedAt] = useState(0);
  /** 气泡真实高度：用于把它放在目标下方且不压住目标（步骤标题可能换行）。 */
  const [bubbleHeight, setBubbleHeight] = useState(0);
  /** 目标的完整可见外框（弹窗/卡片整体），用于让气泡与它保持距离。 */
  const [targetBox, setTargetBox] = useState<DOMRect | null>(null);
  /**
   * 气泡是否已经对准过目标。
   *
   * 首次定位前气泡在左上角占位，如果此时就带 left/top 过渡，
   * 它会从 (24,24) 一路滑到目标位置，中途正好掠过页面标题，
   * 视觉上就是「两层糊在一起」。第一次直接落位，之后才启用滑动过渡。
   */
  const [positioned, setPositioned] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);
  /**
   * `bubbleHeight` 对应的步骤序号。
   *
   * 换步骤后它还是旧值，不能拿来给新气泡定位（新标题换行会更高）。
   * 必须用 state：用 ref 的话渲染期间读到的是旧值，判断会漏。
   */
  const [measuredStep, setMeasuredStep] = useState(-1);

  // 每步换目标、或窗口尺寸变化后重新量一次气泡高度
  useEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const measure = () => {
      const height = el.offsetHeight;
      setBubbleHeight(height);
      setMeasuredStep(index);
      // 调试锚点：便于在浏览器里核对气泡实际量到的高度
      el.dataset.measuredHeight = String(height);
    };
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
     * 在目标元素上挂监听，实现「照着做才进入下一步」。
     *
     * 用捕获阶段 + `pointer-events` 不拦截：点击照常传给元素本身
     * （该跳转就跳转、该弹表单就弹表单），引导只负责在旁边“听到”这一下。
     *
     * 延迟切步骤是刻意的：如果这一步会导航到别的页面，立刻切到下一步
     * 会导致新步骤在旧页面上找元素、轮询失败后报「找不到目标」。
     * 留一小段时间让导航和渲染先发生，下一步的定位逻辑会自己等元素出现。
     *
     * 完成判定（见 guide-steps 的 `completion`）：
     * - `click`（默认）：目标元素本身被点中才算，点到表单里的输入框、
     *   隔壁的按钮都不算——否则用户刚点开下拉框，引导就跳走了；
     * - `submit`：表单真正提交；
     * - `confirm`：先点开面板，再由“完成信号出现”确认做完了；
     * - `navigate` / `leave`：页面变化 / 目标消失即完成。
     *
     * 只要步骤声明了 `signalSelector`，就一律等信号出现才推进：
     * 点一下只是“开始做”，内容真的出现了才是“做完了”。
     */
    /** 已经挂过提交监听的表单节点，避免重复挂。 */
    const onSubmitSeen = new WeakSet<HTMLFormElement>();

    const bindTarget = (el: HTMLElement) => {
      if (boundEl === el) return;
      boundEl = el;
      const mode = step.completion ?? "click";

      const advance = () => {
        if (cancelled) return;
        setWaiting(false);
        advanceTimer = window.setTimeout(() => {
          if (!cancelled) nextRef.current();
        }, 420);
      };

      /** 等某个元素出现（或消失）后推进；超时就停在原地并提示。 */
      const waitForSignal = (
        selector: string,
        wantGone: boolean,
        timeout: number,
        /** 是否推迟到提交时再取基线（见 guide-steps 的 signalBaseline）。 */
        deferBaseline = false
      ) => {
        const deadline = Date.now() + timeout;
        /**
         * 基准快照：动作发生前页面上已有的节点集合。
         *
         * 只判断“选择器有没有命中”是不够的——例如新建客户那一步，
         * 列表里本来就有客户行，一点开表单就会立刻误判为已完成。
         * 必须等到「出现了原来没有的节点」，才算这次操作真的生效。
         */
        let before = new Set<string>();

        const snapshot = () => {
          before = new Set(
            Array.from(document.querySelectorAll(selector)).map((node) =>
              (node.textContent ?? "").trim()
            )
          );
        };

        snapshot();

        /**
         * 延迟基线（deferBaseline）：用于「打开表单再保存」的步骤。
         *
         * 不在提交瞬间重取基线：Server Action 的提交是异步的，
         * 提交事件刚发出时列表还没变，若恰好已渲染出新名称，会被误当成
         * 「原来就有」，步骤就永远不推进。改用点击那一刻的基线：
         * 打开表单不会新增客户，之后出现任何不在基线里的名称，
         * 都只能是这次保存产生的。
         */
        /** 点击时的基线：此时只会包含已存在的客户。 */
        const clickBaseline = new Set(before);

        const check = () => {
          if (cancelled) return;
          const nodes = Array.from(document.querySelectorAll(selector));
          /**
           * 延迟基线模式下，以「点击时基线」为准：
           * 打开表单不会新增客户行，所以任何不在点击基线里的名称
           * 都只能是这次保存产生的。比只看提交瞬间更可靠。
           */
          const base = deferBaseline ? clickBaseline : before;
          const fresh = nodes.filter(
            (node) => !base.has((node.textContent ?? "").trim())
          );
          const found = wantGone ? nodes.length === 0 : fresh.length > 0;
          if (found) {
            advance();
            return;
          }
          if (Date.now() > deadline) {
            // 用户点了但没生效（例如校验失败、保存报错）：告诉他卡在哪
            setWaiting(false);
            setInterrupted(true);
            return;
          }
          window.setTimeout(check, 250);
        };
        window.setTimeout(check, 120);
      };

      /** 基线取好后调用：真正开始比对信号。 */
      let startSignal: (() => void) | null = null;

      /** 动作发生：进入“等待结果”状态，结果确认后再推进。 */
      const onAction = () => {
        if (cancelled) return;
        if (step.signalSelector) {
          setWaiting(true);
          const deferred = step.signalBaseline === "submit";
          startSignal = () => {
            setWaiting(true);
            waitForSignal(
              step.signalSelector as string,
              mode === "leave",
              step.signalTimeout ?? 30000,
              deferred
            );
          };
          startSignal();
          return;
        }
        advance();
      };

      if (mode === "confirm") {
        /**
         * 「打开面板 → 填完保存」两步。
         *
         * 关键：保存会触发服务端刷新，整个内容区被替换，旧节点全部脱离文档。
         * 所以判定不能依赖提交时的闭包或绑在旧节点上的监听，只能：
         *   1. 点开面板后开始等待；
         *   2. 用轮询持续读**当前文档**里的信号节点；
         *   3. 基线在提交发生时重取（signalBaseline: "submit"），
         *      之后出现基线上没有的名称才算真的保存成功。
         * 每一步都通过 document 现查，刷新多少次都能接上。
         */
        const beginWaiting = () => {
          if (cancelled) return;
          setWaiting(true);
          startSignal = () => {
            waitForSignal(
              step.signalSelector as string,
              false,
              step.signalTimeout ?? 60000,
              step.signalBaseline === "submit"
            );
          };
          startSignal();
        };
        el.addEventListener(
          "click",
          () => {
            beginWaiting();
            /**
             * 监听表单提交以重取基线。
             *
             * 每次页面刷新后表单节点都会变，所以用完一次就重新找，
             * 直到步骤推进或超时。
             */
            const watchSubmit = () => {
              if (cancelled || !active) return;
              const form = document.querySelector<HTMLFormElement>("form");
              if (form && !onSubmitSeen.has(form)) {
                const handler = () => {
                  window.setTimeout(() => startSignal?.(), 0);
                };
                onSubmitSeen.add(form);
                form.addEventListener("submit", handler, {
                  once: true,
                  capture: true,
                });
              }
              window.setTimeout(watchSubmit, 400);
            };
            watchSubmit();
          },
          { once: true, capture: true }
        );
        return;
      }

      if (mode === "submit") {
        // 表单类步骤：只认 submit，不认 click
        const target =
          el instanceof HTMLFormElement ? el : el.querySelector("form");
        if (target) {
          target.addEventListener("submit", onAction, {
            once: true,
            capture: true,
          });
        } else {
          el.addEventListener("click", onAction, { once: true, capture: true });
        }
        return;
      }

      if (mode === "navigate") {
        /**
         * `navigate`：点中之后还必须真的换了页面才算完成。
         *
         * 只等点击是不够的——列表行、卡片这类目标点击可能被浏览器拦下、
         * 或者只是聚焦/选中，URL 没变就说明“进详情”这件事没发生。
         * 用路径变化做判据，用户照做完才会推进。
         */
        const from = window.location.pathname;
        el.addEventListener(
          "click",
          () => {
            if (cancelled) return;
            setWaiting(true);
            const deadline = Date.now() + (step.signalTimeout ?? 15000);
            const check = () => {
              if (cancelled) return;
              if (window.location.pathname !== from) {
                setWaiting(false);
                advance();
                return;
              }
              if (Date.now() > deadline) {
                setWaiting(false);
                setInterrupted(true);
                return;
              }
              window.setTimeout(check, 200);
            };
            window.setTimeout(check, 250);
          },
          { once: true, capture: true }
        );
        return;
      }

      // click / leave：只认“点中目标本身或它的后代”
      el.addEventListener("click", onAction, { once: true, capture: true });
    };

    /**
     * 目标所在的最近一层「面板」外框（弹窗 / 卡片）。
     *
     * 点的是面板里的按钮，但气泡要躲开的是整块面板，
     * 否则会和面板边框贴在一起、读起来像面板的一部分。
     */
    const panelBox = (el: HTMLElement): DOMRect | null => {
      const viewportArea =
        document.documentElement.clientWidth *
        document.documentElement.clientHeight;
      const target = el.getBoundingClientRect();
      const selfArea = Math.max(target.width * target.height, 1);
      /**
       * 从目标往上找，取**最小**的那个「像面板」的容器：
       * 弹窗本身比页面内容区小得多，先命中的就是最贴近的那一层。
       */
      let best: DOMRect | null = null;
      let node: HTMLElement | null = el.parentElement;
      while (node && node !== document.body) {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        const area = rect.width * rect.height;
        const hasSurface =
          style.backgroundColor !== "rgba(0, 0, 0, 0)" ||
          style.boxShadow !== "none" ||
          parseFloat(style.borderTopWidth) > 0;
        /** 面板要明显比目标大，但不能大到几乎占满整屏（那是页面容器）。 */
        const looksLikePanel =
          hasSurface &&
          area > selfArea * 2 &&
          area < viewportArea * 0.8 &&
          rect.width <= document.documentElement.clientWidth * 0.9;
        if (looksLikePanel && (!best || area < best.width * best.height)) {
          best = rect;
        }
        node = node.parentElement;
      }
      return best;
    };

    const syncTarget = (el: HTMLElement) => {
      setRect(el.getBoundingClientRect());
      setTargetBox(panelBox(el));
    };

    /** 目标元素位置变化时（列表重排、插入新行）持续同步高亮框。 */
    let followTimer: number | null = null;
    const followTarget = (el: HTMLElement) => {
      if (followTimer !== null) window.clearInterval(followTimer);
      let current = el;
      let last = el.getBoundingClientRect();
      followTimer = window.setInterval(() => {
        if (cancelled) return;
        /**
         * 节点被替换时（服务端刷新、列表重排后 React 重建 DOM），
         * 旧节点已脱离文档，它的坐标会冻结在脱离前的位置，高亮框就停住了。
         * 这里重新查找当前目标，并把监听挂到新节点上。
         */
        if (!current.isConnected) {
          const fresh = document.querySelector<HTMLElement>(
            `[data-guide="${step.id}"]`
          );
          if (!fresh) return;
          current = fresh;
          last = fresh.getBoundingClientRect();
          syncTarget(fresh);
          bindTarget(fresh);
          return;
        }
        const now = current.getBoundingClientRect();
        if (
          Math.abs(now.top - last.top) > 1 ||
          Math.abs(now.left - last.left) > 1 ||
          Math.abs(now.height - last.height) > 1
        ) {
          last = now;
          syncTarget(current);
        }
      }, 200);
    };

    /**
     * 目标在窄屏侧边栏里时，导航是收起状态的抽屉。
     *
     * 此时目标不存在（不是真的有 bug），直接报「找不到目标」会让用户困惑。
     * 先替他打开导航菜单，再继续定位——用户看到的仍然是「点左侧菜单」这件事。
     */
    /**
     * 取当前真实可见的目标。
     *
     * 侧边栏在宽屏和移动抽屉里各渲染一份，隐藏的那份宽高为 0；
     * 直接 querySelector 会抓到隐藏副本，高亮框就缩成一个点。
     */
    const visibleTarget = (id: string) => {
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-guide="${id}"]`)
      );
      /**
       * 用「在视口里真的占了一块可见区域」判断，而不是元素自身尺寸：
       * 宽屏侧栏在移动端靠父容器的 display:none 隐藏，
       * 里面的子元素照样有宽高，只是整块被祖先藏起来了。
       */
      const isOnScreen = (node: HTMLElement) => {
        const rect = node.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return false;
        // 宽屏侧栏在移动端被祖先 display:none 隐藏，子元素仍有宽高，
        // 所以沿祖先链检查是否被隐藏
        let current: HTMLElement | null = node;
        while (current) {
          const style = getComputedStyle(current);
          if (style.display === "none" || style.visibility === "hidden") {
            return false;
          }
          current = current.parentElement;
        }
        return true;
      };
      return nodes.find(isOnScreen) ?? null;
    };

    let sidebarOpened = false;
    const ensureSidebarOpen = () => {
      // 只请求一次：轮询里反复派发会让抽屉反复重建
      if (sidebarOpened) return;
      sidebarOpened = true;
      /**
       * 用自定义事件而不是点击「☰」：引导层是 body 上的全屏遮罩，
       * 按钮被遮罩挡住，程序化 click 也不可靠。见 sidebar.tsx 的监听。
       */
      window.dispatchEvent(new Event("fscrm:open-nav"));
    };

    const locate = () => {
      if (cancelled) return;
      let el = visibleTarget(step.id);
      if (!el && step.id.startsWith("nav-")) {
        // 目标是侧边栏项但当前不可见（窄屏抽屉收起）：先展开导航
        ensureSidebarOpen();
        el = visibleTarget(step.id);
      }
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        window.setTimeout(() => {
          if (!cancelled) syncTarget(el);
        }, 320);
        setMissing(false);
        setWaiting(false);
        setInterrupted(false);
        bindTarget(el);
        /**
         * 持续跟住目标。
         *
         * 保存表单后列表会重新渲染，新的行插入到顶部，目标元素整体下移；
         * 只量一次的话高亮框会停在旧位置，框住的已经不是该点的那一行。
         * 这里在等待期间持续比对目标位置，位置变了就重新量。
         */
        followTarget(el);
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
      if (followTimer !== null) window.clearInterval(followTimer);
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

  /**
   * 气泡要避开的完整外框。
   *
   * 高亮洞只框住「该点的那个按钮」，如果按钮在一个弹窗里，
   * 气泡紧贴按钮就会和弹窗边框挤在一起，读起来像弹窗的一部分。
   * 这里取目标所在的最近一层「有背景的容器」的外框，让气泡躲开整块面板。
   */
  const obstacle = (() => {
    if (!rect) return null;
    // 用洞的外框作为下限，避免避让范围反而比目标还小
    return targetBox && targetBox.width > 0 ? targetBox : rect;
  })();

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

  /**
   * 是否允许显示气泡。
   *
   * 换步骤时 React 会把气泡重建一次（key 随步骤变化），新节点的高度在
   * 第一次测量前还是上一版的旧值。若此时就按旧高度定位，气泡会比实际更矮，
   * 直接压到目标身上。所以在量到当前这一步的真实高度之前，先不显示气泡，
   * 只在原处占位测量。
   */
  /**
   * 这一步是否必须真正做完才继续。
   *
   * 除了“点一下就到”的导航步骤，其余都要等用户把操作做完（提交、保存、
   * 结果出现）。这时气泡会说明要做什么，并且不提供“跳过这步”的快捷键，
   * 免得用户习惯性连点、跳过本该练习的动作。
   */
  const mustComplete = (step.completion ?? "click") !== "click";

  /** 气泡里的操作提示，按完成方式给出不同的说法。 */
  const hintText =
    step.completion === "confirm" || step.signalSelector
      ? "按提示操作并保存，成功后会提醒并自动进入下一步"
      : step.completion === "submit"
        ? "填完表单并点保存，成功后自动进入下一步"
        : step.completion === "navigate"
          ? "点击高亮的位置即可继续；引导期间其他区域不可点"
          : "点击高亮的位置即可继续；引导期间其他区域不可点";

  const measuredReady = bubbleHeight > 0 && measuredStep === index;

  // 量到高度前用 opacity 隐藏而不是 visibility：visibility 仍会参与布局，
  // 但 opacity 隐藏时元素保持可测量，且不会闪现在旧位置。
  let bubbleStyle: React.CSSProperties = {
    position: "fixed",
    width: bubbleWidth,
    left: 12,
    top: 12,
    opacity: measuredReady ? undefined : 0,
    pointerEvents: measuredReady ? undefined : "none",
  };
  if (hole) {
    /** 与目标（含其所在面板）保持的间距：留足呼吸感，避免贴着面板边框。 */
    const gap = 16;
    const PANEL_GAP = 28;
    // 用实测高度，而不是估算值：步骤标题换行时气泡会更高，按小值算会压到目标上。
    const measured = bubbleHeight || 218;
    const targetCenterX = hole.left + hole.width / 2;

    // 页面顶部安全区：页面标题（h1）通常落在这一带。气泡顶到顶边会与标题叠在一起，
    // 视觉上像是两层糊在一块，所以顶部至少留出这段距离。
    const SAFE_TOP = 96;
    const SAFE_EDGE = 16;

    /** 把坐标夹进可视区，任何情况下都不让气泡出界。 */
    const clampX = (x: number) =>
      Math.min(Math.max(x, 12), Math.max(viewportW - bubbleWidth - 12, 12));
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
        /**
         * 左侧目标（侧边栏里的导航项）贴视口左边，气泡只能在目标右侧找位置，
         * 横向躲不开，只能靠纵向避开：整体放到目标上方或下方，不能与目标同行，
         * 否则气泡会盖住它正在提示的那一项。
         */
        const rightOfTarget = clampX(hole.left + hole.width + gap * 2);
        /**
         * 可直接取用的纵向区间（不含目标本身）：
         * - 目标上方：从 SAFE_TOP 到目标顶边，减去间距；
         * - 目标下方：从目标底边加上间距，到视口底部。
         * 目标在侧边栏中段时上下都可能放得下，取空间更大的一侧，
         * 而不是先夹到顶部安全区——那样气泡会正好落在目标那一行上。
         */
        const aboveTop = SAFE_TOP;
        const aboveBottom = hole.top - gap;
        const belowTop = hole.top + hole.height + gap;
        const belowBottom = viewportH - SAFE_EDGE;
        const aboveRoom = aboveBottom - aboveTop;
        const belowRoom = belowBottom - belowTop;
        let top: number;
        if (aboveRoom >= measured) {
          top = aboveBottom - measured;
        } else if (belowRoom >= measured) {
          top = belowTop;
        } else {
          // 两侧都不够（很矮的窗口）：贴在空间更大的一侧，宁可压住内容也不出界
          top = aboveRoom >= belowRoom ? aboveTop : belowTop;
        }
        bubbleStyle = {
          position: "fixed",
          width: bubbleWidth,
          left: rightOfTarget,
          top,
        };
      } else {
        /**
         * 其余情况优先放目标下方；下方放不下时放上方，但同样要避开顶部安全区。
         * 目标在弹窗里时，用弹窗底部（obstacle）作为起点，保证气泡和面板拉开距离。
         */
        const anchorBottom = Math.max(
          hole.top + hole.height,
          obstacle ? obstacle.top + obstacle.height : 0
        );
        const belowTop = anchorBottom + PANEL_GAP;
        const fitsBelow = belowTop + measured + SAFE_EDGE <= viewportH;

        const anchorTop = Math.min(
          hole.top,
          obstacle ? obstacle.top : hole.top
        );
        const aboveTop = anchorTop - PANEL_GAP - measured;
        const fitsAbove = aboveTop >= 12;

        /**
         * 目标贴近右边缘时（如右上角的「新建」按钮）：
         * 气泡居中会伸到目标外侧、盖住右边内容；
         * 改为右对齐到目标右边，让它往左让开，而不是压过去。
         *
         * 另外，气泡下方如果是宽表格（列表页），居中对齐会横跨好几列、
         * 把数据遮住。这种情况改为贴右对齐，尽量只压到最右侧的操作列。
         */
        const isRightEdgeTarget = hole.left + hole.width > viewportW - 220;
        /** 目标下方是否是大面积表格：宽、且横向铺满内容区。 */
        const wideTableBelow = (() => {
          const tables = Array.from(document.querySelectorAll("main table"));
          return tables.some((table) => {
            const rect = table.getBoundingClientRect();
            return (
              rect.width > bubbleWidth * 2.2 &&
              rect.top >= hole.top + hole.height - 8 &&
              rect.width < viewportW * 0.98
            );
          });
        })();
        const leftAligned =
          isRightEdgeTarget || wideTableBelow
            ? clampX(hole.left + hole.width - bubbleWidth)
            : clampX(targetCenterX - bubbleWidth / 2);

        if (fitsBelow) {
          bubbleStyle = {
            position: "fixed",
            width: bubbleWidth,
            left: leftAligned,
            top: belowTop,
          };
        } else if (fitsAbove) {
          // 下方被面板占满：整块挪到面板上方，避免把气泡挤出视口
          bubbleStyle = {
            position: "fixed",
            width: bubbleWidth,
            left: leftAligned,
            top: aboveTop,
          };
        } else {
          /**
           * 上下都放不下：面板很高（例如占满屏幕的表单弹窗）。
           * 改放面板右侧；右侧不够时再放到左侧。横向永远比纵向更宽松。
           */
          const panelRight = obstacle
            ? obstacle.left + obstacle.width
            : hole.left + hole.width;
          const panelLeft = obstacle ? obstacle.left : hole.left;
          const rightTop = Math.max(
            Math.min(anchorTop + 12, viewportH - measured - SAFE_EDGE),
            12
          );
          if (panelRight + PANEL_GAP + bubbleWidth + 12 <= viewportW) {
            bubbleStyle = {
              position: "fixed",
              width: bubbleWidth,
              left: panelRight + PANEL_GAP,
              top: rightTop,
            };
          } else if (panelLeft - PANEL_GAP - bubbleWidth >= 12) {
            bubbleStyle = {
              position: "fixed",
              width: bubbleWidth,
              left: panelLeft - PANEL_GAP - bubbleWidth,
              top: rightTop,
            };
          } else {
            // 真的没地方了：贴在面板底部并夹在视口内
            bubbleStyle = {
              position: "fixed",
              width: bubbleWidth,
              left: leftAligned,
              top: Math.max(Math.min(belowTop, viewportH - measured - 12), 12),
            };
          }
        }
      }
    }
  }

  /**
   * 箭头朝向：气泡整体在目标右侧时箭头指左（◀），否则指右（▶）。
   * 由气泡最终位置推导，保证箭头始终指向它在提示的目标。
   */
  const arrowGlyph =
    hole && (bubbleStyle.left as number) >= hole.left + hole.width - 4
      ? "◀"
      : "▶";

  return createPortal(
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
          {/*
           * 四块遮罩围出高亮洞。遮罩用 80% 深墨：只比页面暗一点的话，
           * 目标淹没在灰雾里，用户根本看不出「这里该点」。
           */}
          <div
            role="presentation"
            onClick={blockOutsideClick}
            className="pointer-events-auto fixed inset-x-0 top-0 cursor-not-allowed bg-ink-950/80 transition-[top,height,width] duration-[var(--motion-base)] ease-[var(--ease-out-expo)]"
            style={{ height: hole.top }}
          />
          <div
            role="presentation"
            onClick={blockOutsideClick}
            className="pointer-events-auto fixed inset-x-0 bottom-0 cursor-not-allowed bg-ink-950/80 transition-[top,height,width] duration-[var(--motion-base)] ease-[var(--ease-out-expo)]"
            style={{ top: hole.top + hole.height }}
          />
          <div
            role="presentation"
            onClick={blockOutsideClick}
            className="pointer-events-auto fixed left-0 cursor-not-allowed bg-ink-950/80 transition-[top,height,width] duration-[var(--motion-base)] ease-[var(--ease-out-expo)]"
            style={{ top: hole.top, height: hole.height, width: hole.left }}
          />
          <div
            role="presentation"
            onClick={blockOutsideClick}
            className="pointer-events-auto fixed right-0 cursor-not-allowed bg-ink-950/80 transition-[top,height,width] duration-[var(--motion-base)] ease-[var(--ease-out-expo)]"
            style={{
              top: hole.top,
              height: hole.height,
              width: Math.max(viewportW - hole.left - hole.width, 0),
            }}
          />

          {/*
           * 高亮框：金色粗描边 + 光晕 + 呼吸光圈。
           *
           * 遮罩只负责压暗四周，目标本身要靠这层「亮起来」：
           * 2px 描边在深色底上不够显眼，实际用了 3px 外描边加外发光，
           * 并且在滑块 / 导航项这类小目标上也能一眼看到。
           */}
          <div
            className="guide-highlight pointer-events-none fixed rounded-xl transition-[top,left,width,height] duration-[var(--motion-base)] ease-[var(--ease-out-expo)]"
            style={{
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
            }}
          >
            <span className="guide-pulse absolute -inset-1 rounded-xl" />
          </div>

          {/*
            指向目标的箭头：贴着目标、朝向目标。
            朝向由气泡最终位置推导（见 arrowGlyph），
            避免出现箭头指向遮罩层、或被视口右缘切掉的情况。
          */}
          <div
            aria-hidden="true"
            className="guide-pointer pointer-events-none fixed z-[1] text-2xl font-bold text-brass-400"
            style={{
              top: Math.max(
                Math.min(hole.top + hole.height / 2 - 16, viewportH - 34),
                8
              ),
              /*
               * 箭头贴着目标外侧放，但必须完整落在视口内：
               * 目标本来就贴右缘时（例如右上角的新建按钮），
               * 再往外放就会落到遮罩上、指向空白。此时改为压在目标内侧。
               */
              left: (() => {
                const ARROW_W = 22;
                const outside = hole.left + hole.width + 4;
                return outside + ARROW_W <= viewportW - 6
                  ? outside
                  : Math.max(hole.left + hole.width - ARROW_W - 4, 8);
              })(),
            }}
          >
            {arrowGlyph}
          </div>
        </>
      ) : (
        // 还没定位到目标时整屏拦截，避免用户在定位完成前乱点
        <div
          role="presentation"
          onClick={blockOutsideClick}
          className="pointer-events-auto fixed inset-0 cursor-not-allowed bg-ink-950/60"
        />
      )}

      {/* 说明气泡：key 随步骤变化，换步时重建节点，避免沿用上一步的高度 */}
      <div
        key={step.id}
        ref={bubbleRef}
        style={bubbleStyle}
        className={`guide-bubble pointer-events-auto rounded-2xl bg-paper-raised p-5 shadow-2xl ring-1 ring-line ${
          positioned ? "" : "guide-bubble-static"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-brass-100 px-2.5 py-0.5 text-xs font-medium text-brass-600">
            第 {index + 1} / {steps.length} 步
          </span>
          <button
            type="button"
            onClick={finish}
            className="text-xs text-ink-faint hover:text-ink"
            aria-label="关闭引导"
          >
            跳过
          </button>
        </div>

        <h3 className="mt-3 text-base font-semibold text-ink">{step.title}</h3>
        <p className="mt-1.5 text-sm leading-6 text-ink-soft">{step.body}</p>

        {/*
          主交互是「照高亮处做」。同时说明：引导期间点别处不会生效，
          想退出只能点「跳过」或按 Esc——否则用户会以为页面卡了。
          「做完才推进」的步骤要把预期写出来，否则用户点了没反应会以为坏了。
        */}
        {!missing && !waiting && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-brass-600">
            <span aria-hidden="true">👆</span>
            <span>{hintText}</span>
          </p>
        )}

        {/* 用户已经动手，正在等结果：明确告诉他没卡住 */}
        {waiting && (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-brass-50 px-3 py-2 text-xs text-brass-600">
            <span aria-hidden="true" className="guide-spinner inline-block" />
            <span>
              正在等待这一步完成：请按提示操作并保存，成功后会自动进入下一步。
            </span>
          </p>
        )}

        {/* 点了引导之外的区域：明确告诉用户为什么没反应 */}
        {blockedAt > 0 && (
          <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">
            <span aria-hidden="true">⛔</span>
            请先完成这一步：按提示操作高亮区域继续，或点「跳过」退出引导
          </p>
        )}

        {/* 动作做了但没生效：停在原地，避免用户以为已经完成 */}
        {interrupted && (
          <p className="mt-2 rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">
            还没有检测到完成结果：请检查表单是否填完、是否点了保存。
            确认后可以重试，或点「跳过这步」继续。
          </p>
        )}

        {missing && (
          <p className="mt-2 rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">
            当前页面上没有找到目标元素（可能需要先有数据），可以点「下一步」继续。
          </p>
        )}

        {/* 进度条 */}
        <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-paper-sunk">
          <div
            className="h-full rounded-full bg-brass-500 transition-[width] duration-[var(--motion-slow)] ease-[var(--ease-out-expo)]"
            style={{ width: `${((index + 1) / steps.length) * 100}%` }}
          />
        </div>

        {/* 底部操作行：窄气泡下允许换行，避免「上一步 / 提示语 / 下一步」挤破 320px 的卡片 */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={prev}
            disabled={index === 0}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:bg-paper-sunk disabled:cursor-not-allowed disabled:text-line-strong"
          >
            上一步
          </button>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-ink-faint sm:inline">
              {mustComplete
                ? "完成本步后自动继续 · Esc 退出"
                : "方向键切换 · Esc 退出"}
            </span>
            <button
              type="button"
              onClick={next}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-brass-600 transition-colors hover:bg-brass-50"
            >
              {mustComplete
                ? "跳过这步 →"
                : index + 1 === steps.length
                  ? "完成"
                  : "下一步 →"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
