import type {
  CrmDepartment,
  CrmPerson,
  FeishuDepartment,
  FeishuUser,
} from "./types";

/**
 * 飞书通讯录数据到 CRM 模型的映射。
 *
 * 映射保持纯函数、无副作用，便于单测，也便于未来更换数据源。
 */

/**
 * 将飞书部门映射为 CRM 部门。
 *
 * CRM 部门 ID 直接采用飞书部门 ID，便于回溯与增量同步。
 */
export function mapDepartment(department: FeishuDepartment): CrmDepartment {
  return {
    id: department.departmentId,
    feishuDepartmentId: department.departmentId,
    openDepartmentId: department.openDepartmentId,
    name: department.name,
    parentId:
      department.parentDepartmentId && department.parentDepartmentId !== "0"
        ? department.parentDepartmentId
        : undefined,
  };
}

/**
 * 将飞书用户映射为 CRM 人员。
 *
 * 以飞书开放 ID 作为匹配键；部门 ID 由调用方传入。
 */
export function mapUser(
  user: FeishuUser,
  departmentId?: string
): CrmPerson | null {
  if (!user.openId) {
    // 缺少开放 ID 无法稳定匹配，跳过
    return null;
  }
  return {
    id: user.openId,
    feishuOpenId: user.openId,
    feishuUnionId: user.unionId,
    feishuUserId: user.userId,
    name: user.name,
    email: user.email,
    departmentId,
    role: "OWNER",
  };
}
