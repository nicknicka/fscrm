import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getUserById: vi.fn(),
  convertLeadToCustomerAndOpportunity: vi.fn(),
  revalidatePath: vi.fn(),
  notifyUser: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/db/repositories/user", () => ({
  getUserById: mocks.getUserById,
}));

vi.mock("@/lib/db/repositories/conversion", () => ({
  convertLeadToCustomerAndOpportunity:
    mocks.convertLeadToCustomerAndOpportunity,
  LeadConversionError: class LeadConversionError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "LeadConversionError";
    }
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

vi.mock("@/lib/feishu/message/notify", () => ({
  notifyUser: mocks.notifyUser,
}));

import { convertLeadAction } from "./actions";

const owner = { id: "user_owner", name: "张三", role: "OWNER" as const };
const other = { id: "user_other", name: "李四", role: "OWNER" as const };
const admin = { id: "admin_1", name: "管理员", role: "ADMIN" as const };

function form(values: Record<string, string>): FormData {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) {
    result.set(key, value);
  }
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(owner);
  mocks.getUserById.mockResolvedValue({ id: owner.id, name: owner.name });
  mocks.convertLeadToCustomerAndOpportunity.mockResolvedValue({
    customer: { id: "customer_new" },
    opportunity: { id: "opp_new" },
    leadId: "lead_1",
  });
});

describe("线索转化 Server Action", () => {
  it("未登录时拒绝转化，且不调用转化服务", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    await expect(convertLeadAction("lead_1", form({}))).rejects.toThrow(
      "UNAUTHENTICATED"
    );
    expect(mocks.convertLeadToCustomerAndOpportunity).not.toHaveBeenCalled();
  });

  it("普通负责人转化时强制归属本人，忽略表单中伪造的负责人", async () => {
    await convertLeadAction("lead_1", form({ ownerId: other.id }));

    expect(mocks.convertLeadToCustomerAndOpportunity).toHaveBeenCalledWith(
      "lead_1",
      { userId: owner.id, role: "OWNER" },
      { ownerId: owner.id }
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/leads");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/opportunities");
  });

  it("管理员可指定有效负责人；负责人不存在时拒绝且不写入", async () => {
    mocks.getCurrentUser.mockResolvedValue(admin);
    mocks.getUserById.mockResolvedValueOnce({ id: other.id, name: other.name });
    await convertLeadAction("lead_1", form({ ownerId: other.id }));
    expect(mocks.convertLeadToCustomerAndOpportunity).toHaveBeenCalledWith(
      "lead_1",
      { userId: admin.id, role: "ADMIN" },
      { ownerId: other.id }
    );

    mocks.getUserById.mockResolvedValueOnce(null);
    await expect(
      convertLeadAction("lead_2", form({ ownerId: "missing" }))
    ).rejects.toThrow("INVALID_OWNER");
    expect(mocks.convertLeadToCustomerAndOpportunity).toHaveBeenCalledTimes(1);
  });

  it("管理员未指定负责人时使用本人作为新对象负责人", async () => {
    mocks.getCurrentUser.mockResolvedValue(admin);

    await convertLeadAction("lead_1", form({}));

    expect(mocks.convertLeadToCustomerAndOpportunity).toHaveBeenCalledWith(
      "lead_1",
      { userId: admin.id, role: "ADMIN" },
      { ownerId: admin.id }
    );
  });

  it("越权或转化失败时不重新验证且错误向外抛出", async () => {
    mocks.convertLeadToCustomerAndOpportunity.mockRejectedValue(
      new Error("FORBIDDEN")
    );

    await expect(convertLeadAction("lead_other", form({}))).rejects.toThrow(
      "FORBIDDEN"
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
