import { describe, expect, it } from "vitest";
import { InMemoryContactStore, syncContacts } from "./sync";
import type { ContactFetcher } from "./sync";
import type { FeishuDepartment, FeishuUser } from "./types";

describe("syncContacts", () => {
  it("拉取部门与用户，映射后写入存储", async () => {
    const departments: FeishuDepartment[] = [
      { departmentId: "od_1", name: "销售部", parentDepartmentId: "0" },
      { departmentId: "od_2", name: "华东", parentDepartmentId: "od_1" },
    ];
    const usersByDepartment: Record<string, FeishuUser[]> = {
      od_1: [
        { openId: "ou_1", name: "张三", mobile: "138" },
        { openId: "ou_2", name: "李四", mobile: "139" },
      ],
      od_2: [{ openId: "ou_3", name: "王五", mobile: "137" }],
    };

    const fetcher: ContactFetcher = {
      listAllDepartments: async () => departments,
      listUsersByDepartment: async (departmentId) =>
        usersByDepartment[departmentId] ?? [],
    };
    const store = new InMemoryContactStore();

    const result = await syncContacts(store, fetcher);

    expect(result.departmentCount).toBe(2);
    expect(result.personCount).toBe(3);
    expect(store.departments.size).toBe(2);
    expect(store.persons.size).toBe(3);
    expect(store.persons.get("ou_1")?.departmentId).toBe("od_1");
    expect(store.persons.get("ou_3")?.departmentId).toBe("od_2");
  });

  it("用户缺少开放 ID 时被跳过", async () => {
    const departments: FeishuDepartment[] = [
      { departmentId: "od_1", name: "销售部", parentDepartmentId: "0" },
    ];
    const users: FeishuUser[] = [
      { openId: "ou_1", name: "有效", mobile: "138" },
      { name: "无效", mobile: "139" },
    ];

    const fetcher: ContactFetcher = {
      listAllDepartments: async () => departments,
      listUsersByDepartment: async () => users,
    };
    const store = new InMemoryContactStore();

    const result = await syncContacts(store, fetcher);

    expect(result.personCount).toBe(1);
    expect(store.persons.has("ou_1")).toBe(true);
    expect(store.persons.size).toBe(1);
  });

  it("同一开放 ID 在多个部门出现时去重，保留先写入的", async () => {
    const departments: FeishuDepartment[] = [
      { departmentId: "od_1", name: "A部", parentDepartmentId: "0" },
      { departmentId: "od_2", name: "B部", parentDepartmentId: "0" },
    ];
    const sameUser: FeishuUser = {
      openId: "ou_1",
      name: "张三",
      mobile: "138",
    };

    const fetcher: ContactFetcher = {
      listAllDepartments: async () => departments,
      listUsersByDepartment: async (departmentId) =>
        departmentId === "od_1" ? [sameUser] : [],
    };
    const store = new InMemoryContactStore();

    const result = await syncContacts(store, fetcher);

    expect(result.personCount).toBe(1);
    expect(store.persons.size).toBe(1);
  });
});
