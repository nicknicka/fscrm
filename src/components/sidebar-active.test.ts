import { describe, expect, it } from "vitest";
import { isPathUnder, pickActiveNavHref } from "./sidebar-active";
import { ALL_NAV_HREFS } from "./sidebar";

/**
 * 选中态回归测试。
 *
 * 背景：曾用裸字符串前缀匹配（`pathname.startsWith(item.href)`）判定高亮，
 * 导致 `/customers/public-pool` 同时命中「客户」和「公海」两个入口。
 * 这里的用例把真实导航项逐一钉住。
 */
describe("isPathUnder", () => {
  it("根入口只接受根路径", () => {
    expect(isPathUnder("/", "/")).toBe(true);
    expect(isPathUnder("/customers", "/")).toBe(false);
  });

  it("按路径段匹配子路由，不做裸字符串前缀", () => {
    expect(isPathUnder("/customers/public-pool", "/customers")).toBe(true);
    expect(isPathUnder("/customers/123", "/customers")).toBe(true);
    expect(isPathUnder("/customers", "/customers")).toBe(true);

    // 同前缀但不同段，不应命中
    expect(isPathUnder("/customers-x", "/customers")).toBe(false);
    expect(isPathUnder("/customersx", "/customers")).toBe(false);
  });

  it("容忍入口末尾多余的斜杠", () => {
    expect(isPathUnder("/customers/123", "/customers/")).toBe(true);
    expect(isPathUnder("/customers", "/customers/")).toBe(true);
  });
});

describe("pickActiveNavHref", () => {
  it("客户详情路由只高亮客户，不高亮公海", () => {
    expect(pickActiveNavHref("/customers/123", ALL_NAV_HREFS)).toBe(
      "/customers"
    );
  });

  it("公海路由只高亮公海，不再同时高亮客户", () => {
    expect(pickActiveNavHref("/customers/public-pool", ALL_NAV_HREFS)).toBe(
      "/customers/public-pool"
    );
  });

  it("客户列表路由只高亮客户", () => {
    expect(pickActiveNavHref("/customers", ALL_NAV_HREFS)).toBe("/customers");
  });

  it("设置子页面命中更具体的设置入口，不高亮其父级之外的入口", () => {
    expect(pickActiveNavHref("/settings/model", ALL_NAV_HREFS)).toBe(
      "/settings"
    );
    expect(pickActiveNavHref("/settings/users", ALL_NAV_HREFS)).toBe(
      "/settings/users"
    );
    expect(pickActiveNavHref("/settings", ALL_NAV_HREFS)).toBe("/settings");
  });

  it("根路径只高亮概览", () => {
    expect(pickActiveNavHref("/", ALL_NAV_HREFS)).toBe("/");
  });

  it("各业务模块列表路由高亮对应入口", () => {
    const cases = [
      ["/leads", "/leads"],
      ["/opportunities", "/opportunities"],
      ["/opportunities/42", "/opportunities"],
      ["/contracts", "/contracts"],
      ["/contracts/7", "/contracts"],
      ["/orders", "/orders"],
      ["/orders/9", "/orders"],
      ["/funnel", "/funnel"],
      ["/reminders", "/reminders"],
    ] as const;
    for (const [pathname, expected] of cases) {
      expect(pickActiveNavHref(pathname, ALL_NAV_HREFS), pathname).toBe(
        expected
      );
    }
  });

  it("不属于任何入口时返回 null", () => {
    expect(pickActiveNavHref("/unknown", ALL_NAV_HREFS)).toBeNull();
  });
});
