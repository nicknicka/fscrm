import * as lark from "@larksuiteoapi/node-sdk";
import { getFeishuClient, isFeishuConfigured } from "../client";
import type {
  AuthorizeUrlParams,
  FeishuTokenBundle,
  FeishuUserProfile,
} from "./types";

/**
 * 飞书用户授权（OAuth）模块。
 *
 * 覆盖用户授权的标准流程：构造授权 URL → 用 code 换取用户访问令牌 →
 * 获取用户身份 → 令牌过期时刷新。
 */

/** 默认开放平台授权页域名。 */
const DEFAULT_AUTHORIZE_DOMAIN = "https://open.feishu.cn";

/**
 * 构造飞书用户授权 URL。
 *
 * 用户在飞书内打开该链接完成授权，授权成功后会跳转到 `redirectUri` 并携带 `code`。
 *
 * @param params 授权 URL 参数
 * @returns 可直接发给用户的授权链接
 */
export function buildAuthorizeUrl(params: AuthorizeUrlParams): string {
  const domain = params.domain ?? DEFAULT_AUTHORIZE_DOMAIN;
  const search = new URLSearchParams({
    app_id: params.appId,
    redirect_uri: params.redirectUri,
  });
  if (params.scope) {
    search.set("scope", params.scope);
  }
  if (params.state) {
    search.set("state", params.state);
  }
  return `${domain}/open-apis/authen/v1/index?${search.toString()}`;
}

/** 从令牌接口响应中提取令牌包。 */
function toTokenBundle(data: {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_expires_in?: number;
}): FeishuTokenBundle {
  return {
    accessToken: data.access_token ?? "",
    refreshToken: data.refresh_token,
    tokenType: data.token_type,
    expiresIn: data.expires_in,
    refreshExpiresIn: data.refresh_expires_in,
  };
}

/** 从用户信息响应中提取用户身份。 */
function toUserProfile(data: {
  open_id?: string;
  union_id?: string;
  user_id?: string;
  name?: string;
  email?: string;
  enterprise_email?: string;
  mobile?: string;
  avatar_url?: string;
}): FeishuUserProfile {
  return {
    openId: data.open_id ?? "",
    unionId: data.union_id,
    userId: data.user_id,
    name: data.name,
    email: data.email,
    enterpriseEmail: data.enterprise_email,
    mobile: data.mobile,
    avatarUrl: data.avatar_url,
  };
}

/**
 * 用授权码（code）换取用户访问令牌。
 *
 * @param code 授权成功后回调地址携带的授权码
 * @returns 令牌包，含访问令牌与刷新令牌
 */
export async function exchangeCodeForToken(
  code: string
): Promise<FeishuTokenBundle> {
  if (!isFeishuConfigured()) {
    throw new Error(
      "飞书凭证未配置：无法换取用户令牌。请设置 FEISHU_APP_ID 与 FEISHU_APP_SECRET。"
    );
  }
  const client = getFeishuClient();
  const response = await client.authen.accessToken.create({
    data: { grant_type: "authorization_code", code },
  });
  return toTokenBundle(response.data ?? {});
}

/**
 * 用刷新令牌换取新的用户访问令牌。
 *
 * @param refreshToken 刷新令牌
 * @returns 新的令牌包
 */
export async function refreshUserToken(
  refreshToken: string
): Promise<FeishuTokenBundle> {
  if (!isFeishuConfigured()) {
    throw new Error(
      "飞书凭证未配置：无法刷新用户令牌。请设置 FEISHU_APP_ID 与 FEISHU_APP_SECRET。"
    );
  }
  const client = getFeishuClient();
  const response = await client.authen.refreshAccessToken.create({
    data: { grant_type: "refresh_token", refresh_token: refreshToken },
  });
  return toTokenBundle(response.data ?? {});
}

/**
 * 获取用户身份信息。
 *
 * 需携带用户访问令牌调用。
 *
 * @param accessToken 用户访问令牌
 * @returns 用户身份
 */
export async function fetchUserProfile(
  accessToken: string
): Promise<FeishuUserProfile> {
  const client = getFeishuClient();
  const response = await client.authen.userInfo.get(
    {},
    lark.withUserAccessToken(accessToken)
  );
  return toUserProfile(response.data ?? {});
}
