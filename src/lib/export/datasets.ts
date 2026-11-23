/**
 * 列表导出的数据集注册：每种实体定义「取数（按当前用户权限收窄）」与 CSV 列。
 *
 * 关键原则：导出复用与列表页相同的仓储函数，权限口径完全一致，
 * 不另开一条查询路径，避免越权导出。
 */
import { accessScopeFor } from "@/lib/auth/scope";
import type { CurrentUser } from "@/lib/auth/session";
import { listCustomers } from "@/lib/db/repositories/customer";
import { listContracts } from "@/lib/db/repositories/contract";
import { listOrders } from "@/lib/db/repositories/order";
import {
  listLeads,
  listOpportunities,
  listFollowUps,
} from "@/lib/db/repositories/sales";
import { customerLifecycleLabel } from "@/lib/customer-lifecycle";
import type { CsvColumn } from "./csv";
import type { ExportDataset } from "./types";

/** 单个数据集的加载器：按当前用户权限取全部可见行。 */
type DatasetLoader = (user: CurrentUser) => Promise<{
  rows: unknown[];
  columns: CsvColumn<never>[];
}>;

/** 统一的取数：全部数据集都走仓储层的 scope 收窄。 */
const loaders: Record<ExportDataset, DatasetLoader> = {
  customers: async (user) => {
    const rows = await listCustomers({}, accessScopeFor(user));
    return { rows, columns: customerColumns as CsvColumn<never>[] };
  },
  leads: async (user) => {
    const rows = await listLeads({}, accessScopeFor(user));
    return { rows, columns: leadColumns as CsvColumn<never>[] };
  },
  opportunities: async (user) => {
    const rows = await listOpportunities({}, user);
    return { rows, columns: opportunityColumns as CsvColumn<never>[] };
  },
  followups: async (user) => {
    const rows = await listFollowUps({}, user);
    return { rows, columns: followUpColumns as CsvColumn<never>[] };
  },
  contracts: async (user) => {
    const rows = await listContracts(accessScopeFor(user));
    return { rows, columns: contractColumns as CsvColumn<never>[] };
  },
  orders: async (user) => {
    const rows = await listOrders(accessScopeFor(user));
    return { rows, columns: orderColumns as CsvColumn<never>[] };
  },
};

/** 导出指定数据集：返回列定义与数据行。 */
export async function loadExportDataset(
  user: CurrentUser,
  dataset: ExportDataset
) {
  return loaders[dataset](user);
}

// --- 列定义 -------------------------------------------------------------

const customerColumns: CsvColumn<{
  name: string;
  level: string;
  lifecycle: string;
  industry: string | null;
  phone: string | null;
  email: string | null;
  owner?: { name: string } | null;
  createdAt: Date;
}>[] = [
  { header: "客户名称", value: (r) => r.name },
  { header: "等级", value: (r) => r.level },
  {
    header: "生命周期",
    value: (r) =>
      customerLifecycleLabel[
        r.lifecycle as keyof typeof customerLifecycleLabel
      ] ?? r.lifecycle,
  },
  { header: "行业", value: (r) => r.industry },
  { header: "电话", value: (r) => r.phone },
  { header: "邮箱", value: (r) => r.email },
  { header: "负责人", value: (r) => r.owner?.name ?? "" },
  { header: "创建时间", value: (r) => r.createdAt.toISOString() },
];

const leadColumns: CsvColumn<{
  name: string;
  source: string | null;
  status: string;
  contactPhone: string | null;
  contactEmail: string | null;
  owner?: { name: string } | null;
  createdAt: Date;
}>[] = [
  { header: "线索名称", value: (r) => r.name },
  { header: "来源", value: (r) => r.source },
  { header: "状态", value: (r) => r.status },
  { header: "电话", value: (r) => r.contactPhone },
  { header: "邮箱", value: (r) => r.contactEmail },
  { header: "负责人", value: (r) => r.owner?.name ?? "" },
  { header: "创建时间", value: (r) => r.createdAt.toISOString() },
];

const opportunityColumns: CsvColumn<{
  name: string;
  customer: { name: string };
  stage: string;
  amount: number | null;
  owner?: { name: string } | null;
  createdAt: Date;
}>[] = [
  { header: "商机名称", value: (r) => r.name },
  { header: "客户", value: (r) => r.customer.name },
  { header: "阶段", value: (r) => r.stage },
  { header: "预计金额", value: (r) => r.amount },
  { header: "负责人", value: (r) => r.owner?.name ?? "" },
  { header: "创建时间", value: (r) => r.createdAt.toISOString() },
];

const followUpColumns: CsvColumn<{
  mode: string;
  content: string;
  nextFollowUpAt: Date | null;
  customer?: { name: string } | null;
  opportunity?: { name: string } | null;
  owner?: { name: string } | null;
  createdAt: Date;
}>[] = [
  { header: "方式", value: (r) => r.mode },
  { header: "内容", value: (r) => r.content },
  { header: "下一步时间", value: (r) => r.nextFollowUpAt?.toISOString() ?? "" },
  { header: "客户", value: (r) => r.customer?.name ?? "" },
  { header: "商机", value: (r) => r.opportunity?.name ?? "" },
  { header: "记录人", value: (r) => r.owner?.name ?? "" },
  { header: "创建时间", value: (r) => r.createdAt.toISOString() },
];

const contractColumns: CsvColumn<{
  customer: { name: string };
  opportunity: { name: string };
  amount: number;
  status: string;
  sourceQuotation: { id: string };
  createdAt: Date;
}>[] = [
  { header: "客户", value: (r) => r.customer.name },
  { header: "商机", value: (r) => r.opportunity.name },
  { header: "金额", value: (r) => r.amount },
  { header: "状态", value: (r) => r.status },
  { header: "来源报价ID", value: (r) => r.sourceQuotation.id },
  { header: "创建时间", value: (r) => r.createdAt.toISOString() },
];

const orderColumns: CsvColumn<{
  customer: { name: string };
  opportunity: { name: string };
  amount: number;
  status: string;
  sourceContract: { id: string };
  createdAt: Date;
}>[] = [
  { header: "客户", value: (r) => r.customer.name },
  { header: "商机", value: (r) => r.opportunity.name },
  { header: "金额", value: (r) => r.amount },
  { header: "状态", value: (r) => r.status },
  { header: "来源合同ID", value: (r) => r.sourceContract.id },
  { header: "创建时间", value: (r) => r.createdAt.toISOString() },
];
