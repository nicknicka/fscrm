"use server";

/**
 * 公海与客户归属相关的 Server Actions。
 *
 * 认领和归属调整都在数据层以原子条件更新完成；页面只提供入口，
 * 不构成安全边界。所有越权、不存在与重复认领统一映射成 NOT_FOUND，
 * 失败返回 `{ ok: false, error: "NOT_FOUND" }`，与单据类 action 的形状一致。
 */

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/session";
import { accessScopeFor, resolveAssignableOwnerId } from "@/lib/auth/scope";
import {
  claimPublicCustomer,
  setCustomerOwner,
  CustomerAccessError,
  CustomerClaimError,
} from "@/lib/db/repositories/customer";
import { getUserById } from "@/lib/db/repositories/user";
import { notifyUser } from "@/lib/feishu/message/notify";

/** 与单据类 action 一致的失败返回形状。 */
const NOT_FOUND = { ok: false, error: "NOT_FOUND" } as const;

/** 客户仓储的越权/不存在/重复认领统一映射为 NOT_FOUND，其他错误照常抛出。 */
function isCustomerAccessError(error: unknown): boolean {
  return error instanceof CustomerAccessError || error instanceof CustomerClaimError;
}

function revalidateCustomerViews(id: string): void {
  revalidatePath("/customers/public-pool");
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
}

/** 负责人认领公海客户；通知失败不影响认领结果。 */
export async function claimPublicCustomerAction(id: string) {
  const currentUser = await requireCurrentUser();
  let claimed;
  try {
    claimed = await claimPublicCustomer(id, accessScopeFor(currentUser));
  } catch (error) {
    if (isCustomerAccessError(error)) {
      // 与单据类 action 同一失败形状；只返回结果、不刷新，页面重新读取时仍是认领前的状态。
      return NOT_FOUND;
    }
    throw error;
  }

  const owner = await getUserById(currentUser.id);
  try {
    await notifyUser(
      owner ? { name: owner.name, feishuOpenId: owner.feishuOpenId } : null,
      "customer_claimed",
      { customerName: claimed.name }
    );
  } catch {
    // 飞书通知失败不影响业务认领
  }

  revalidateCustomerViews(id);
  return { ok: true as const };
}

/** 管理员移入公海或指定负责人；普通负责人提交的值一律归为自己。 */
export async function setCustomerOwnerAction(id: string, formData: FormData) {
  const currentUser = await requireCurrentUser();
  const requestedOwnerId =
    String(formData.get("ownerId") ?? "").trim() || null;
  const ownerId = resolveAssignableOwnerId(
    accessScopeFor(currentUser),
    requestedOwnerId
  );

  try {
    await setCustomerOwner(id, ownerId, accessScopeFor(currentUser));
  } catch (error) {
    if (isCustomerAccessError(error)) return NOT_FOUND;
    throw error;
  }

  revalidateCustomerViews(id);
  return { ok: true as const };
}
