import { describe, expect, it } from "vitest";
import {
  DEFAULT_CARDS,
  isDashboardCard,
  normalizeCards,
} from "./dashboard-cards";

describe("仪表盘卡片目录", () => {
  it("默认展示全部卡片", () => {
    expect(normalizeCards(undefined)).toEqual([...DEFAULT_CARDS]);
    expect(normalizeCards(null)).toEqual([...DEFAULT_CARDS]);
    expect(normalizeCards("不是数组")).toEqual([...DEFAULT_CARDS]);
  });

  it("过滤非法 key、去重并保持顺序", () => {
    expect(
      normalizeCards(["stat_leads", "BOGUS", "stat_leads", "chart_trend"])
    ).toEqual(["stat_leads", "chart_trend"]);
  });

  it("全部非法时回落默认，而不是空看板", () => {
    expect(normalizeCards(["a", "b"])).toEqual([...DEFAULT_CARDS]);
  });

  it("空数组也回落默认", () => {
    expect(normalizeCards([])).toEqual([...DEFAULT_CARDS]);
  });

  it("isDashboardCard 只接受目录内 key", () => {
    expect(isDashboardCard("stat_customers")).toBe(true);
    expect(isDashboardCard("nope")).toBe(false);
  });
});
