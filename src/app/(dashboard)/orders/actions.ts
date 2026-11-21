"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/session";
import { accessScopeFor } from "@/lib/auth/scope";
import {
  convertContractToOrder,
  getOrder,
  listOrders,
  OrderNotFoundError,
} from "@/lib/db/repositories/order";

/**
 * 订单 Server Actions（#36）。
 *
 * 每个入口从签名会话构造权限范围；越权与重复转换由订单服务统一拒绝并映射为 NOT_FOUND，
 * 只有成功转化后才刷新来源商机、合同页面与订单列表/详情。
 */

const NOT_FOUND = { ok: false, error: "NOT_FOUND" } as const;

/** 成功后刷新来源商机、合同与订单页面；失败不刷新，避免展示未变更的数据。 */
function revalidateOrderViews(
  contractId: string,
  opportunityId: string,
  orderId: string
) {
  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
}

/**
 * 把合同转为订单。opportunityId 只用于刷新来源商机页，
 * 订单关联从合同读取，表单无法伪造归属。
 */
export async function convertContractToOrderAction(
  contractId: string,
  opportunityId: string
) {
  const currentUser = await requireCurrentUser();

  try {
    const order = await convertContractToOrder(
      contractId,
      accessScopeFor(currentUser)
    );
    revalidateOrderViews(contractId, opportunityId, order.id);
    return { ok: true as const, orderId: order.id };
  } catch (error) {
    if (error instanceof OrderNotFoundError) return NOT_FOUND;
    throw error;
  }
}

/** 页面读取接缝：从会话构造权限范围并交给订单服务收窄。 */
export async function listOrdersForCurrentUser() {
  const currentUser = await requireCurrentUser();
  return listOrders(accessScopeFor(currentUser));
}

/** 详情读取接缝：越权与不存在由服务统一返回 null，页面按 notFound 处理。 */
export async function getOrderForCurrentUser(id: string) {
  const currentUser = await requireCurrentUser();
  return getOrder(id, accessScopeFor(currentUser));
}
