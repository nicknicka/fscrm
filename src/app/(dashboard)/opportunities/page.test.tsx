import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  loadOpportunitiesPageData: vi.fn(),
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

vi.mock("./page-data", () => ({
  loadOpportunitiesPageData: mocks.loadOpportunitiesPageData,
}));

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
});
