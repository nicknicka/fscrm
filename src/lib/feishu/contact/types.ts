/**
 * 飞书通讯录与 CRM 人员模型的类型定义。
 */

/** 飞书部门（通讯录）。 */
export interface FeishuDepartment {
  /** 部门 ID（如 `od-xxx`）。 */
  departmentId: string;
  /** 开放部门 ID（如 `od-xxx` 的 open 形式）。 */
  openDepartmentId?: string;
  /** 部门名称。 */
  name: string;
  /** 父部门 ID，根部门为 `0`。 */
  parentDepartmentId: string;
  /** 部门负责人用户 ID。 */
  leaderUserId?: string;
  /** 部门成员数量。 */
  memberCount?: number;
}

/** 飞书用户（通讯录）。 */
export interface FeishuUser {
  /** 联合 ID，跨应用唯一。 */
  unionId?: string;
  /** 用户 ID，应用内唯一。 */
  userId?: string;
  /** 开放 ID，跨应用唯一。 */
  openId?: string;
  /** 用户姓名。 */
  name: string;
  /** 昵称。 */
  nickname?: string;
  /** 邮箱。 */
  email?: string;
  /** 手机号。 */
  mobile: string;
}

/** CRM 部门（由飞书部门映射而来）。 */
export interface CrmDepartment {
  /** CRM 内部 ID。 */
  id: string;
  /** 飞书部门 ID，用于回溯与增量同步。 */
  feishuDepartmentId: string;
  /** 飞书开放部门 ID。 */
  openDepartmentId?: string;
  /** 部门名称。 */
  name: string;
  /** 父部门在 CRM 中的 ID。 */
  parentId?: string;
}

/**
 * CRM 用户角色。
 *
 * 与 Prisma `UserRole` 对齐；通讯录同步的新用户只使用普通负责人。
 */
export type CrmUserRole = "OWNER" | "ADMIN";

/** CRM 人员（由飞书用户映射而来，可作为负责人数据源）。 */
export interface CrmPerson {
  /** CRM 内部 ID。 */
  id: string;
  /** 飞书开放 ID，用于匹配飞书用户。 */
  feishuOpenId: string;
  /** 飞书联合 ID。 */
  feishuUnionId?: string;
  /** 飞书用户 ID。 */
  feishuUserId?: string;
  /** 姓名。 */
  name: string;
  /** 角色；通讯录同步默认普通负责人，不自动提升为管理员。 */
  role: CrmUserRole;
  /** 邮箱。 */
  email?: string;
  /** 所属部门在 CRM 中的 ID。 */
  departmentId?: string;
}

/** 通讯录同步结果摘要。 */
export interface ContactSyncResult {
  /** 同步的部门数量。 */
  departmentCount: number;
  /** 同步的人员数量。 */
  personCount: number;
}
