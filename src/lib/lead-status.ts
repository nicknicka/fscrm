import { LeadStatus } from "@/generated/prisma/enums";

/**
 * 线索状态的中文名与徽章色调。
 *
 * 线索在 /leads 页面和商机页的「线索」视图里都要显示，两处共用这一份，
 * 避免状态名在界面上出现两种写法。
 */
export const LEAD_STATUS_META: Record<
  string,
  { label: string; tone: "blue" | "amber" | "green" | "zinc" }
> = {
  [LeadStatus.NEW]: { label: "新线索", tone: "blue" },
  [LeadStatus.FOLLOWING]: { label: "跟进中", tone: "amber" },
  [LeadStatus.CONVERTED]: { label: "已转化", tone: "green" },
  [LeadStatus.INVALID]: { label: "无效", tone: "zinc" },
};

/** 状态下拉的选项：顺序与枚举声明一致，界面读得出培育路径。 */
export const LEAD_STATUS_OPTIONS = Object.entries(LEAD_STATUS_META).map(
  ([value, meta]) => ({ value, label: meta.label })
);

/** 取某个状态的展示信息；未知状态退回「新线索」，不渲染空白徽章。 */
export function leadStatusMeta(status: string) {
  return LEAD_STATUS_META[status] ?? LEAD_STATUS_META[LeadStatus.NEW];
}
