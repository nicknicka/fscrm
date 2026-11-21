"use client";

/**
 * 选择后自动提交所在表单的下拉框。
 *
 * 事件处理函数只能在客户端组件里声明，因此把 `<select onChange>` 抽到这里，
 * 由服务端页面以 props 传入选项，保持服务端页面本身不携带事件处理器。
 */
export function AutoSubmitSelect({
  name,
  defaultValue,
  options,
  className,
}: {
  name: string;
  defaultValue: string;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
      className={className}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
