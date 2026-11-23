import { afterEach, describe, expect, it, vi } from "vitest";

// 扫描器只读数据库，这里用 mock 精确控制三种信号的输入。
// vi.mock 会被提升到文件顶部，因此用 vi.hoisted 保证 mock 先于工厂创建。
const { findMany, findFirst } = vi.hoisted(() => ({
  findMany: {
    followUp: vi.fn(),
    customer: vi.fn(),
    order: vi.fn(),
    user: vi.fn(),
    salesTask: vi.fn(),
  },
  findFirst: { followUp: vi.fn() },
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    followUp: { findMany: findMany.followUp, findFirst: findFirst.followUp },
    customer: { findMany: findMany.customer },
    order: { findMany: findMany.order },
    user: { findMany: findMany.user },
    salesTask: { findMany: findMany.salesTask },
  },
}));

import { scanReminders } from "./scan";

const NOW = new Date("2026-11-22T10:00:00+08:00");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

afterEach(() => {
  vi.clearAllMocks();
});

function setup({
  overdue = [] as unknown[],
  customers = [] as unknown[],
  orders = [] as unknown[],
  users = [] as unknown[],
  tasks = [] as unknown[],
  hasLaterFollowUp = false,
} = {}) {
  findMany.followUp.mockResolvedValue(overdue);
  findMany.customer.mockResolvedValue(customers);
  findMany.order.mockResolvedValue(orders);
  findMany.user.mockResolvedValue(users);
  findMany.salesTask.mockResolvedValue(tasks);
  findFirst.followUp.mockResolvedValue(
    hasLaterFollowUp ? { id: "later" } : null
  );
}

describe("scanReminders", () => {
  it("没有任何待办时返回空集合", async () => {
    setup();
    const result = await scanReminders(NOW);
    expect(result.batches).toEqual([]);
    expect(result.skippedUnbound).toBe(0);
  });

  it("跟进超期：登记了下一步时间且已过、之后没有新跟进时提醒", async () => {
    setup({
      overdue: [
        {
          id: "f1",
          ownerId: "u1",
          customerId: "c1",
          createdAt: daysAgo(5),
          nextFollowUpAt: daysAgo(3),
          customer: { id: "c1", name: "云启科技" },
        },
      ],
      users: [{ id: "u1", name: "张三", feishuOpenId: "ou_1" }],
    });

    const result = await scanReminders(NOW);
    expect(result.batches).toHaveLength(1);
    const batch = result.batches[0];
    expect(batch.kind).toBe("followup_overdue");
    expect(batch.ownerId).toBe("u1");
    expect(batch.items[0].title).toBe("云启科技");
    expect(batch.items[0].detail).toContain("超期 3 天");
  });

  it("之后再跟进过的客户不再提醒", async () => {
    setup({
      overdue: [
        {
          id: "f1",
          ownerId: "u1",
          customerId: "c1",
          createdAt: daysAgo(5),
          nextFollowUpAt: daysAgo(3),
          customer: { id: "c1", name: "云启科技" },
        },
      ],
      users: [{ id: "u1", name: "张三", feishuOpenId: "ou_1" }],
      hasLaterFollowUp: true,
    });
    const result = await scanReminders(NOW);
    expect(result.batches).toEqual([]);
  });

  it("同一客户多条超期只提醒一次，避免刷屏", async () => {
    setup({
      overdue: [1, 2, 3].map((i) => ({
        id: `f${i}`,
        ownerId: "u1",
        customerId: "c1",
        createdAt: daysAgo(10),
        nextFollowUpAt: daysAgo(i),
        customer: { id: "c1", name: "云启科技" },
      })),
      users: [{ id: "u1", name: "张三", feishuOpenId: "ou_1" }],
    });
    const result = await scanReminders(NOW);
    expect(result.batches).toHaveLength(1);
    expect(result.batches[0].total).toBe(1);
  });

  it("客户沉默：超过阈值没跟进时提醒，且注明从未跟进", async () => {
    setup({
      customers: [
        {
          id: "c2",
          name: "海隅酒店",
          ownerId: "u2",
          createdAt: daysAgo(40),
          followUps: [],
        },
        {
          id: "c3",
          name: "新鲜客户",
          ownerId: "u2",
          createdAt: daysAgo(1),
          followUps: [],
        },
      ],
      users: [{ id: "u2", name: "李四", feishuOpenId: "ou_2" }],
    });

    const result = await scanReminders(NOW);
    const batch = result.batches.find((b) => b.kind === "customer_silent");
    expect(batch).toBeDefined();
    expect(batch?.total).toBe(1);
    expect(batch?.items[0].title).toBe("海隅酒店");
    expect(batch?.items[0].detail).toContain("还没有任何跟进");
  });

  it("待回款：按订单金额减已收算出差额", async () => {
    setup({
      customers: [
        {
          id: "c1",
          name: "云启科技",
          ownerId: "u1",
          createdAt: NOW,
          followUps: [{ createdAt: NOW }],
        },
      ],
      orders: [
        {
          id: "o1",
          amount: 100000,
          status: "FULFILLING",
          customer: { id: "c1", name: "云启科技", ownerId: "u1" },
          payments: [{ amount: 40000 }],
        },
        {
          id: "o2",
          amount: 50000,
          status: "COMPLETED",
          customer: { id: "c1", name: "云启科技", ownerId: "u1" },
          payments: [{ amount: 50000 }],
        },
      ],
      users: [{ id: "u1", name: "张三", feishuOpenId: "ou_1" }],
    });

    const result = await scanReminders(NOW);
    const batch = result.batches.find((b) => b.kind === "payment_due");
    expect(batch?.total).toBe(1);
    expect(batch?.items[0].amount).toBe(60000);
    expect(batch?.items[0].detail).toContain("60,000");
  });

  it("待回款提醒带上最近回款计划信息", async () => {
    setup({
      orders: [
        {
          id: "o_plan",
          amount: 100000,
          status: "FULFILLING",
          customer: { id: "c1", name: "云启科技", ownerId: "u1" },
          payments: [],
          paymentPlans: [
            { plannedAt: new Date("2026-11-25T00:00:00+08:00"), amount: 60000 },
          ],
        },
      ],
      users: [{ id: "u1", name: "张三", feishuOpenId: "ou_1" }],
    });

    const result = await scanReminders(NOW);
    const batch = result.batches.find((b) => b.kind === "payment_due");
    expect(batch?.items[0].detail).toContain("计划");
    expect(batch?.items[0].detail).toContain("60,000");
  });

  it("逾期任务/日程生成 task_due 提醒", async () => {
    setup({
      tasks: [
        {
          id: "t1",
          title: "跟进报价",
          dueAt: daysAgo(2),
          ownerId: "u1",
          customer: { id: "c1", name: "云启科技" },
        },
      ],
      users: [{ id: "u1", name: "张三", feishuOpenId: "ou_1" }],
    });

    const result = await scanReminders(NOW);
    const batch = result.batches.find((b) => b.kind === "task_due");
    expect(batch?.items[0].title).toBe("跟进报价");
    expect(batch?.items[0].detail).toContain("云启科技");
  });

  it("每类明细最多 5 条，但 total 记录全量", async () => {
    setup({
      customers: Array.from({ length: 8 }, (_, i) => ({
        id: `c${i}`,
        name: `客户${i}`,
        ownerId: "u1",
        createdAt: daysAgo(60),
        followUps: [],
      })),
      users: [{ id: "u1", name: "张三", feishuOpenId: "ou_1" }],
    });
    const result = await scanReminders(NOW);
    const batch = result.batches.find((b) => b.kind === "customer_silent");
    expect(batch?.items).toHaveLength(5);
    expect(batch?.total).toBe(8);
  });

  it("负责人未绑定飞书时计入 skippedUnbound", async () => {
    setup({
      customers: [
        {
          id: "c1",
          name: "无主客户",
          ownerId: "u9",
          createdAt: daysAgo(60),
          followUps: [],
        },
      ],
      users: [{ id: "u9", name: "王五", feishuOpenId: null }],
    });
    const result = await scanReminders(NOW);
    expect(result.skippedUnbound).toBe(1);
    expect(result.batches[0].ownerOpenId).toBeNull();
  });

  it("没有负责人的客户与订单不产生提醒", async () => {
    setup({
      customers: [
        {
          id: "c1",
          name: "公海客户",
          ownerId: null,
          createdAt: daysAgo(60),
          followUps: [],
        },
      ],
      orders: [
        {
          id: "o1",
          amount: 1000,
          status: "PENDING",
          customer: { id: "c1", name: "公海客户", ownerId: null },
          payments: [],
        },
      ],
    });
    const result = await scanReminders(NOW);
    expect(result.batches).toEqual([]);
  });
});
