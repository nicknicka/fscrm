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
  createOpportunityFollowUpAction,
  deleteOpportunityFollowUpAction,
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

describe("商机详情跟进 Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUser.mockResolvedValue(owner);
    mocks.createFollowUp.mockResolvedValue({ id: "follow_up_1" });
    mocks.deleteFollowUp.mockResolvedValue(true);
  });

  it("负责人可为本人商机新增跟进，并刷新详情页", async () => {
    await createOpportunityFollowUpAction(
      "opportunity_1",
      formData({
        mode: "EMAIL",
        content: "邮件确认报价细节",
        nextFollowUpAt: "2026-11-30T08:30:00.000Z",
      })
    );

    expect(mocks.requireCurrentUser).toHaveBeenCalled();
    expect(mocks.createFollowUp).toHaveBeenCalledWith(
      {
        opportunity: { connect: { id: "opportunity_1" } },
        mode: "EMAIL",
        content: "邮件确认报价细节",
        nextFollowUpAt: new Date("2026-11-30T08:30:00.000Z"),
      },
      owner
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/opportunities/opportunity_1"
    );
  });

  it("越权新增被仓储层拒绝时不刷新页面", async () => {
    mocks.createFollowUp.mockRejectedValue(new Error("FORBIDDEN"));

    await expect(
      createOpportunityFollowUpAction(
        "foreign_opportunity",
        formData({ mode: "IM", content: "越权跟进" })
      )
    ).rejects.toThrow("FORBIDDEN");

    expect(mocks.createFollowUp).toHaveBeenCalledWith(
      expect.objectContaining({
        opportunity: { connect: { id: "foreign_opportunity" } },
      }),
      owner
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("管理员可在任意商机下新增跟进", async () => {
    mocks.requireCurrentUser.mockResolvedValue(admin);

    await createOpportunityFollowUpAction(
      "any_opportunity",
      formData({ mode: "MEETING", content: "管理员记录" })
    );

    expect(mocks.createFollowUp).toHaveBeenCalledWith(expect.anything(), admin);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/opportunities/any_opportunity"
    );
  });

  it("负责人可删除本人商机下的跟进，并刷新详情页", async () => {
    await deleteOpportunityFollowUpAction("opportunity_1", "follow_up_1");

    expect(mocks.requireCurrentUser).toHaveBeenCalled();
    expect(mocks.deleteFollowUp).toHaveBeenCalledWith("follow_up_1", owner);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/opportunities/opportunity_1"
    );
  });

  it("越权删除被仓储层拒绝时不刷新页面", async () => {
    mocks.deleteFollowUp.mockRejectedValue(new Error("FORBIDDEN"));

    await expect(
      deleteOpportunityFollowUpAction(
        "foreign_opportunity",
        "foreign_follow_up"
      )
    ).rejects.toThrow("FORBIDDEN");
    expect(mocks.deleteFollowUp).toHaveBeenCalledWith("foreign_follow_up", owner);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("管理员可删除任意跟进", async () => {
    mocks.requireCurrentUser.mockResolvedValue(admin);

    await deleteOpportunityFollowUpAction("any_opportunity", "any_follow_up");

    expect(mocks.deleteFollowUp).toHaveBeenCalledWith("any_follow_up", admin);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/opportunities/any_opportunity"
    );
  });

  it("未登录调用新增与删除均被拒绝", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new Error("UNAUTHENTICATED"));

    await expect(
      createOpportunityFollowUpAction(
        "opportunity_1",
        formData({ mode: "CALL", content: "未登录" })
      )
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(
      deleteOpportunityFollowUpAction("opportunity_1", "follow_up_1")
    ).rejects.toThrow("UNAUTHENTICATED");
    expect(mocks.createFollowUp).not.toHaveBeenCalled();
    expect(mocks.deleteFollowUp).not.toHaveBeenCalled();
  });
});
