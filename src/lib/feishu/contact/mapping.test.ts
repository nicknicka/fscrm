import { describe, expect, it } from "vitest";
import { mapDepartment, mapUser } from "./mapping";
import type { FeishuUser } from "./types";

describe("mapDepartment", () => {
  it("映射为 CRM 部门，根部门的父级为 undefined", () => {
    const department = mapDepartment({
      departmentId: "od_1",
      openDepartmentId: "od_1",
      name: "销售部",
      parentDepartmentId: "0",
    });
    expect(department).toEqual({
      id: "od_1",
      feishuDepartmentId: "od_1",
      openDepartmentId: "od_1",
      name: "销售部",
      parentId: undefined,
    });
  });

  it("非根部门保留父部门 ID", () => {
    const department = mapDepartment({
      departmentId: "od_2",
      name: "华东大区",
      parentDepartmentId: "od_1",
    });
    expect(department.parentId).toBe("od_1");
  });
});

describe("mapUser", () => {
  const user: FeishuUser = {
    unionId: "on_1",
    userId: "u_1",
    openId: "ou_1",
    name: "张三",
    email: "zhangsan@example.com",
    mobile: "13800000000",
  };

  it("映射为 CRM 人员并保留部门 ID", () => {
    const person = mapUser(user, "od_1");
    expect(person).toEqual({
      id: "ou_1",
      feishuOpenId: "ou_1",
      feishuUnionId: "on_1",
      feishuUserId: "u_1",
      name: "张三",
      email: "zhangsan@example.com",
      departmentId: "od_1",
      role: "OWNER",
    });
  });

  it("通讯录同步的新用户默认按普通负责人处理", () => {
    const person = mapUser(user, "od_1");
    expect(person?.role).toBe("OWNER");
    expect(person?.role).not.toBe("ADMIN");
  });

  it("缺少开放 ID 时返回 null", () => {
    const invalid: FeishuUser = {
      name: "无ID用户",
      mobile: "13800000000",
    };
    expect(mapUser(invalid)).toBeNull();
  });
});
