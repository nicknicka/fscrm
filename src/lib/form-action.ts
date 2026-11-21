/**
 * 表单 action 适配器。
 *
 * React 的表单 `action` 只接受返回 `void` 的函数，而本项目的 Server Action
 * 统一返回 `{ ok, error }` 结果（便于测试与其他调用方判定）。
 * `voidAction` 保留 action 的结果语义，只把返回值收敛成 `void` 供表单使用。
 */
export function voidAction<A extends unknown[]>(
  action: (...args: A) => Promise<unknown>
): (...args: A) => Promise<void> {
  return async (...args: A) => {
    await action(...args);
  };
}
