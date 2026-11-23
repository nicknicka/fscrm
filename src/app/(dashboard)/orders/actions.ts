"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/session";
import { accessScopeFor } from "@/lib/auth/scope";
import {
  InvalidOrderTransitionError,
  parseOrderStatus,
} from "@/lib/order-status";
import { auditWrite } from "@/lib/db/repositories/audit-log";
import {
  convertContractToOrder,
  countOrdersForPage,
  getOrder,
  listOrders,
  OrderNotFoundError,
  transitionOrderStatus,
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
export async function listOrdersForCurrentUser(
  pagination: { skip?: number; take?: number } = {}
) {
  const currentUser = await requireCurrentUser();
  return listOrders(accessScopeFor(currentUser), pagination);
}

/** 订单分页计数：与列表共用权限口径。 */
export async function countOrdersForCurrentUser() {
  const currentUser = await requireCurrentUser();
  return countOrdersForPage(accessScopeFor(currentUser));
}

/** 详情读取接缝：越权与不存在由服务统一返回 null，页面按 notFound 处理。 */
export async function getOrderForCurrentUser(id: string) {
  const currentUser = await requireCurrentUser();
  return getOrder(id, accessScopeFor(currentUser));
}

/** 转为订单的表单入口：`<form action>` 需要 (formData) => void 的 Server Action 引用。 */
export async function convertContractToOrderFormAction(
  contractId: string,
  opportunityId: string,
  _formData: FormData
): Promise<void> {
  await convertContractToOrderAction(contractId, opportunityId);
}

/** 订单状态流转结果：失败时返回稳定错误码，不泄露订单存在性。 */
type TransitionResult =
  | { ok: true; status: string }
  | { ok: false; error: "NOT_FOUND" | "INVALID_INPUT" | "INVALID_TRANSITION" };

/**
 * 推进订单状态。目标状态来自表单，但合法性由状态机 + 仓储事务双重校验；
 * 成功后刷新订单列表与详情。
 */
export async function transitionOrderStatusAction(
  id: string,
  formData: FormData
): Promise<TransitionResult> {
  const target = parseOrderStatus(formData.get("status"));
  if (!target) return { ok: false, error: "INVALID_INPUT" };

  const currentUser = await requireCurrentUser();
  try {
    const order = await transitionOrderStatus(
      id,
      target,
      accessScopeFor(currentUser)
    );
    revalidatePath("/orders");
    revalidatePath(`/orders/${id}`);
    await auditWrite(
      currentUser,
      "UPDATE",
      "Order",
      id,
      `状态更新为 ${order.status}`
    );
    return { ok: true, status: order.status };
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return { ok: false, error: "NOT_FOUND" };
    }
    if (error instanceof InvalidOrderTransitionError) {
      return { ok: false, error: "INVALID_TRANSITION" };
    }
    throw error;
  }
}

/**
 * 表单专用的状态流转入口：`<form action>` 要求返回 void。
 * 业务结果由 transitionOrderStatusAction 承载；这里只丢弃返回值。
 */
export async function transitionOrderStatusFormAction(
  id: string,
  _formData: FormData
): Promise<void> {
  await transitionOrderStatusAction(id, _formData);
}
