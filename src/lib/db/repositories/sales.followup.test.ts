import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  followUpFindMany: vi.fn(),
  followUpFindFirst: vi.fn(),
  followUpCreate: vi.fn(),
  followUpUpdate: vi.fn(),
  followUpUpdateMany: vi.fn(),
  followUpDelete: vi.fn(),
  followUpDeleteMany: vi.fn(),
  followUpCount: vi.fn(),
  customerFindFirst: vi.fn(),
  opportunityFindFirst: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    followUp: {
      findMany: mocks.followUpFindMany,
      findFirst: mocks.followUpFindFirst,
      create: mocks.followUpCreate,
      update: mocks.followUpUpdate,
      updateMany: mocks.followUpUpdateMany,
      delete: mocks.followUpDelete,
      deleteMany: mocks.followUpDeleteMany,
      count: mocks.followUpCount,
    },
    customer: { findFirst: mocks.customerFindFirst },
    opportunity: { findFirst: mocks.opportunityFindFirst },
  },
}));

const sales = await import("./sales");

const owner = { id: "owner_1", name: "张三", role: "OWNER" as const };
const admin = { id: "admin_1", name: "管理员", role: "ADMIN" as const };

function stubList(values: unknown[]) {
  mocks.followUpFindMany.mockResolvedValue(values);
  return values;
}

beforeEach(() => {
  vi.clearAllMocks();
  stubList([]);
  mocks.followUpFindFirst.mockResolvedValue(null);
  mocks.followUpCreate.mockImplementation(async ({ data }) => ({
    id: "created_follow_up",
    ...data,
  }));
  mocks.followUpUpdate.mockRejectedValue(new Error("should not call update"));
  mocks.followUpUpdateMany.mockResolvedValue({ count: 0 });
  mocks.followUpDelete.mockRejectedValue(new Error("should not call delete"));
  mocks.followUpDeleteMany.mockResolvedValue({ count: 0 });
  mocks.followUpCount.mockResolvedValue(0);
  mocks.customerFindFirst.mockResolvedValue({ id: "customer_1" });
  mocks.opportunityFindFirst.mockResolvedValue({ id: "opportunity_1" });
});

describe("跟进记录权限范围", () => {
  describe("普通负责人", () => {
    it("列表只包含关联到本人客户或本人商机的跟进记录", async () => {
      const visible = stubList([
        { id: "own_customer_follow_up" },
        { id: "own_opportunity_follow_up" },
      ]);

      await expect(sales.listFollowUps({}, owner)).resolves.toEqual(visible);

      expect(mocks.followUpFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { customer: { ownerId: owner.id } },
              { opportunity: { ownerId: owner.id } },
            ],
          },
        })
      );
    });

    it("管理员列表查询没有负责人限制", async () => {
      await sales.listFollowUps({}, admin);

      expect(mocks.followUpFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} })
      );
    });

    it("按客户或商机筛选时仍保留权限范围", async () => {
      await sales.listFollowUps(
        { customerId: "customer_1", opportunityId: "opportunity_1" },
        owner
      );

      expect(mocks.followUpFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              {
                OR: [
                  { customer: { ownerId: owner.id } },
                  { opportunity: { ownerId: owner.id } },
                ],
              },
              {
                OR: [
                  { customerId: "customer_1" },
                  { opportunityId: "opportunity_1" },
                ],
              },
            ]),
          }),
        })
      );
    });

    it("详情只返回本人可见的跟进记录", async () => {
      const visible = { id: "own_follow_up" };
      mocks.followUpFindFirst.mockResolvedValue(visible);

      await expect(sales.getFollowUp("own_follow_up", owner)).resolves.toEqual(
        visible
      );

      expect(mocks.followUpFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              { id: "own_follow_up" },
              {
                OR: [
                  { customer: { ownerId: owner.id } },
                  { opportunity: { ownerId: owner.id } },
                ],
              },
            ],
          },
        })
      );
    });

    it("猜测他人跟进记录 ID 查询详情时返回 null", async () => {
      await expect(
        sales.getFollowUp("foreign_follow_up", owner)
      ).resolves.toBeNull();
    });

    it("拒绝创建关联到他人客户或商机的跟进记录", async () => {
      mocks.customerFindFirst.mockResolvedValue(null);
      mocks.opportunityFindFirst.mockResolvedValue(null);

      await expect(
        sales.createFollowUp(
          {
            customer: { connect: { id: "foreign_customer" } },
            mode: "CALL",
            content: "越权跟进",
          },
          owner
        )
      ).rejects.toThrow();

      expect(mocks.followUpCreate).not.toHaveBeenCalled();
    });

    it("创建时归属人始终取当前会话，并接受本人客户", async () => {
      const result = await sales.createFollowUp(
        {
          customer: { connect: { id: "customer_1" } },
          owner: { connect: { id: "other_user" } },
          mode: "CALL",
          content: "本人客户跟进",
        },
        owner
      );

      expect(mocks.followUpCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ownerId: owner.id,
          content: "本人客户跟进",
        }),
      });
      expect(mocks.customerFindFirst).toHaveBeenCalledWith({
        where: { id: "customer_1", ownerId: owner.id },
        select: { id: true },
      });
      expect(result).toEqual(expect.objectContaining({ ownerId: owner.id }));
    });

    it("无客户或商机的跟进记录不能由普通负责人创建", async () => {
      await expect(
        sales.createFollowUp({ mode: "CALL", content: "无关联跟进" }, owner)
      ).rejects.toThrow();

      expect(mocks.customerFindFirst).not.toHaveBeenCalled();
      expect(mocks.opportunityFindFirst).not.toHaveBeenCalled();
      expect(mocks.followUpCreate).not.toHaveBeenCalled();
    });

    it("猜测他人跟进记录 ID 时拒绝删除且不改动任何数据", async () => {
      await expect(
        sales.deleteFollowUp("foreign_follow_up", owner)
      ).resolves.toBe(false);

      expect(mocks.followUpDelete).not.toHaveBeenCalled();
      expect(mocks.followUpUpdateMany).not.toHaveBeenCalled();
      expect(mocks.followUpDeleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([{ id: "foreign_follow_up" }]),
          }),
        })
      );
    });

    it("本人可见的跟进记录可以删除", async () => {
      mocks.followUpDeleteMany.mockResolvedValue({ count: 1 });

      await expect(sales.deleteFollowUp("own_follow_up", owner)).resolves.toBe(
        true
      );

      expect(mocks.followUpDeleteMany).toHaveBeenCalledWith({
        where: {
          AND: [
            { id: "own_follow_up" },
            {
              OR: [
                { customer: { ownerId: owner.id } },
                { opportunity: { ownerId: owner.id } },
              ],
            },
          ],
        },
      });
    });

    it("更新也只能在本人可见范围内进行，且归属人不能被改成他人", async () => {
      mocks.followUpUpdateMany.mockResolvedValue({ count: 1 });
      mocks.followUpFindFirst.mockResolvedValue({ id: "own_follow_up" });

      await expect(
        sales.updateFollowUp(
          "own_follow_up",
          {
            content: "已更新",
            owner: { connect: { id: "other_user" } },
          },
          owner
        )
      ).resolves.toEqual({ id: "own_follow_up" });

      expect(mocks.followUpUpdateMany).toHaveBeenCalledWith({
        where: {
          AND: [
            { id: "own_follow_up" },
            {
              OR: [
                { customer: { ownerId: owner.id } },
                { opportunity: { ownerId: owner.id } },
              ],
            },
          ],
        },
        data: expect.not.objectContaining({ owner: expect.anything() }),
      });
      expect(mocks.followUpUpdate).not.toHaveBeenCalled();
    });

    it("概览计数只包含本人可见的跟进记录", async () => {
      mocks.followUpCount.mockResolvedValue(2);

      await expect(sales.countFollowUps(owner)).resolves.toBe(2);
      expect(mocks.followUpCount).toHaveBeenCalledWith({
        where: {
          OR: [
            { customer: { ownerId: owner.id } },
            { opportunity: { ownerId: owner.id } },
          ],
        },
      });
    });

    it("读取跟进记录列表时不接受伪造的会话负责人", async () => {
      await sales.listFollowUps({}, { ...owner, role: "ADMIN" });

      expect(mocks.followUpFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} })
      );
    });
  });

  describe("管理员", () => {
    it("列表和详情不受负责人范围限制", async () => {
      stubList([{ id: "any_follow_up" }]);
      mocks.followUpFindFirst.mockResolvedValue({ id: "any_follow_up" });

      await sales.listFollowUps({}, admin);
      await sales.getFollowUp("any_follow_up", admin);

      expect(mocks.followUpFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} })
      );
      expect(mocks.followUpFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "any_follow_up" } })
      );
    });

    it("可创建关联任意客户或商机的跟进记录", async () => {
      mocks.customerFindFirst.mockResolvedValue(null);
      mocks.opportunityFindFirst.mockResolvedValue({ id: "opportunity_1" });

      await expect(
        sales.createFollowUp(
          {
            opportunity: { connect: { id: "opportunity_1" } },
            mode: "MEETING",
            content: "管理员创建",
          },
          admin
        )
      ).resolves.toBeDefined();

      expect(mocks.followUpCreate).toHaveBeenCalled();
    });

    it("可删除任意跟进记录", async () => {
      mocks.followUpDelete.mockResolvedValue({ id: "any_follow_up" });

      await expect(
        sales.deleteFollowUp("any_follow_up", admin)
      ).resolves.toEqual({ id: "any_follow_up" });
      expect(mocks.followUpDelete).toHaveBeenCalledWith({
        where: { id: "any_follow_up" },
      });
    });

    it("概览计数统计全部跟进记录", async () => {
      mocks.followUpCount.mockResolvedValue(9);

      await expect(sales.countFollowUps(admin)).resolves.toBe(9);
      expect(mocks.followUpCount).toHaveBeenCalledWith();
    });
  });
});
