/**
 * CSV 导出的共享工具。
 *
 * 只做「数据行 → CSV 文本」的纯计算，不含鉴权与数据访问，便于测试。
 * 输出带 UTF-8 BOM，Excel 打开中文不乱码；字段按 RFC 4180 转义。
 */

/** CSV 列定义：表头与从数据行取值的函数。 */
export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/** 按 RFC 4180 转义单个单元格：含逗号/引号/换行时用双引号包裹，内嵌引号翻倍。 */
export function escapeCsvCell(
  value: string | number | null | undefined
): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * 把数据行渲染成 CSV 文本（带 BOM）。
 * 表头始终输出；无数据时只有表头一行。
 */
export function renderCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines: string[] = [];
  lines.push(columns.map((column) => escapeCsvCell(column.header)).join(","));
  for (const row of rows) {
    lines.push(
      columns.map((column) => escapeCsvCell(column.value(row))).join(",")
    );
  }
  // BOM 让 Excel 正确识别 UTF-8；用 \r\n 作为行尾，兼容 Windows Excel。
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
