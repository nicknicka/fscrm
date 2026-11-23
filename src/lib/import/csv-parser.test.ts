import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv-parser";

describe("parseCsv", () => {
  it("解析表头与数据行，去掉 BOM 与 CRLF", () => {
    const csv =
      "\uFEFF客户名称,等级,电话\r\n云启科技,高,13800000000\r\nAcme,低,13900000000\r\n";
    const { headers, rows } = parseCsv(csv);
    expect(headers).toEqual(["客户名称", "等级", "电话"]);
    expect(rows).toEqual([
      { 客户名称: "云启科技", 等级: "高", 电话: "13800000000" },
      { 客户名称: "Acme", 等级: "低", 电话: "13900000000" },
    ]);
  });

  it("还原引号转义：内嵌逗号与双引号", () => {
    const csv = '客户名称,备注\n"云启,科技","他说""你好"""\n';
    const { rows } = parseCsv(csv);
    expect(rows[0]["客户名称"]).toBe("云启,科技");
    expect(rows[0]["备注"]).toBe('他说"你好"');
  });

  it("跳过空行，缺失列补空串", () => {
    const csv = "客户名称,电话\n云启\n\nAcme,139\n";
    const { rows } = parseCsv(csv);
    expect(rows.length).toBe(2);
    expect(rows[0]["电话"]).toBe("");
  });

  it("空文本返回空结果", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
  });

  it("只有表头时返回零数据行", () => {
    const { headers, rows } = parseCsv("客户名称,等级\n");
    expect(headers).toEqual(["客户名称", "等级"]);
    expect(rows).toEqual([]);
  });
});
