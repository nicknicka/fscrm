/** 客户自定义字段目录（先覆盖客户）：key -> 展示名。新增字段在目录里加一项即可。 */
export const CUSTOMER_FIELD_DEFINITIONS = [
  { key: "source", label: "客户来源" },
  { key: "budget", label: "预算范围" },
  { key: "priority", label: "优先级" },
  { key: "region", label: "所在区域" },
] as const;

export type CustomerFieldKey =
  (typeof CUSTOMER_FIELD_DEFINITIONS)[number]["key"];

/** 把数据库中任意 JSON 值规整为 key -> 字符串 的自定义字段对象。 */
export function normalizeCustomFields(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  const allowed = new Set<string>(CUSTOMER_FIELD_DEFINITIONS.map((d) => d.key));
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (
      allowed.has(key) &&
      (typeof raw === "string" || typeof raw === "number")
    ) {
      const text = String(raw).trim();
      if (text) result[key] = text;
    }
  }
  return result;
}
