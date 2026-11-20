import type { CrmPersonRef, FeishuUserProfile, UserMatchResult } from "./types";

/**
 * 飞书用户与 CRM 用户的绑定。
 *
 * 以飞书开放 ID 为匹配键，把飞书用户稳定映射到 CRM 用户；
 * 未匹配时返回明确状态，供上层引导新建 / 邀请 / 待绑定。
 */

/** CRM 人员查找接口：按飞书开放 ID 查找 CRM 人员。 */
export interface PersonLookup {
  /** 按飞书开放 ID 查找；未找到返回 null 或 undefined。支持同步或异步实现。 */
  findByOpenId(
    openId: string
  ): CrmPersonRef | null | undefined | Promise<CrmPersonRef | null | undefined>;
}

/**
 * 按飞书开放 ID 匹配 CRM 用户。
 *
 * @param profile 飞书用户身份
 * @param lookup 人员查找接口
 * @returns 匹配到的 CRM 人员；未匹配返回 null
 */
export async function matchUser(
  profile: FeishuUserProfile,
  lookup: PersonLookup
): Promise<CrmPersonRef | null> {
  if (!profile.openId) {
    return null;
  }
  const person = await lookup.findByOpenId(profile.openId);
  return person ?? null;
}

/**
 * 解析用户匹配结果。
 *
 * @param profile 飞书用户身份
 * @param lookup 人员查找接口
 * @returns 带匹配状态的完整结果
 */
export async function resolveUser(
  profile: FeishuUserProfile,
  lookup: PersonLookup
): Promise<UserMatchResult> {
  const person = await matchUser(profile, lookup);
  return {
    status: person ? "matched" : "unmatched",
    person,
    profile,
  };
}
