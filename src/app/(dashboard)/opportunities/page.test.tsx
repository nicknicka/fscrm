import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  loadOpportunitiesPageData: vi.fn(),
  loadLeadsPageData: vi.fn(),
  loadPipelineCounts: vi.fn(),
  deleteOpportunityAction: vi.fn(),
  updateOpportunityStageAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  usePathname: () => "/opportunities",
  useRouter: () => ({ prefetch: vi.fn() }),
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

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("./page-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./page-data")>();
  return {
    ...actual,
    loadOpportunitiesPageData: mocks.loadOpportunitiesPageData,
    loadLeadsPageData: mocks.loadLeadsPageData,
    loadPipelineCounts: mocks.loadPipelineCounts,
  };
});

vi.mock("@/lib/db/repositories/stage-config", () => ({
  listStageConfigs: vi.fn().mockResolvedValue([]),
}));

vi.mock("./actions", () => ({
  deleteOpportunityAction: mocks.deleteOpportunityAction,
  updateOpportunityStageAction: mocks.updateOpportunityStageAction,
}));

vi.mock("./opportunity-form", () => ({
  OpportunityForm: () => <div>新建商机表单</div>,
}));

vi.mock("@/components/auto-submit-select", () => ({
  AutoSubmitSelect: ({
    name,
    options,
  }: {
    name: string;
    options: { label: string }[];
  }) => (
    <select
      name={name}
      data-testid={name === "ownerId" ? "owner-filter" : "stage-select"}
    >
      {options.map((o) => (
        <option key={o.label}>{o.label}</option>
      ))}
    </select>
  ),
}));

import OpportunitiesPage from "./page";

const admin = { id: "admin_1", name: "管理员", role: "ADMIN" };
const owner = { id: "owner_1", name: "张三", role: "OWNER" };
const users = [
  { id: "user_1", name: "张三" },
  { id: "user_2", name: "李四" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadOpportunitiesPageData.mockResolvedValue({
    opportunities: [
      {
        id: "opp_1",
        name: "云启年度采购",
        stage: "QUOTE",
        amount: 800000,
        owner: { name: "张三" },
        customer: { name: "云启科技" },
      },
    ],
    total: 1,
    customers: [],
    users,
    filters: {},
  });
  mocks.loadLeadsPageData.mockResolvedValue({
    leads: [],
    total: 0,
    filters: {},
  });
  mocks.loadPipelineCounts.mockResolvedValue({ opportunities: 1, leads: 0 });
});

describe("商机列表搜索与高级筛选", () => {
  it("管理员可见负责人筛选，普通负责人不可见", async () => {
    mocks.getCurrentUser.mockResolvedValue(admin);
    const adminHtml = renderToStaticMarkup(
      await OpportunitiesPage({ searchParams: Promise.resolve({}) })
    );
    expect(adminHtml).toContain("owner-filter");
    expect(adminHtml).toContain("全部负责人");

    mocks.getCurrentUser.mockResolvedValue(owner);
    const ownerHtml = renderToStaticMarkup(
      await OpportunitiesPage({ searchParams: Promise.resolve({}) })
    );
    expect(ownerHtml).not.toContain("owner-filter");
  });

  it("搜索框渲染且 q/阶段/负责人组合条件透传数据层", async () => {
    mocks.getCurrentUser.mockResolvedValue(admin);
    const html = renderToStaticMarkup(
      await OpportunitiesPage({
        searchParams: Promise.resolve({
          q: "云启",
          stage: "QUOTE",
          ownerId: "user_2",
        }),
      })
    );

    expect(html).toContain("搜索商机名称、客户或备注");
    expect(mocks.loadOpportunitiesPageData).toHaveBeenCalledWith(
      admin,
      { q: "云启", stage: "QUOTE", ownerId: "user_2" },
      expect.anything()
    );
  });

  it("阶段胶囊链接保留搜索与负责人条件", async () => {
    mocks.getCurrentUser.mockResolvedValue(admin);
    const html = renderToStaticMarkup(
      await OpportunitiesPage({
        searchParams: Promise.resolve({ q: "云启", ownerId: "user_2" }),
      })
    );

    // 阶段切换链接应保留 q 与 ownerId
    expect(html).toContain("q=%E4%BA%91%E5%90%AF");
    expect(html).toContain("ownerId=user_2");
    expect(html).toContain("stage=QUOTE");
  });

  it("导出链接携带 q/stage/ownerId，普通负责人不带 ownerId", async () => {
    mocks.getCurrentUser.mockResolvedValue(admin);
    const adminHtml = renderToStaticMarkup(
      await OpportunitiesPage({
        searchParams: Promise.resolve({
          q: "云启",
          stage: "QUOTE",
          ownerId: "user_2",
        }),
      })
    );
    // renderToStaticMarkup 会把 href 中的 & 转义成 &amp;
    expect(adminHtml).toContain(
      "/api/export/opportunities?q=%E4%BA%91%E5%90%AF&amp;stage=QUOTE&amp;ownerId=user_2"
    );

    mocks.getCurrentUser.mockResolvedValue(owner);
    const ownerHtml = renderToStaticMarkup(
      await OpportunitiesPage({
        searchParams: Promise.resolve({
          q: "云启",
          stage: "QUOTE",
          ownerId: "user_2",
        }),
      })
    );
    expect(ownerHtml).toContain(
      "/api/export/opportunities?q=%E4%BA%91%E5%90%AF&amp;stage=QUOTE"
    );
    expect(ownerHtml).not.toContain("/api/export/opportunities?ownerId=");
  });
});

describe("商机页的线索/商机视图切换", () => {
  it("默认展示商机视图，页头与切换条都标出「在谈」", async () => {
    mocks.getCurrentUser.mockResolvedValue(owner);

    const html = renderToStaticMarkup(
      await OpportunitiesPage({ searchParams: Promise.resolve({}) })
    );

    expect(html).toContain("在谈");
    expect(html).toContain("共 1 个商机");
    // 视图切换需要同时给出两个入口
    expect(html).toContain("线索");
    expect(html).toContain("未谈");
  });

  it("view=leads 时渲染线索行，而不是商机表", async () => {
    mocks.getCurrentUser.mockResolvedValue(owner);
    mocks.loadLeadsPageData.mockResolvedValue({
      leads: [
        {
          id: "lead_1",
          name: "展会名单-A公司",
          source: "展会",
          status: "NEW",
          owner: { name: "张三" },
          convertedOpportunityId: null,
        },
      ],
      total: 1,
      filters: {},
    });

    const html = renderToStaticMarkup(
      await OpportunitiesPage({
        searchParams: Promise.resolve({ view: "leads" }),
      })
    );

    expect(html).toContain("展会名单-A公司");
    expect(html).toContain("转化为商机");
    expect(html).toContain("共 1 条线索");
    // 商机表独有的列不应出现
    expect(html).not.toContain("预计金额");
  });

  it("线索视图不把 stage 传给线索查询，避免两套筛选互相干扰", async () => {
    mocks.getCurrentUser.mockResolvedValue(owner);

    await OpportunitiesPage({
      searchParams: Promise.resolve({ view: "leads", stage: "QUOTE" }),
    });

    expect(mocks.loadLeadsPageData).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ stage: expect.anything() }),
      expect.anything()
    );
    // 商机查询也不该带着 stage 再查一遍
    expect(mocks.loadOpportunitiesPageData).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ stage: undefined }),
      expect.anything()
    );
  });

  it("线索视图不渲染商机的阶段胶囊，搜索框换成线索口径", async () => {
    mocks.getCurrentUser.mockResolvedValue(owner);

    const html = renderToStaticMarkup(
      await OpportunitiesPage({
        searchParams: Promise.resolve({ view: "leads" }),
      })
    );

    expect(html).toContain("搜索线索名称、电话或邮箱");
    expect(html).not.toContain("全部阶段");
  });

  it("筛选表单在线索视图下保留 view=leads", async () => {
    mocks.getCurrentUser.mockResolvedValue(owner);

    const html = renderToStaticMarkup(
      await OpportunitiesPage({
        searchParams: Promise.resolve({ view: "leads" }),
      })
    );

    expect(html).toContain('name="view" value="leads"');
  });
});

describe("切换条的固定计数", () => {
  it("商机视图下也显示线索的真实数量，而不是 0", async () => {
    mocks.getCurrentUser.mockResolvedValue(owner);
    mocks.loadPipelineCounts.mockResolvedValue({ opportunities: 9, leads: 4 });

    const html = renderToStaticMarkup(
      await OpportunitiesPage({ searchParams: Promise.resolve({}) })
    );

    // 修复前线索计数恒为 0——只在线索视图才加载线索总量
    expect(html).toContain("未谈");
    expect(html).toMatch(/未谈[\s\S]{0,40}4/);
    expect(html).toMatch(/在谈[\s\S]{0,40}9/);
  });

  it("计数不随搜索条件变化：始终读固定基数", async () => {
    mocks.getCurrentUser.mockResolvedValue(owner);

    await OpportunitiesPage({ searchParams: Promise.resolve({ q: "云启" }) });

    expect(mocks.loadPipelineCounts).toHaveBeenCalledWith(expect.anything());
  });
});
