import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  createOpportunity: vi.fn(),
  updateOpportunity: vi.fn(),
  deleteOpportunity: vi.fn(),
  getUserById: vi.fn(),
  getCustomer: vi.fn(),
  notifyUser: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

vi.mock("@/lib/db/repositories/sales", () => ({
  createOpportunity: mocks.createOpportunity,
  updateOpportunity: mocks.updateOpportunity,
  deleteOpportunity: mocks.deleteOpportunity,
}));

vi.mock("@/lib/db/repositories/user", () => ({
  getUserById: mocks.getUserById,
}));

vi.mock("@/lib/db/repositories/customer", () => ({
  getCustomer: mocks.getCustomer,
}));

vi.mock("@/lib/feishu/message/notify", () => ({
  notifyUser: mocks.notifyUser,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

const owner = { id: "owner_1", name: "张三", role: "OWNER" as const };
const other = { id: "owner_2", name: "李四", role: "OWNER" as const };
const admin = { id: "admin_1", name: "管理员", role: "ADMIN" as const };

function createFormData(values: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue(owner);
  mocks.getUserById.mockImplementation(async (id: string) => ({
    id,
    name: id === other.id ? other.name : owner.name,
    feishuOpenId: `ou_${id}`,
  }));
  mocks.getCustomer.mockResolvedValue({ id: "customer_1", name: "示例客户" });
  mocks.createOpportunity.mockImplementation(async (data: unknown) => ({
    id: "opp_1",
    name: "年度采购合同",
    ...(data as Record<string, unknown>),
  }));
  mocks.updateOpportunity.mockResolvedValue({ id: "opp_1" });
  mocks.deleteOpportunity.mockResolvedValue({ id: "opp_1" });
  mocks.notifyUser.mockResolvedValue({ sent: true });
});

describe("商机 Server Actions", () => {
  it("所有商机动作都从会话认证并拒绝未登录调用", async () => {
    const actions = await import("./actions");
    mocks.requireCurrentUser.mockRejectedValue(new Error("UNAUTHENTICATED"));

    await expect(
      actions.createOpportunityAction(
        createFormData({ name: "年度采购合同", customerId: "customer_1" })
      )
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(
      actions.updateOpportunityStageAction(
        "opp_1",
        createFormData({ stage: "WON" })
      )
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(actions.deleteOpportunityAction("opp_1")).rejects.toThrow(
      "UNAUTHENTICATED"
    );
    expect(mocks.createOpportunity).not.toHaveBeenCalled();
    expect(mocks.updateOpportunity).not.toHaveBeenCalled();
    expect(mocks.deleteOpportunity).not.toHaveBeenCalled();
  });

  it("普通负责人创建商机时忽略表单中的他人负责人，并通知实际负责人", async () => {
    const actions = await import("./actions");

    await actions.createOpportunityAction(
      createFormData({
        name: "年度采购合同",
        customerId: "customer_1",
        ownerId: other.id,
      })
    );

    expect(mocks.requireCurrentUser).toHaveBeenCalled();
    expect(mocks.createOpportunity).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: { connect: { id: owner.id } },
      }),
      owner
    );
    expect(mocks.getUserById).toHaveBeenCalledWith(owner.id);
    expect(mocks.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ feishuOpenId: `ou_${owner.id}` }),
      "opportunity_created",
      expect.objectContaining({ opportunityName: "年度采购合同" })
    );
  });

  it("管理员可移交商机，消息卡片发给表单指定的实际负责人", async () => {
    const actions = await import("./actions");
    mocks.requireCurrentUser.mockResolvedValue(admin);

    await actions.createOpportunityAction(
      createFormData({
        name: "年度采购合同",
        customerId: "customer_1",
        ownerId: other.id,
      })
    );

    expect(mocks.createOpportunity).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: { connect: { id: other.id } },
      }),
      admin
    );
    expect(mocks.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ feishuOpenId: `ou_${other.id}` }),
      "opportunity_created",
      expect.anything()
    );
  });

  it("未指定负责人时按当前负责人创建并通知当前负责人", async () => {
    const actions = await import("./actions");

    await actions.createOpportunityAction(
      createFormData({ name: "年度采购合同", customerId: "customer_1" })
    );

    expect(mocks.createOpportunity).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: { connect: { id: owner.id } },
      }),
      owner
    );
    expect(mocks.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ feishuOpenId: `ou_${owner.id}` }),
      "opportunity_created",
      expect.anything()
    );
  });

  it("已转化商机可通过阶段更新推进到赢单，并刷新列表与详情", async () => {
    const actions = await import("./actions");
    mocks.updateOpportunity.mockResolvedValue({
      id: "opp_from_lead",
      stage: "WON",
    });

    await actions.updateOpportunityStageAction(
      "opp_from_lead",
      createFormData({ stage: "WON" })
    );

    expect(mocks.updateOpportunity).toHaveBeenCalledWith(
      "opp_from_lead",
      { stage: "WON" },
      owner
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/opportunities");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/opportunities/opp_from_lead"
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/funnel");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/analytics");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/targets");
  });

  it("越权阶段更新与删除动作被拒绝且不调用仓储写入", async () => {
    const actions = await import("./actions");
    mocks.updateOpportunity.mockRejectedValue(new Error("FORBIDDEN"));
    mocks.deleteOpportunity.mockRejectedValue(new Error("FORBIDDEN"));

    await expect(
      actions.updateOpportunityStageAction(
        "someone_else",
        createFormData({ stage: "WON" })
      )
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      actions.deleteOpportunityAction("someone_else")
    ).rejects.toThrow("FORBIDDEN");
    expect(mocks.updateOpportunity).toHaveBeenCalledWith(
      "someone_else",
      { stage: "WON" },
      owner
    );
    expect(mocks.deleteOpportunity).toHaveBeenCalledWith("someone_else", owner);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("opportunity detail edit", () => {
  it("lets an owner edit their own opportunity and refresh the detail page", async () => {
    const actions = await import("./actions");

    await actions.updateOpportunityAction(
      "opp_1",
      createFormData({
        name: "更新后的商机",
        amount: "88000",
        expectedCloseDate: "2026-12-31",
        remark: "等待客户确认",
      })
    );

    expect(mocks.updateOpportunity).toHaveBeenCalledWith(
      "opp_1",
      {
        name: "更新后的商机",
        amount: 88000,
        expectedCloseDate: new Date("2026-12-31"),
        remark: "等待客户确认",
      },
      owner
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/opportunities/opp_1");
  });

  it("ignores a forged owner field submitted by an ordinary owner", async () => {
    const actions = await import("./actions");

    await actions.updateOpportunityAction(
      "opp_1",
      createFormData({ name: "我的商机", ownerId: other.id })
    );

    expect(mocks.updateOpportunity).toHaveBeenCalledWith(
      "opp_1",
      expect.not.objectContaining({ owner: expect.anything() }),
      owner
    );
  });

  it("lets an administrator reassign the owner while editing an opportunity", async () => {
    const actions = await import("./actions");
    mocks.requireCurrentUser.mockResolvedValue(admin);

    await actions.updateOpportunityAction(
      "opp_1",
      createFormData({ name: "移交后的商机", ownerId: other.id })
    );

    expect(mocks.updateOpportunity).toHaveBeenCalledWith(
      "opp_1",
      expect.objectContaining({ owner: { connect: { id: other.id } } }),
      admin
    );
  });

  it("maps a cross-owner opportunity edit to the unified NOT_FOUND result", async () => {
    const actions = await import("./actions");
    mocks.updateOpportunity.mockRejectedValue(new Error("FORBIDDEN"));

    await expect(
      actions.updateOpportunityAction(
        "someone_else",
        createFormData({ name: "越权商机" })
      )
    ).rejects.toThrow("NOT_FOUND");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
