import { describe, expect, it } from "vitest";
import { escapeCsvCell, renderCsv, type CsvColumn } from "./csv";

describe("escapeCsvCell", () => {
  it("普通文本原样输出", () => {
    expect(escapeCsvCell("云启科技")).toBe("云启科技");
    expect(escapeCsvCell(800000)).toBe("800000");
  });

  it("空值输出为空单元格", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("含逗号/引号/换行时按 RFC 4180 转义", () => {
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell('a"b')).toBe('"a""b"');
    expect(escapeCsvCell("a\nb")).toBe('"a\nb"');
  });
});

describe("renderCsv", () => {
  const columns: CsvColumn<{ name: string; amount: number | null }>[] = [
    { header: "名称", value: (r) => r.name },
    { header: "金额", value: (r) => r.amount },
  ];

  it("输出 BOM + 表头 + 数据行，行尾为 CRLF", () => {
    const csv = renderCsv(columns, [
      { name: "云启", amount: 800000 },
      { name: "Acme", amount: null },
    ]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("名称,金额");
    expect(csv).toContain("云启,800000");
    // 空值渲染为空单元格
    expect(csv).toContain("Acme,\r\n");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("无数据时只有表头", () => {
    const csv = renderCsv(columns, []);
    expect(csv).toBe("\uFEFF名称,金额\r\n");
  });

  it("含特殊字符的字段被正确转义", () => {
    const csv = renderCsv(columns, [{ name: 'A公司,"北京"', amount: 1 }]);
    expect(csv).toContain('"A公司,""北京"""');
  });
});
