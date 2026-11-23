/**
 * CSV 解析：把 CSV 文本解析成表头 + 数据行。
 *
 * 支持 RFC 4180 的引号转义（双引号包裹、内嵌引号翻倍）、CRLF/LF 行尾。
 * 只做纯解析，不做字段校验或业务判断，便于单独测试。
 */

/** 解析单行 CSV（不含行尾），按逗号切分并还原引号转义。 */
function parseLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

/** 解析结果：表头与数据行（每行是「表头名 → 值」的映射）。 */
export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * 解析 CSV 文本。
 *
 * - 去掉开头的 UTF-8 BOM；
 * - 第一行作为表头；其后每行按表头映射为对象；
 * - 跳过完全空行；行数与表头不一致的行仍返回（缺失列为空串），由上层校验。
 */
export function parseCsv(text: string): ParsedCsv {
  const normalized = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const lines = normalized
    .split("\n")
    .map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line))
    .filter((line) => line.trim() !== "");
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseLine(lines[0]).map((header) => header.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  });
  return { headers, rows };
}
