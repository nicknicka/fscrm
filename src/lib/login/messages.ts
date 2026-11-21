/**
 * 登录页错误码到用户可见提示的映射。
 *
 * 飞书登录回调失败时会带 `?error=<code>` 回到登录页。错误码来自回调路由，
 * 页面只负责把它翻译成用户看得懂的标题与说明；集中在这里，便于逐个错误码
 * 验证提示文案，而不必render整个页面。
 */
export type LoginErrorCode =
  | "unbound"
  | "denied"
  | "cancelled"
  | "invalid_state"
  | "auth_failed"
  | "config_missing";

export type LoginMessage = { title: string; detail: string };

export const loginMessages: Record<LoginErrorCode, LoginMessage> = {
  unbound: {
    title: "尚未绑定 CRM 负责人",
    detail: "当前飞书账号尚未绑定到 CRM 负责人，请联系管理员完成绑定后再登录。",
  },
  denied: {
    title: "未通过飞书授权",
    detail: "飞书未授予登录所需权限，请在授权页同意所需权限后重试。",
  },
  cancelled: {
    title: "已取消飞书授权",
    detail: "你已取消本次飞书授权，可以重新发起授权继续登录。",
  },
  invalid_state: {
    title: "授权状态校验失败",
    detail: "本次授权链接已失效或校验不通过，请重新发起授权。",
  },
  auth_failed: {
    title: "飞书授权或登录失败",
    detail:
      "授权码兑换或身份校验未成功，请稍后重试；若持续失败，请联系管理员。",
  },
  config_missing: {
    title: "飞书应用或会话配置缺失",
    detail:
      "请检查飞书应用凭证、回调地址、用户授权 scope 与会话密钥配置后重试。",
  },
};

/**
 * 把 `searchParams.error` 翻译成提示；重复参数按首个处理，未知错误码返回 null。
 */
export function loginErrorMessage(
  value: string | string[] | undefined
): LoginMessage | null {
  const code = Array.isArray(value) ? value[0] : value;
  if (code && Object.hasOwn(loginMessages, code)) {
    return loginMessages[code as LoginErrorCode];
  }
  return null;
}
