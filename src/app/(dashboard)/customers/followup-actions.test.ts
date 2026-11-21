import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  createFollowUp: vi.fn(),
  deleteFollowUp: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

vi.mock("@/lib/db/repositories/sales", () => ({
  createFollowUp: mocks.createFollowUp,
  deleteFollowUp: mocks.deleteFollowUp,
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

// #29 只新增跟进入口；飞书通知由其他 ticket 负责，这里验证不误触发。
vi.mock("@/lib/feishu/message/notify", () => ({ notifyUser: vi.fn() }));

import {
  createCustomerFollowUpAction,
  deleteCustomerFollowUpAction,
} from "./actions";

const owner = { id: "owner_1", name: "张三", role: "OWNER" as const };
const admin = { id: "admin_1", name: "管理员", role: "ADMIN" as const };

function formData(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

describe("客户详情跟进 Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUser.mockResolvedValue(owner);
    mocks.createFollowUp.mockResolvedValue({ id: "follow_up_1" });
    mocks.deleteFollowUp.mockResolvedValue(true);
  });

  it("负责人可为本人客户新增跟进，并刷新详情页", async () => {
    await createCustomerFollowUpAction(
      "customer_1",
      formData({
        mode: "CALL",
        content: "电话沟通采购计划",
        nextFollowUpAt: "2026-11-28T10:00:00.000Z",
      })
    );

    expect(mocks.requireCurrentUser).toHaveBeenCalled();
    expect(mocks.createFollowUp).toHaveBeenCalledWith(
      {
        customer: { connect: { id: "customer_1" } },
        mode: "CALL",
        content: "电话沟通采购计划",
        nextFollowUpAt: new Date("2026-11-28T10:00:00.000Z"),
      },
      owner
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/customers/customer_1");
  });

  it("越权新增被仓储层拒绝时不刷新页面", async () => {
    mocks.createFollowUp.mockRejectedValue(new Error("FORBIDDEN"));

    await expect(
      createCustomerFollowUpAction(
        "foreign_customer",
        formData({ mode: "CALL", content: "越权跟进" })
      )
    ).rejects.toThrow("FORBIDDEN");

    expect(mocks.createFollowUp).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: { connect: { id: "foreign_customer" } },
      }),
      owner
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("管理员可在任意客户下新增跟进", async () => {
    mocks.requireCurrentUser.mockResolvedValue(admin);

    await createCustomerFollowUpAction(
      "any_customer",
      formData({ mode: "MEETING", content: "管理员记录" })
    );

    expect(mocks.createFollowUp).toHaveBeenCalledWith(expect.anything(), admin);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/customers/any_customer");
  });

  it("负责人可删除本人客户下的跟进，并刷新详情页", async () => {
    await deleteCustomerFollowUpAction("customer_1", "follow_up_1");

    expect(mocks.requireCurrentUser).toHaveBeenCalled();
    expect(mocks.deleteFollowUp).toHaveBeenCalledWith("follow_up_1", owner);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/customers/customer_1");
  });

  it("越权删除被仓储层拒绝时不刷新页面，并统一映射为 NOT_FOUND", async () => {
    mocks.deleteFollowUp.mockRejectedValue(new Error("FORBIDDEN"));

    await expect(
      deleteCustomerFollowUpAction("foreign_customer", "foreign_follow_up")
    ).rejects.toThrow("NOT_FOUND");
    expect(mocks.deleteFollowUp).toHaveBeenCalledWith("foreign_follow_up", owner);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("跟进不存在时仓储层返回 false，不刷新页面且统一映射为 NOT_FOUND", async () => {
    mocks.deleteFollowUp.mockResolvedValue(false);

    await expect(
      deleteCustomerFollowUpAction("customer_1", "missing_follow_up")
    ).rejects.toThrow("NOT_FOUND");
    expect(mocks.deleteFollowUp).toHaveBeenCalledWith("missing_follow_up", owner);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("管理员可删除任意跟进", async () => {
    mocks.requireCurrentUser.mockResolvedValue(admin);

    await deleteCustomerFollowUpAction("any_customer", "any_follow_up");

    expect(mocks.deleteFollowUp).toHaveBeenCalledWith("any_follow_up", admin);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/customers/any_customer");
  });

  it("未登录调用新增与删除均被拒绝", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new Error("UNAUTHENTICATED"));

    await expect(
      createCustomerFollowUpAction(
        "customer_1",
        formData({ mode: "CALL", content: "未登录" })
      )
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(
      deleteCustomerFollowUpAction("customer_1", "follow_up_1")
    ).rejects.toThrow("UNAUTHENTICATED");
    expect(mocks.createFollowUp).not.toHaveBeenCalled();
    expect(mocks.deleteFollowUp).not.toHaveBeenCalled();
  });
});
