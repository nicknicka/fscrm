import { describe, expect, it } from "vitest";
import { normalizeCustomFields } from "./custom-fields";

describe("客户自定义字段规整", () => {
  it("只接受目录内 key 的字符串/数字值", () => {
    expect(
      normalizeCustomFields({ source: "展会", budget: 800000, hack: "x" })
    ).toEqual({ source: "展会", budget: "800000" });
  });

  it("过滤空值与非字符串/数字", () => {
    expect(
      normalizeCustomFields({ source: "  ", budget: null, region: { a: 1 } })
    ).toEqual({});
  });

  it("非对象输入返回空对象", () => {
    expect(normalizeCustomFields(null)).toEqual({});
    expect(normalizeCustomFields("x")).toEqual({});
    expect(normalizeCustomFields([1, 2])).toEqual({});
  });
});
