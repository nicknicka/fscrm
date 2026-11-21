/**
 * OAuth 与回跳地址共用的路径校验。
 *
 * 只允许站内相对路径：不接受协议、协议相对地址、反斜杠或控制字符。
 * 这样浏览器或 URL 解析器也不会把值规范化成外部地址，造成开放重定向。
 */

/** 供 URL 解析使用的固定同源基准。 */
const REDIRECT_BASE = "https://crm.invalid";

/** 返回规范化后的站内路径；不安全的值返回 null。 */
export function normalizeSafeRedirectPath(
  value: string | null | undefined
): string | null {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return null;
  }

  try {
    const parsed = new URL(value, REDIRECT_BASE);
    if (parsed.origin !== REDIRECT_BASE) {
      return null;
    }
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return null;
  }
}

/** 值是否是可以直接回跳的站内相对路径。 */
export function isSafeRedirectPath(
  value: string | null | undefined
): boolean {
  return normalizeSafeRedirectPath(value) !== null;
}
