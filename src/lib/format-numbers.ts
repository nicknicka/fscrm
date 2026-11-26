/**
 * 数字排版的单一来源。
 *
 * 全站金额、百分比、计数理由此统一，避免每个页面自己拼字符串——
 * 同一个数在漏斗写「¥9.6万」、在商机写「¥1,250,000」、在报价写「¥186,000」，
 * 读者要在三种记法之间换算，这是专业感最先流失的地方。
 *
 * 三条规则：
 *   1. 正文里的金额一律「¥ + 千分位整数」，只在空间紧张时用「万/亿」缩写；
 *   2. 缩写保留一位小数，且只在 ≥ 1 万时启用；
 *   3. 百分比保留一位小数，整数不写 .0。
 */

/** 正文金额：¥1,250,000。 */
export function formatMoney(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return `¥${Math.round(amount).toLocaleString("zh-CN")}`;
}

/**
 * 紧凑金额：空间受限处（漏斗每级、卡片角标）使用。
 * 1 万以下仍给完整数字，避免「¥0.6万」这种反而难读的写法。
 */
export function formatMoneyCompact(amount: number | null | undefined): string {
  if (amount == null) return "—";
  const abs = Math.abs(amount);
  if (abs < 10_000) return `¥${Math.round(amount).toLocaleString("zh-CN")}`;
  if (abs < 100_000_000) {
    return `¥${trimZero(amount / 10_000)}万`;
  }
  return `¥${trimZero(amount / 100_000_000)}亿`;
}

/** 带符号的差额：+¥1,064,000 / -¥20,000。 */
export function formatMoneyDelta(delta: number): string {
  const sign = delta > 0 ? "+" : "−";
  return `${sign}${formatMoney(Math.abs(delta))}`;
}

/** 百分比：一位小数，整数不带 .0（14.5% / 15%）。 */
export function formatPercent(ratio: number): string {
  return `${trimZero(ratio)}%`;
}

/** 去掉无意义的 .0。 */
function trimZero(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
