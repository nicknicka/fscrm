import { listAllDepartments, listUsersByDepartment } from "./client";
import { mapDepartment, mapUser } from "./mapping";
import type {
  ContactSyncResult,
  CrmDepartment,
  CrmPerson,
  FeishuDepartment,
  FeishuUser,
} from "./types";

/**
 * 通讯录同步编排。
 *
 * 从飞书拉取部门与用户，映射为 CRM 模型后写入存储，供负责人等业务使用。
 * 数据源与存储均以接口注入，默认使用真实客户端与内存存储，测试时可替换。
 */

/** 通讯录数据源：负责从飞书拉取原始数据。 */
export interface ContactFetcher {
  listAllDepartments(): Promise<FeishuDepartment[]>;
  listUsersByDepartment(departmentId: string): Promise<FeishuUser[]>;
}

/** 通讯录存储：负责写入 CRM 侧的部门与人员。 */
export interface ContactStore {
  /** 写入或更新部门；支持同步或异步实现。 */
  upsertDepartments(departments: CrmDepartment[]): void | Promise<void>;
  /** 写入或更新人员；支持同步或异步实现。 */
  upsertPersons(persons: CrmPerson[]): void | Promise<void>;
}

/** 基于内存的通讯录存储实现（无数据库时使用）。 */
export class InMemoryContactStore implements ContactStore {
  readonly departments = new Map<string, CrmDepartment>();
  readonly persons = new Map<string, CrmPerson>();

  upsertDepartments(departments: CrmDepartment[]): void {
    for (const department of departments) {
      this.departments.set(department.id, department);
    }
  }

  upsertPersons(persons: CrmPerson[]): void {
    for (const person of persons) {
      this.persons.set(person.id, person);
    }
  }
}

/**
 * 同步通讯录。
 *
 * 流程：拉取全部部门 → 映射并写入 → 逐部门拉取用户 → 映射并写入。
 * 以飞书开放 ID 作为人员唯一键，天然去重。
 *
 * @param store 通讯录存储
 * @param fetcher 数据源，默认使用真实飞书客户端
 * @returns 同步结果摘要
 */
export async function syncContacts(
  store: ContactStore,
  fetcher: ContactFetcher = {
    listAllDepartments,
    listUsersByDepartment,
  }
): Promise<ContactSyncResult> {
  const departments = await fetcher.listAllDepartments();
  const crmDepartments = departments
    .map(mapDepartment)
    .filter((department) => department.id);
  await store.upsertDepartments(crmDepartments);

  let personCount = 0;
  if (crmDepartments.length === 0) {
    // 应用未被授予部门可见范围时，按全部用户拉取（不传 department_id）。
    const users = await fetcher.listUsersByDepartment("");
    const persons = users
      .map((user) => mapUser(user))
      .filter((person): person is CrmPerson => person !== null);
    await store.upsertPersons(persons);
    personCount += persons.length;
  } else {
    for (const department of crmDepartments) {
      const users = await fetcher.listUsersByDepartment(department.id);
      const persons = users
        .map((user) => mapUser(user, department.id))
        .filter((person): person is CrmPerson => person !== null);
      await store.upsertPersons(persons);
      personCount += persons.length;
    }
  }

  return {
    departmentCount: crmDepartments.length,
    personCount,
  };
}
