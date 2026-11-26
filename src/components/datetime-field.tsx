"use client";

import { useRef, useState } from "react";

/**
 * 日期时间输入：原生 datetime-local 的占位符（mm/dd/yyyy, --:-- --）
 * 由浏览器按系统区域设置硬编码，CSS 和 lang 都改不动。
 *
 * 这里保留原生控件的可用性（选择器、键盘、移动端体验都是原生的），
 * 只在「空值且未聚焦」时叠一层中文占位，聚焦后立刻让位给原生控件。
 */
export function DateTimeField({
  name,
  label,
  className,
  defaultValue,
}: {
  name: string;
  label: string;
  className?: string;
  defaultValue?: string;
}) {
  const [filled, setFilled] = useState(Boolean(defaultValue));
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const showPlaceholder = !filled && !focused;

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="datetime-local"
        name={name}
        defaultValue={defaultValue}
        aria-label={label}
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          setFocused(false);
          setFilled(Boolean(event.currentTarget.value));
        }}
        className={className}
      />
      {showPlaceholder && (
        <span
          aria-hidden
          onClick={() => inputRef.current?.focus()}
          className="pointer-events-auto absolute inset-0 flex cursor-text items-center rounded-lg bg-paper-raised px-3 text-sm text-ink-faint"
        >
          选择日期时间
        </span>
      )}
    </div>
  );
}
