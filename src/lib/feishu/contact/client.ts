import { getFeishuClient } from "../client";
import type { FeishuDepartment, FeishuUser } from "./types";

/**
 * 飞书通讯录客户端封装。
 *
 * 包装部门与用户的列表接口，自动处理分页（page_token），
 * 返回归一化后的完整列表，便于上层同步逻辑使用。
 */

/** 飞书接口通用响应结构。 */
interface FeishuResponse<T> {
  code?: number;
  msg?: string;
  data?: T;
}

/** 飞书分页数据结构。 */
interface FeishuPageData<T> {
  has_more?: boolean;
  page_token?: string;
  items?: T[];
}

/** 拉取一页部门数据。 */
async function fetchDepartmentPage(
  pageToken?: string
): Promise<FeishuResponse<FeishuPageData<Record<string, unknown>>>> {
  const client = getFeishuClient();
  // 不传 parent_department_id：飞书仅返回应用通讯录权限范围内的部门。
  // 若传 "0" 会触发全员权限校验，应用未被授予全员范围时返回 40004。
  return client.contact.department.list({
    params: {
      fetch_child: true,
      page_size: 50,
      page_token: pageToken,
    },
  });
}

/**
 * 拉取全部部门（自动分页）。
 *
 * 以根部门（`0`）为起点递归获取，归一化为 `FeishuDepartment`。
 */
export async function listAllDepartments(): Promise<FeishuDepartment[]> {
  const departments: FeishuDepartment[] = [];
  let pageToken: string | undefined;

  do {
    const response = await fetchDepartmentPage(pageToken);
    const data = response.data;
    const items = data?.items ?? [];
    for (const item of items) {
      departments.push({
        departmentId: (item.department_id ?? item.open_department_id) as string,
        openDepartmentId: item.open_department_id as string | undefined,
        name: item.name as string,
        parentDepartmentId: item.parent_department_id as string,
        leaderUserId: item.leader_user_id as string | undefined,
        memberCount: item.member_count as number | undefined,
      });
    }
    pageToken = data?.has_more ? data?.page_token : undefined;
  } while (pageToken);

  return departments;
}

/** 拉取指定部门的用户（一页）。 */
async function fetchUserPage(
  departmentId: string,
  pageToken?: string
): Promise<FeishuResponse<FeishuPageData<Record<string, unknown>>>> {
  const client = getFeishuClient();
  // departmentId 为空时不传 department_id，返回应用权限范围内的全部用户。
  const params: Record<string, string | number | undefined> = {
    page_size: 50,
    page_token: pageToken,
  };
  if (departmentId) {
    params.department_id = departmentId;
  }
  return client.contact.user.list({ params });
}

/**
 * 拉取指定部门下的全部用户（自动分页）。
 */
export async function listUsersByDepartment(
  departmentId: string
): Promise<FeishuUser[]> {
  const users: FeishuUser[] = [];
  let pageToken: string | undefined;

  do {
    const response = await fetchUserPage(departmentId, pageToken);
    const data = response.data;
    const items = data?.items ?? [];
    for (const item of items) {
      users.push({
        unionId: item.union_id as string | undefined,
        userId: item.user_id as string | undefined,
        openId: item.open_id as string | undefined,
        name: item.name as string,
        nickname: item.nickname as string | undefined,
        email: item.email as string | undefined,
        mobile: item.mobile as string,
      });
    }
    pageToken = data?.has_more ? data?.page_token : undefined;
  } while (pageToken);

  return users;
}

/** 获取单个用户详情。 */
export async function getUser(userId: string): Promise<FeishuUser | null> {
  const client = getFeishuClient();
  const response = await client.contact.user.get({
    path: { user_id: userId },
  });
  const user = response.data?.user;
  if (!user) {
    return null;
  }
  return {
    unionId: user.union_id as string | undefined,
    userId: user.user_id as string | undefined,
    openId: user.open_id as string | undefined,
    name: (user.name ?? "") as string,
    nickname: user.nickname as string | undefined,
    email: user.email as string | undefined,
    mobile: (user.mobile ?? "") as string,
  };
}
