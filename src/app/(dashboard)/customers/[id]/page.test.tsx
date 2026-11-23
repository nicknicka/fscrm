import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  getCustomer: vi.fn(),
  listAssignableUsers: vi.fn(),
  notFound: vi.fn(),
  updateCustomerLifecycleAction: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

vi.mock("@/lib/auth/session", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

vi.mock("@/lib/db/repositories/customer", () => ({
  getCustomer: mocks.getCustomer,
}));

vi.mock("@/lib/db/repositories/user", () => ({
  listAssignableUsers: mocks.listAssignableUsers,
}));

vi.mock("@/lib/stage-display", () => ({
  loadStageLabelMap: vi.fn().mockResolvedValue({ WON: "赢单" }),
}));

vi.mock("../actions", () => ({
  createCustomerFollowUpAction: vi.fn(),
  deleteCustomerFollowUpAction: vi.fn(),
}));

vi.mock("./lifecycle-actions", () => ({
  updateCustomerLifecycleAction: mocks.updateCustomerLifecycleAction,
}));

vi.mock("./customer-detail-form", () => ({
  CustomerDetailForm: () => <div>基本信息编辑表单</div>,
}));

vi.mock("./contacts/contacts-manager", () => ({
  ContactsManager: () => <div>联系人管理</div>,
}));

import CustomerDetailPage from "./page";

const baseCustomer = {
  id: "customer_1",
  name: "Acme",
  level: "MEDIUM",
  lifecycle: "WON",
  industry: "教育",
  phone: null,
  email: null,
  address: null,
  remark: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  ownerId: "user_owner",
  owner: { name: "张三" },
  contacts: [],
  opportunities: [],
  followUps: [],
};

async function renderDetail(role: "OWNER" | "ADMIN"): Promise<string> {
  mocks.requireCurrentUser.mockResolvedValue({
    id: role === "ADMIN" ? "user_admin" : "user_owner",
    name: role === "ADMIN" ? "管理员" : "张三",
    role,
  });
  mocks.getCustomer.mockResolvedValue(baseCustomer);
  mocks.listAssignableUsers.mockResolvedValue([]);
  return renderToStaticMarkup(
    await CustomerDetailPage({ params: Promise.resolve({ id: "customer_1" }) })
  );
}

describe("客户详情页生命周期展示与编辑", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("普通负责人只查看客户生命周期阶段", async () => {
    const html = await renderDetail("OWNER");

    expect(html).toContain("客户生命周期");
    expect(html).toContain("成交");
    expect(html).not.toContain("调整生命周期");
  });

  it("管理员可以调整客户生命周期阶段", async () => {
    const html = await renderDetail("ADMIN");

    expect(html).toContain("调整生命周期");
    expect(html).toContain('name="lifecycle"');
    expect(html).toContain("留存");
  });
});
