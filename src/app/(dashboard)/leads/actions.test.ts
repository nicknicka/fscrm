import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getUserById: vi.fn(),
  createLead: vi.fn(),
  updateLead: vi.fn(),
  deleteLead: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/db/repositories/user", () => ({
  getUserById: mocks.getUserById,
}));

vi.mock("@/lib/db/repositories/sales", () => ({
  createLead: mocks.createLead,
  updateLead: mocks.updateLead,
  deleteLead: mocks.deleteLead,
  BusinessObjectNotFoundError: class BusinessObjectNotFoundError extends Error {
    constructor() {
      super("NOT_FOUND");
      this.name = "BusinessObjectNotFoundError";
    }
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import {
  createLeadAction,
  deleteLeadAction,
  updateLeadStatusAction,
} from "./actions";

function form(values: Record<string, string>): FormData {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) {
    result.set(key, value);
  }
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({
    id: "user_owner",
    name: "张三",
    role: "OWNER",
  });
  mocks.getUserById.mockResolvedValue({ id: "user_owner", name: "张三" });
  mocks.createLead.mockResolvedValue({ id: "lead_1" });
  mocks.updateLead.mockResolvedValue({ id: "lead_1" });
  mocks.deleteLead.mockResolvedValue({ id: "lead_1" });
});

describe("线索 Server Actions 权限", () => {
  it("未登录时新建、更新、删除线索均被拒绝且不访问仓库", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    await expect(createLeadAction(form({ name: "线索-A" }))).rejects.toThrow(
      "UNAUTHENTICATED"
    );
    await expect(
      updateLeadStatusAction("lead_1", form({ status: "FOLLOWING" }))
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(deleteLeadAction("lead_1")).rejects.toThrow(
      "UNAUTHENTICATED"
    );
    expect(mocks.createLead).not.toHaveBeenCalled();
    expect(mocks.updateLead).not.toHaveBeenCalled();
    expect(mocks.deleteLead).not.toHaveBeenCalled();
  });

  it("登录后新建线索使用当前会话范围，普通负责人不能传负责人字段越权", async () => {
    await createLeadAction(
      form({ name: "线索-A", status: "NEW", ownerId: "user_other" })
    );

    expect(mocks.createLead).toHaveBeenCalledWith(
      {
        name: "线索-A",
        status: "NEW",
        source: null,
        contactPhone: null,
        contactEmail: null,
        remark: null,
        owner: { connect: { id: "user_owner" } },
      },
      { userId: "user_owner", role: "OWNER" }
    );
    expect(mocks.getUserById).toHaveBeenCalledWith("user_owner");
    expect(mocks.redirect).toHaveBeenCalledWith("/leads");
  });

  it("管理员可以为新建线索指定任意有效负责人", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "user_admin",
      name: "管理员",
      role: "ADMIN",
    });
    mocks.getUserById.mockResolvedValue({
      id: "user_target",
      name: "目标负责人",
    });

    await createLeadAction(
      form({ name: "线索-B", status: "NEW", ownerId: "user_target" })
    );

    expect(mocks.createLead).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "线索-B",
        owner: { connect: { id: "user_target" } },
      }),
      { userId: "user_admin", role: "ADMIN" }
    );
  });

  it("管理员指定不存在的负责人时拒绝写入", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "user_admin",
      name: "管理员",
      role: "ADMIN",
    });
    mocks.getUserById.mockResolvedValue(null);

    await expect(
      createLeadAction(form({ name: "线索-C", ownerId: "missing" }))
    ).rejects.toThrow("INVALID_OWNER");
    expect(mocks.createLead).not.toHaveBeenCalled();
  });

  it("越权更新或删除线索时返回不泄露存在性的错误", async () => {
    const notFound = new Error("NOT_FOUND");
    mocks.updateLead.mockRejectedValueOnce(notFound);
    mocks.deleteLead.mockRejectedValueOnce(notFound);

    await expect(
      updateLeadStatusAction("lead_other", form({ status: "CONVERTED" }))
    ).rejects.toThrow("NOT_FOUND");
    await expect(deleteLeadAction("lead_other")).rejects.toThrow("NOT_FOUND");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("管理员的更新与删除使用管理员范围", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "user_admin",
      name: "管理员",
      role: "ADMIN",
    });

    await updateLeadStatusAction("lead_other", form({ status: "CONVERTED" }));
    await deleteLeadAction("lead_other");

    expect(mocks.updateLead).toHaveBeenCalledWith(
      "lead_other",
      { status: "CONVERTED" },
      { userId: "user_admin", role: "ADMIN" }
    );
    expect(mocks.deleteLead).toHaveBeenCalledWith("lead_other", {
      userId: "user_admin",
      role: "ADMIN",
    });
  });
});
