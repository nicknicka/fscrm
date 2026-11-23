import { describe, expect, it } from "vitest";
import {
  buildPaginationMeta,
  DEFAULT_PAGE_SIZE,
  paginationHref,
  parsePagination,
} from "./pagination";

describe("parsePagination", () => {
  it("默认从第 1 页、每页 20 条开始", () => {
    expect(parsePagination({})).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      skip: 0,
      take: DEFAULT_PAGE_SIZE,
    });
  });

  it("按 page/pageSize 推导 skip 与 take", () => {
    expect(parsePagination({ page: "3", pageSize: "10" })).toEqual({
      page: 3,
      pageSize: 10,
      skip: 20,
      take: 10,
    });
  });

  it("非法页码回落到 1", () => {
    expect(parsePagination({ page: "0" }).page).toBe(1);
    expect(parsePagination({ page: "-5" }).page).toBe(1);
    expect(parsePagination({ page: "abc" }).page).toBe(1);
    expect(parsePagination({ page: "1.5" }).page).toBe(1);
  });

  it("数组形式的页码取不到值时回落默认", () => {
    expect(parsePagination({ page: ["2", "3"] }).page).toBe(1);
  });

  it("非法的 pageSize 回落到默认值", () => {
    expect(parsePagination({ pageSize: "7" }).pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePagination({ pageSize: "1000" }).pageSize).toBe(
      DEFAULT_PAGE_SIZE
    );
  });

  it("允许的 pageSize 值均可解析", () => {
    for (const size of [10, 20, 50, 100]) {
      expect(parsePagination({ pageSize: String(size) }).pageSize).toBe(size);
    }
  });
});

describe("buildPaginationMeta", () => {
  const pagination = parsePagination({ page: "2", pageSize: "10" });

  it("按总数计算总页数与上一页/下一页", () => {
    expect(buildPaginationMeta(pagination, 35)).toEqual({
      page: 2,
      pageSize: 10,
      total: 35,
      totalPages: 4,
      hasPrev: true,
      hasNext: true,
      prevPage: 1,
      nextPage: 3,
    });
  });

  it("总数为 0 时总页数为 1，且没有上/下一页", () => {
    const first = parsePagination({});
    expect(buildPaginationMeta(first, 0)).toMatchObject({
      totalPages: 1,
      hasPrev: false,
      hasNext: false,
      prevPage: null,
      nextPage: null,
    });
  });

  it("末页没有下一页", () => {
    expect(
      buildPaginationMeta(parsePagination({ page: "4", pageSize: "10" }), 35)
    ).toMatchObject({ hasNext: false, nextPage: null });
  });
});

describe("paginationHref", () => {
  it("保留搜索条件并写入页码", () => {
    expect(paginationHref("/customers", { q: "云启" }, 2, 20)).toBe(
      "/customers?q=%E4%BA%91%E5%90%AF&page=2"
    );
  });

  it("非默认 pageSize 会写入链接", () => {
    expect(paginationHref("/customers", {}, 3, 50)).toBe(
      "/customers?page=3&pageSize=50"
    );
  });

  it("忽略数组值与旧的 page/pageSize 条件", () => {
    expect(
      paginationHref(
        "/leads",
        { status: ["NEW", "FOLLOWING"], page: "9" },
        1,
        20
      )
    ).toBe("/leads?page=1");
  });
});
