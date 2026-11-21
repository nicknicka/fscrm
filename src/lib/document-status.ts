import {
  ContractStatus,
  OrderStatus,
  QuotationStatus,
} from "@/generated/prisma/enums";

/**
 * 单据状态的中文展示名，供单据列表与详情页共用。
 *
 * 报价、合同、订单的状态取值来自生成的 Prisma 枚举，这里只补齐展示文案；
 * 页面不再各自维护一份，避免同一状态在不同页面出现不同说法。
 */

/** 报价状态的展示名。 */
export const quotationStatusLabel: Record<QuotationStatus, string> = {
  [QuotationStatus.DRAFT]: "草稿",
  [QuotationStatus.CONFIRMED]: "已确认",
  [QuotationStatus.CANCELLED]: "已取消",
};

/** 合同状态的展示名。 */
export const contractStatusLabel: Record<ContractStatus, string> = {
  [ContractStatus.DRAFT]: "草稿",
  [ContractStatus.EFFECTIVE]: "生效",
  [ContractStatus.VOID]: "作废",
};

/** 订单状态的展示名。 */
export const orderStatusLabel: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: "待履约",
  [OrderStatus.FULFILLING]: "履约中",
  [OrderStatus.COMPLETED]: "已完成",
  [OrderStatus.CANCELLED]: "已取消",
};
