import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  apiKey: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock("@/lib/db/client", () => ({ prisma: prismaMock }));

import {
  createApiKey,
  hashKey,
  listApiKeys,
  resolveApiKey,
  revokeApiKey,
} from "./api-key";

const owner = { id: "owner_1", name: "张三", role: "OWNER" as const };
const admin = { id: "admin_1", name: "管理员", role: "ADMIN" as const };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.apiKey.create.mockImplementation(async ({ data }) => ({
    id: "key_1",
    ...data,
  }));
  prismaMock.apiKey.findUnique.mockImplementation(async ({ where }) =>
    where.keyHash === hashKey("fscrm_valid")
      ? {
          id: "key_1",
          keyHash: hashKey("fscrm_valid"),
          isActive: true,
          userId: owner.id,
        }
      : null
  );
  prismaMock.apiKey.update.mockResolvedValue({});
  prismaMock.apiKey.findMany.mockResolvedValue([]);
  prismaMock.apiKey.updateMany.mockResolvedValue({ count: 1 });
});

describe("API Key 服务", () => {
  it("hash 确定且不同明文不同哈希", () => {
    expect(hashKey("abc")).toBe(hashKey("abc"));
    expect(hashKey("abc")).not.toBe(hashKey("abd"));
  });

  it("创建只返回一次明文，库里只存哈希", async () => {
    const result = await createApiKey("ERP", owner.id);
    expect(result.plainKey).toMatch(/^fscrm_[0-9a-f]{48}$/);
    expect(prismaMock.apiKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          keyHash: hashKey(result.plainKey),
          userId: owner.id,
        }),
      })
    );
  });

  it("有效 key 解析出用户并更新使用时间", async () => {
    const result = await resolveApiKey("fscrm_valid");
    expect(result).toEqual({ userId: owner.id });
    expect(prismaMock.apiKey.update).toHaveBeenCalled();
  });

  it("无效/停用 key 返回 null", async () => {
    expect(await resolveApiKey("wrong")).toBeNull();
    prismaMock.apiKey.findUnique.mockResolvedValue(null);
    expect(await resolveApiKey("fscrm_valid")).toBeNull();
  });

  it("列表按权限收窄，吊销带权限条件", async () => {
    await listApiKeys(owner);
    expect(prismaMock.apiKey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: owner.id } })
    );
    await listApiKeys(admin);
    expect(prismaMock.apiKey.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: {} })
    );

    expect(await revokeApiKey("key_1", owner)).toBe(true);
    expect(prismaMock.apiKey.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "key_1", userId: owner.id }),
      })
    );
  });
});
