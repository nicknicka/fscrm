/**
 * 侧边栏统一 SVG 图标集。
 *
 * 所有图标共用同一组度量（24×24 viewBox、线性描边、round 线帽），
 * 视觉重心天然一致，配合外层 `items-center` 才是真正的中心对齐。
 * 颜色继承 `currentColor`，尺寸由 className 控制。
 */

import type { SVGProps } from "react";

const BASE: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className: "h-4 w-4",
  "aria-hidden": true,
};

/** 概览：四宫格仪表盘。 */
export const DashboardIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...BASE} {...props}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

/** 客户：双人。 */
export const CustomersIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...BASE} {...props}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

/** 公海：水域涟漪。 */
export const PublicPoolIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...BASE} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M6.5 11.5c1.1 0 1.1.9 2.2.9s1.1-.9 2.2-.9 1.1.9 2.2.9 1.1-.9 2.2-.9 1.1.9 2.2.9" />
    <path d="M6.5 15.5c1.1 0 1.1.9 2.2.9s1.1-.9 2.2-.9 1.1.9 2.2.9 1.1-.9 2.2-.9 1.1.9 2.2.9" />
  </svg>
);

/** 线索：闪电。 */
export const LeadsIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...BASE} {...props}>
    <path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13l0-8Z" />
  </svg>
);

/** 商机：靶心。 */
export const OpportunitiesIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...BASE} {...props}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

/** 合同：带横线的文件。 */
export const ContractsIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...BASE} {...props}>
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M8 13h8" />
    <path d="M8 17h5" />
  </svg>
);

/** 订单：购物袋。 */
export const OrdersIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...BASE} {...props}>
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
    <path d="M3 6h18" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);

/** 销售漏斗：漏斗形。 */
export const FunnelIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...BASE} {...props}>
    <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3Z" />
  </svg>
);

/** 销售分析：柱状图。 */
export const ChartIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...BASE} {...props}>
    <rect x="3" y="12" width="4" height="9" rx="1" />
    <rect x="10" y="7" width="4" height="14" rx="1" />
    <rect x="17" y="3" width="4" height="18" rx="1" />
  </svg>
);

/** 待办提醒：铃铛。 */
export const RemindersIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...BASE} {...props}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

/** 设置：齿轮。 */
export const SettingsIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...BASE} {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </svg>
);

/** 用户与角色：盾牌对勾。 */
export const UsersRoleIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...BASE} {...props}>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

/** 业绩目标：靶心。 */
export const TargetIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...BASE} {...props}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" />
  </svg>
);

/** 任务与日程：清单。 */
export const TaskIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...BASE} {...props}>
    <path d="M9 6h12M9 12h12M9 18h12" />
    <path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17" />
  </svg>
);

/** 审计日志：文档带勾。 */
export const AuditIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...BASE} {...props}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6M9 15l2 2 4-4" />
  </svg>
);
