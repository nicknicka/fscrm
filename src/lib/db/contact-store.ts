import { prisma } from "./client";
import type { ContactStore } from "../feishu/contact/sync";
import type { CrmDepartment, CrmPerson } from "../feishu/contact/types";

/**
 * 基于 Prisma/Postgres 的通讯录存储。
 *
 * 把飞书通讯录同步出的部门与人员持久化到 `departments` / `users` 表，
 * 按飞书 ID 做 upsert，重复同步不会产生重复数据。
 */
export class DbContactStore implements ContactStore {
  /** 写入或更新部门，返回 CRM 部门 ID（飞书部门 ID → CRM UUID）。 */
  private async upsertDepartment(department: CrmDepartment): Promise<string> {
    const record = await prisma.department.upsert({
      where: { feishuDepartmentId: department.feishuDepartmentId },
      update: {
        name: department.name,
        openDepartmentId: department.openDepartmentId ?? null,
        parentId: department.parentId ?? null,
        leaderFeishuUserId: null,
        memberCount: null,
      },
      create: {
        feishuDepartmentId: department.feishuDepartmentId,
        name: department.name,
        openDepartmentId: department.openDepartmentId ?? null,
        parentId: department.parentId ?? null,
      },
    });
    return record.id;
  }

  async upsertDepartments(departments: CrmDepartment[]): Promise<void> {
    for (const department of departments) {
      await this.upsertDepartment(department);
    }
  }

  async upsertPersons(persons: CrmPerson[]): Promise<void> {
    for (const person of persons) {
      // 先解析部门：CrmPerson.departmentId 此时是飞书部门 ID
      let departmentDbId: string | null = null;
      if (person.departmentId) {
        const dept = await prisma.department.findUnique({
          where: { feishuDepartmentId: person.departmentId },
        });
        departmentDbId = dept?.id ?? null;
      }

      await prisma.user.upsert({
        where: { feishuOpenId: person.feishuOpenId },
        update: {
          name: person.name,
          email: person.email ?? null,
          feishuUnionId: person.feishuUnionId ?? null,
          feishuUserId: person.feishuUserId ?? null,
          departmentId: departmentDbId,
        },
        create: {
          name: person.name,
          email: person.email ?? null,
          feishuOpenId: person.feishuOpenId,
          feishuUnionId: person.feishuUnionId ?? null,
          feishuUserId: person.feishuUserId ?? null,
          departmentId: departmentDbId,
          // 通讯录同步只创建普通负责人；管理员角色由显式授权赋予。
          // CrmPerson.role 必填，无需再按缺省兜底。
          role: person.role,
        },
      });
    }
  }
}
