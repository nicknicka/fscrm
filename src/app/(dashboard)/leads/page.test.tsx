import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  listLeads: vi.fn(),
  countLeadsForPage: vi.fn(),
  listAssignableUsers: vi.fn(),
  convertLeadAction: vi.fn(),
  deleteLeadAction: vi.fn(),
  updateLeadStatusAction: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a {...props}>{children}</a>,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/leads",
  useRouter: () => ({ prefetch: vi.fn() }),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/db/repositories/sales", () => ({
  listLeads: mocks.listLeads,
  countLeadsForPage: mocks.countLeadsForPage,
}));

vi.mock("@/lib/db/repositories/user", () => ({
  listAssignableUsers: mocks.listAssignableUsers,
}));

vi.mock("./actions", () => ({
  convertLeadAction: mocks.convertLeadAction,
  deleteLeadAction: mocks.deleteLeadAction,
  updateLeadStatusAction: mocks.updateLeadStatusAction,
}));

vi.mock("./lead-form", () => ({
  LeadForm: () => <div>新建线索表单</div>,
}));

vi.mock("@/components/auto-submit-select", () => ({
  AutoSubmitSelect: () => <select />,
}));

import LeadsPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({
    id: "user_owner",
    name: "张三",
    role: "OWNER",
  });
  mocks.listAssignableUsers.mockResolvedValue([]);
  mocks.countLeadsForPage.mockResolvedValue(1);
  mocks.listLeads.mockResolvedValue([
    {
      id: "lead_1",
      name: "云启科技",
      source: "展会",
      status: "NEW",
      owner: { name: "张三" },
      ownerId: "user_owner",
    },
  ]);
});

describe("线索列表搜索", () => {
  it("渲染搜索框与占位文案", async () => {
    const html = renderToStaticMarkup(
      await LeadsPage({ searchParams: Promise.resolve({}) })
    );
    expect(html).toContain("搜索线索名称、电话或邮箱");
    expect(html).toContain('name="q"');
  });

  it("把 q 传给仓储查询并把 q 保留在分页链接中", async () => {
    const html = renderToStaticMarkup(
      await LeadsPage({ searchParams: Promise.resolve({ q: "云启" }) })
    );

    expect(mocks.listLeads).toHaveBeenCalledWith(
      expect.objectContaining({ search: "云启" }),
      expect.anything()
    );
    expect(mocks.countLeadsForPage).toHaveBeenCalledWith(
      { search: "云启" },
      expect.anything()
    );
    expect(html).toContain("q=%E4%BA%91%E5%90%AF");
  });

  it("无搜索词时不传 search 条件", async () => {
    await LeadsPage({ searchParams: Promise.resolve({}) });
    expect(mocks.listLeads).toHaveBeenCalledWith(
      expect.not.objectContaining({ search: expect.anything() }),
      expect.anything()
    );
  });
});
