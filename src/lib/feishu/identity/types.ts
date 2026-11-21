/**
 * 飞书用户身份与授权相关的类型定义。
 */

/** 飞书用户身份信息（来自授权或用户信息接口）。 */
export interface FeishuUserProfile {
  /** 开放 ID，跨应用唯一，作为匹配 CRM 用户的关键。 */
  openId: string;
  /** 联合 ID。 */
  unionId?: string;
  /** 用户 ID，应用内唯一。 */
  userId?: string;
  /** 姓名。 */
  name?: string;
  /** 邮箱。 */
  email?: string;
  /** 企业邮箱。 */
  enterpriseEmail?: string;
  /** 手机号。 */
  mobile?: string;
  /** 头像地址。 */
  avatarUrl?: string;
}

/** 飞书用户访问令牌的令牌包。 */
export interface FeishuTokenBundle {
  /** 用户访问令牌。 */
  accessToken: string;
  /** 刷新令牌。 */
  refreshToken?: string;
  /** 令牌类型，通常为 `Bearer`。 */
  tokenType?: string;
  /** 访问令牌有效期（秒）。 */
  expiresIn?: number;
  /** 刷新令牌有效期（秒）。 */
  refreshExpiresIn?: number;
}

/** 授权结果：令牌包 + 用户身份。 */
export interface FeishuAuthResult {
  token: FeishuTokenBundle;
  user: FeishuUserProfile;
}

/** 用户匹配状态。 */
export type UserMatchStatus = "matched" | "unmatched";

/** 用户匹配结果。 */
export interface UserMatchResult {
  status: UserMatchStatus;
  /** 匹配到的 CRM 人员；未匹配时为 null。 */
  person: CrmPersonRef | null;
  /** 飞书用户身份。 */
  profile: FeishuUserProfile;
}

/** 匹配结果中引用的 CRM 人员（仅保留身份与权限上下文所需的最小字段）。 */
export interface CrmPersonRef {
  id: string;
  name?: string;
  /** 当前负责人角色；缺省按普通负责人处理。 */
  role?: "OWNER" | "ADMIN";
}

/** 构造授权 URL 的参数。 */
export interface AuthorizeUrlParams {
  /** 应用 ID（`cli_` 前缀）。 */
  appId: string;
  /** 授权成功后的回调地址。 */
  redirectUri: string;
  /** 申请的权限范围，空格分隔。 */
  scope?: string;
  /** 透传的随机串，用于防 CSRF。 */
  state?: string;
  /** 开放平台域名，默认飞书；Lark 传 `https://open.larksuite.com`。 */
  domain?: string;
}
