"use client";

import { useRef, type ReactNode } from "react";

/**
 * 选择即提交的下拉。
 *
 * 服务端组件无法传递事件处理器，所以把「改了就提交」这层行为收进客户端组件。
 * 提交流程仍是普通 form + Server Action，没有额外状态：选中后 requestSubmit
 * 触发表单自身的 action，页面由 revalidate 刷新。
 *
 * 无 JS 时退化为原生 select + 显式的保存按钮（noscript 分支），功能不丢。
 */
export function AutoSubmitForm({
  action,
  children,
  className,
}: {
  action: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
  className?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action} className={className}>
      <div
        onChange={(event) => {
          const target = event.target as HTMLElement;
          if (target.tagName === "SELECT") formRef.current?.requestSubmit();
        }}
      >
        {children}
      </div>
    </form>
  );
}
