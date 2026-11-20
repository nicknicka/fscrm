import { exchangeCodeForToken, fetchUserProfile } from "./oauth";
import { resolveUser } from "./binding";
import type { PersonLookup } from "./binding";
import type { FeishuAuthResult, UserMatchResult } from "./types";

/**
 * 用户身份与授权的完整流程编排。
 *
 * 把「授权码换令牌 → 获取用户身份 → 匹配 CRM 用户」串成一步，
 * 供登录 / 绑定入口直接调用。
 */

/** 一次认证的完整结果：令牌与用户身份 + 匹配结果。 */
export interface AuthenticateResult {
  /** 令牌包与用户身份。 */
  auth: FeishuAuthResult;
  /** 与 CRM 用户的匹配结果。 */
  match: UserMatchResult;
}

/**
 * 用授权码完成认证并匹配用户。
 *
 * @param code 授权成功后回调地址携带的授权码
 * @param lookup CRM 人员查找接口
 * @returns 认证结果与匹配结果
 */
export async function authenticateWithCode(
  code: string,
  lookup: PersonLookup
): Promise<AuthenticateResult> {
  const token = await exchangeCodeForToken(code);
  const user = await fetchUserProfile(token.accessToken);
  const match = await resolveUser(user, lookup);

  return {
    auth: { token, user },
    match,
  };
}
