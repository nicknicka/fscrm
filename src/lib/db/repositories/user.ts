import { prisma } from "../client";
import type { User } from "../../../generated/prisma/client";

/**
 * 用户（负责人）数据访问层。
 */

/** 查询用户列表。 */
export async function listUsers(): Promise<User[]> {
  return prisma.user.findMany({
    orderBy: { name: "asc" },
  });
}

/** 按 ID 查询用户（含飞书 open_id，用于通知）。 */
export async function getUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

/** 按飞书 open_id 查询用户。 */
export async function getUserByFeishuOpenId(openId: string) {
  return prisma.user.findUnique({ where: { feishuOpenId: openId } });
}
