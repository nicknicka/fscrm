import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  listLeads: vi.fn(),
  countLeadsForPage: vi.fn(),
  countLeadsByStatus: vi.fn(),
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
  countLeadsByStatus: mocks.countLeadsByStatus,
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
  mocks.countLeadsByStatus.mockResolvedValue({ NEW: 1 });
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

  it("导出链接携带当前搜索词", async () => {
    const html = renderToStaticMarkup(
      await LeadsPage({ searchParams: Promise.resolve({ q: "云启" }) })
    );
    expect(html).toContain("/api/export/leads?q=%E4%BA%91%E5%90%AF");
  });
});

describe("线索状态计数", () => {
  it("状态卡用全量计数，分母是总数而不是当前页条数", async () => {
    // 场景：共 12 条线索，当前页只返回 1 条。修复前状态卡会显示 "1 / 1"，
    // 与页头「共 12 条线索」自相矛盾。
    mocks.countLeadsForPage.mockResolvedValue(12);
    mocks.countLeadsByStatus.mockResolvedValue({
      NEW: 5,
      FOLLOWING: 4,
      CONVERTED: 2,
      INVALID: 1,
    });

    const html = renderToStaticMarkup(
      await LeadsPage({ searchParams: Promise.resolve({}) })
    );

    // 页头与状态卡分母一致
    expect(html).toContain("共 12 条线索");
    expect(html).toContain("/ 12");
    // 各状态取全量值，而不是当前页那 1 条
    expect(html).toMatch(/>5<\/span>/);
    expect(html).toMatch(/>4<\/span>/);
  });

  it("把搜索词一并传给按状态计数，保证各状态之和等于总数", async () => {
    await LeadsPage({ searchParams: Promise.resolve({ q: "云启" }) });

    expect(mocks.countLeadsByStatus).toHaveBeenCalledWith(
      { search: "云启" },
      expect.anything()
    );
  });

  it("某个状态没有数据时显示 0 而不是空白", async () => {
    mocks.countLeadsByStatus.mockResolvedValue({ NEW: 1 });

    const html = renderToStaticMarkup(
      await LeadsPage({ searchParams: Promise.resolve({}) })
    );

    // 缺失的状态键要落到 0，页面读得出「这里确实是 0」
    expect(html).toContain("无效");
    expect(html).toMatch(/>0<\/span>/);
  });
});

describe("已转化线索的「查看商机」", () => {
  it("有转化产物 ID 时直达商机详情页", async () => {
    mocks.listLeads.mockResolvedValue([
      {
        id: "lead_converted",
        name: "云启科技",
        source: "展会",
        status: "CONVERTED",
        owner: { name: "张三" },
        ownerId: "user_owner",
        convertedOpportunityId: "opp_123",
      },
    ]);

    const html = renderToStaticMarkup(
      await LeadsPage({ searchParams: Promise.resolve({}) })
    );

    expect(html).toContain("/opportunities/opp_123");
  });

  it("历史线索没有关联时退回商机列表，不产生死链", async () => {
    mocks.listLeads.mockResolvedValue([
      {
        id: "lead_legacy",
        name: "旧线索",
        source: null,
        status: "CONVERTED",
        owner: { name: "张三" },
        ownerId: "user_owner",
        convertedOpportunityId: null,
      },
    ]);

    const html = renderToStaticMarkup(
      await LeadsPage({ searchParams: Promise.resolve({}) })
    );

    expect(html).toContain('href="/opportunities"');
    expect(html).not.toContain("/opportunities/null");
  });
});
