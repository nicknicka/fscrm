/** 导出数据集的常量定义：无任何运行时依赖，供服务端与组件共用。 */

export const EXPORT_DATASETS = [
  "customers",
  "leads",
  "opportunities",
  "followups",
  "contracts",
  "orders",
] as const;

export type ExportDataset = (typeof EXPORT_DATASETS)[number];

export function isExportDataset(value: string): value is ExportDataset {
  return (EXPORT_DATASETS as readonly string[]).includes(value);
}

/** 数据集展示名，用于文件名与按钮。 */
export const EXPORT_LABELS: Record<ExportDataset, string> = {
  customers: "客户",
  leads: "线索",
  opportunities: "商机",
  followups: "跟进记录",
  contracts: "合同",
  orders: "订单",
};
