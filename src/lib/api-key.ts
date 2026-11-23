import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/client";
import type { CurrentUser } from "@/lib/auth/session";

/**
 * API Key 服务（#76）：外部系统只读访问业务数据的凭据。
 * 明文 key 只在创建时返回一次，数据库仅存 SHA-256 哈希。
 */

/** 生成 key：前缀更易识别，明文仅在创建响应里出现一次。 */
export async function createApiKey(
  label: string,
  userId: string
): Promise<{ id: string; label: string; plainKey: string }> {
  const plainKey = `fscrm_${randomBytes(24).toString("hex")}`;
  const keyHash = hashKey(plainKey);
  const record = await prisma.apiKey.create({
    data: { keyHash, label: label.trim() || "未命名 API Key", userId },
  });
  return { id: record.id, label: record.label, plainKey };
}

/** SHA-256 哈希（与创建时一致）。 */
export function hashKey(plainKey: string): string {
  return createHash("sha256").update(plainKey).digest("hex");
}

/** 校验 key：返回关联用户 id；无效/停用返回 null，并更新 lastUsedAt。 */
export async function resolveApiKey(
  plainKey: string
): Promise<{ userId: string } | null> {
  const keyHash = hashKey(plainKey);
  const record = await prisma.apiKey.findUnique({ where: { keyHash } });
  if (!record || !record.isActive) return null;
  // 异步更新使用时间，不阻塞鉴权结果；失败不影响鉴权。
  void prisma.apiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
  return { userId: record.userId };
}

/** 列出当前用户可见的 key（管理员全部，负责人仅自己；不返回哈希以外敏感信息）。 */
export async function listApiKeys(user: CurrentUser) {
  return prisma.apiKey.findMany({
    where: user.role === "ADMIN" ? {} : { userId: user.id },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

/** 吊销 key：负责人只能吊销自己的，管理员全部。 */
export async function revokeApiKey(id: string, user: CurrentUser) {
  const result = await prisma.apiKey.updateMany({
    where: {
      id,
      ...(user.role === "ADMIN" ? {} : { userId: user.id }),
    },
    data: { isActive: false },
  });
  return result.count > 0;
}
