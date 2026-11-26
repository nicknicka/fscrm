import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  listCustomers: vi.fn(),
  countCustomersForPage: vi.fn(),
  listAssignableUsers: vi.fn(),
  deleteCustomerAction: vi.fn(),
  createCustomerAction: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  usePathname: () => "/customers",
  useRouter: () => ({ prefetch: vi.fn() }),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

vi.mock("@/lib/db/repositories/customer", () => ({
  listCustomers: mocks.listCustomers,
  countCustomersForPage: mocks.countCustomersForPage,
}));

vi.mock("@/lib/db/repositories/user", () => ({
  listAssignableUsers: mocks.listAssignableUsers,
}));

vi.mock("./actions", () => ({
  createCustomerAction: mocks.createCustomerAction,
  deleteCustomerAction: mocks.deleteCustomerAction,
}));

vi.mock("./customer-form", () => ({
  CustomerForm: () => <div>新建客户表单</div>,
}));

import CustomersPage from "./page";

describe("客户列表页生命周期展示", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUser.mockResolvedValue({
      id: "user_owner",
      name: "张三",
      role: "OWNER",
    });
    mocks.listAssignableUsers.mockResolvedValue([]);
    mocks.countCustomersForPage.mockResolvedValue(2);
    mocks.listCustomers.mockResolvedValue([
      {
        id: "customer_1",
        name: "Acme",
        level: "MEDIUM",
        lifecycle: "LEAD",
        industry: "教育",
        owner: { name: "张三" },
        _count: { contacts: 1, opportunities: 0 },
      },
      {
        id: "customer_2",
        name: "Beta",
        level: "HIGH",
        lifecycle: "RETAINED",
        industry: "制造",
        owner: { name: "李四" },
        _count: { contacts: 2, opportunities: 1 },
      },
    ]);
  });

  it("为普通负责人展示每个客户的生命周期阶段", async () => {
    const html = renderToStaticMarkup(
      await CustomersPage({ searchParams: Promise.resolve({}) })
    );

    expect(html).toContain("生命周期");
    expect(html).toContain("线索");
    expect(html).toContain("留存");
  });

  it("导出链接携带当前搜索词", async () => {
    const html = renderToStaticMarkup(
      await CustomersPage({
        searchParams: Promise.resolve({ q: "云启科技" }),
      })
    );
    expect(html).toContain(
      "/api/export/customers?q=%E4%BA%91%E5%90%AF%E7%A7%91%E6%8A%80"
    );
  });
});
