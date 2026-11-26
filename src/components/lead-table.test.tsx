import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/leads",
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

vi.mock("./auto-submit-select", () => ({
  AutoSubmitSelect: ({ name }: { name: string }) => <select name={name} />,
}));

import { LeadTable, type LeadRow } from "./lead-table";

const noop = async () => {};
const updateStatusAction = () => noop;
const convertAction = () => noop;

const base: LeadRow = {
  id: "lead_1",
  name: "展会名单-A公司",
  source: "展会",
  status: "NEW",
  owner: { name: "张三" },
  convertedOpportunityId: null,
};

function render(
  leads: LeadRow[],
  renderActions?: (lead: LeadRow) => React.ReactNode
) {
  return renderToStaticMarkup(
    <LeadTable
      leads={leads}
      updateStatusAction={updateStatusAction}
      convertAction={convertAction}
      renderActions={renderActions}
    />
  );
}

describe("共享线索表格", () => {
  it("未转化线索显示「转化为商机」，不显示「查看商机」", () => {
    const html = render([base]);
    expect(html).toContain("转化为商机");
    expect(html).not.toContain("查看商机");
  });

  it("已转化且有商机 ID 时直达详情", () => {
    const html = render([
      { ...base, status: "CONVERTED", convertedOpportunityId: "opp_9" },
    ]);
    expect(html).toContain("/opportunities/opp_9");
    expect(html).not.toContain("转化为商机");
  });

  it("已转化但缺商机 ID 时退回列表，不产生 /opportunities/null", () => {
    const html = render([
      { ...base, status: "CONVERTED", convertedOpportunityId: null },
    ]);
    expect(html).toContain('href="/opportunities"');
    expect(html).not.toContain("/opportunities/null");
  });

  it("来源为空时显示占位符，不渲染空白单元格", () => {
    const html = render([{ ...base, source: null }]);
    expect(html).toContain("—");
  });

  it("负责人为空时显示「未分配」", () => {
    const html = render([{ ...base, owner: null }]);
    expect(html).toContain("未分配");
  });

  it("把额外操作注入到操作列（如删除按钮）", () => {
    const html = render([base], (lead) => (
      <button aria-label={`删除线索 ${lead.name}`}>✕</button>
    ));
    expect(html).toContain("删除线索 展会名单-A公司");
  });

  it("转化表单带稳定 id，供外部负责人下拉用 form 属性关联", () => {
    const html = render([base]);
    expect(html).toContain('id="convert-lead_1"');
  });
});
