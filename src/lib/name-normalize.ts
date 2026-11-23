/**
 * 名称归一化：去空格、全半角差异、常见公司后缀，用于客户匹配与导入去重。
 *
 * 与跟进解析共用同一口径：导入时按此规则判断「客户是否已存在」，
 * 避免同一家公司因「有限公司」「(北京)」等写法差异被重复导入。
 */
export function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[（(].*?[）)]/g, "")
    .replace(/(有限责任公司|股份有限公司|有限公司|集团|公司)$/g, "");
}
