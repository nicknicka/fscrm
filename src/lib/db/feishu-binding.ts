import { prisma } from "./client";
import type { PersonLookup } from "../feishu/identity/binding";
import type { CrmPersonRef } from "../feishu/identity/types";

/**
 * 基于数据库的飞书用户绑定适配器。
 *
 * 实现 `PersonLookup`，让飞书身份模块按开放 ID 在 CRM 用户表中查找对应人员，
 * 从而把「飞书用户 ↔ CRM 用户」的匹配落到真实持久化数据上。
 */

/** 创建基于 Prisma 的人员查找器。 */
export function createDbPersonLookup(): PersonLookup {
  return {
    async findByOpenId(openId: string): Promise<CrmPersonRef | null> {
      const user = await prisma.user.findUnique({
        where: { feishuOpenId: openId },
        select: { id: true, name: true },
      });
      return user ? { id: user.id, name: user.name } : null;
    },
  };
}

/**
 * 将飞书用户身份绑定到 CRM 用户。
 *
 * 用飞书开放 ID 更新指定 CRM 用户的绑定关系。
 *
 * @param userId CRM 用户 ID
 * @param profile 飞书用户身份（取开放 ID、联合 ID、用户 ID）
 */
export async function bindFeishuUser(
  userId: string,
  profile: {
    openId: string;
    unionId?: string;
    userId?: string;
  }
) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      feishuOpenId: profile.openId,
      feishuUnionId: profile.unionId,
      feishuUserId: profile.userId,
    },
  });
}
