import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a {...props}>{children}</a>,
}));

import { Pagination } from "./pagination";
import { buildPaginationMeta, parsePagination } from "@/lib/pagination";

describe("Pagination 组件", () => {
  it("渲染总数、页码与保留搜索条件的链接", () => {
    const meta = buildPaginationMeta(
      parsePagination({ page: "2", pageSize: "10" }),
      35
    );
    const html = renderToStaticMarkup(
      <Pagination meta={meta} pathname="/customers" filters={{ q: "云启" }} />
    );

    expect(html).toContain("共 35 条");
    expect(html).toContain("第 2 / 4 页");
    // 非默认 pageSize 会保留在链接里；& 在 HTML 中被转义为 &amp;
    expect(html).toContain(
      'href="/customers?q=%E4%BA%91%E5%90%AF&amp;page=1&amp;pageSize=10"'
    );
    expect(html).toContain('aria-current="page"');
  });

  it("页码超出范围时给出返回末页的提示", () => {
    const meta = buildPaginationMeta(
      parsePagination({ page: "9", pageSize: "10" }),
      15
    );
    const html = renderToStaticMarkup(
      <Pagination meta={meta} pathname="/leads" />
    );

    expect(html).toContain("已超出范围");
    expect(html).toContain("返回第 2 页");
    expect(html).toContain('href="/leads?page=2&amp;pageSize=10"');
  });

  it("首页没有上一页按钮", () => {
    const meta = buildPaginationMeta(parsePagination({}), 15);
    const html = renderToStaticMarkup(
      <Pagination meta={meta} pathname="/leads" />
    );

    expect(html).toContain("下一页");
    // 上一页渲染为禁用的 span，不是链接
    expect(html).not.toContain(">上一页</a>");
  });
});
