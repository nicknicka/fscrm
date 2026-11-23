import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  createSalesTask: vi.fn(),
  getFollowUp: vi.fn(),
  auditWrite: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/repositories/audit-log", () => ({
  auditWrite: mocks.auditWrite,
}));
vi.mock("@/lib/db/repositories/sales", () => ({
  getFollowUp: mocks.getFollowUp,
}));
vi.mock("@/lib/db/repositories/sales-task", () => ({
  createSalesTask: mocks.createSalesTask,
  deleteSalesTask: vi.fn(),
  listSalesTasks: vi.fn(),
  setSalesTaskStatus: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { createSalesTaskAction } from "./actions";

const owner = { id: "owner_1", name: "张三", role: "OWNER" as const };
const admin = { id: "admin_1", name: "管理员", role: "ADMIN" as const };

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe("createSalesTaskAction authorization & follow-up link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSalesTask.mockResolvedValue({ id: "task_1" });
    mocks.auditWrite.mockResolvedValue(undefined);
  });

  it("普通负责人指定他人为 owner 时仍使用自己的 ID", async () => {
    mocks.getCurrentUser.mockResolvedValue(owner);
    await createSalesTaskAction(
      form({
        title: "回访",
        dueAt: "2026-11-25T10:00",
        ownerId: "other_user",
      })
    );
    expect(mocks.createSalesTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: "回访" }),
      owner.id
    );
  });

  it("管理员可指定负责人，并传入 followUpId 与来源备注", async () => {
    mocks.getCurrentUser.mockResolvedValue(admin);
    mocks.getFollowUp.mockResolvedValue({
      id: "followup_1",
      customerId: "customer_1",
      opportunityId: "opp_1",
      nextFollowUpAt: new Date("2026-11-26T10:00:00Z"),
    });
    await createSalesTaskAction(
      form({
        title: "跟进下一步",
        ownerId: "owner_1",
        followUpId: "followup_1",
        description: "补充备注",
      })
    );
    expect(mocks.createSalesTask).toHaveBeenCalledWith(
      expect.objectContaining({
        followUpId: "followup_1",
        customerId: "customer_1",
        opportunityId: "opp_1",
        dueAt: new Date("2026-11-26T10:00:00Z"),
        description: expect.stringContaining("来源跟进记录：followup_1"),
      }),
      "owner_1"
    );
  });

  it("无法读取来源跟进时拒绝创建任务", async () => {
    mocks.getCurrentUser.mockResolvedValue(owner);
    mocks.getFollowUp.mockResolvedValue(null);
    await createSalesTaskAction(
      form({
        title: "越权跟进",
        dueAt: "2026-11-25T10:00",
        followUpId: "foreign_followup",
      })
    );
    expect(mocks.createSalesTask).not.toHaveBeenCalled();
  });

  it("缺失标题或非法时间时不写入", async () => {
    mocks.getCurrentUser.mockResolvedValue(owner);
    await createSalesTaskAction(form({ title: "", dueAt: "bad" }));
    expect(mocks.createSalesTask).not.toHaveBeenCalled();
  });
});
