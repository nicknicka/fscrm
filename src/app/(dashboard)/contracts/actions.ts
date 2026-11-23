"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/session";
import { accessScopeFor } from "@/lib/auth/scope";
import {
  ContractNotFoundError,
  convertQuotationToContract,
  countContractsForPage,
  getContract,
  listContracts,
} from "@/lib/db/repositories/contract";

/**
 * 合同 Server Actions（#35）。
 *
 * 每个入口从签名会话构造权限范围；越权由合同服务统一拒绝并映射为 NOT_FOUND，
 * 只有成功转化后才刷新报价所属商机页与合同列表/详情。
 */

const NOT_FOUND = { ok: false, error: "NOT_FOUND" } as const;

/** 成功后刷新来源商机与合同页面；失败不刷新，避免展示未变更的数据。 */
function revalidateContractViews(contractId: string, opportunityId: string) {
  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath("/contracts");
  revalidatePath(`/contracts/${contractId}`);
}

/**
 * 把报价转为合同。opportunityId 只用于刷新来源商机页，
 * 合同关联从报价读取，表单无法伪造归属。
 */
export async function convertQuotationToContractAction(
  quotationId: string,
  opportunityId: string
) {
  const currentUser = await requireCurrentUser();

  try {
    const contract = await convertQuotationToContract(
      quotationId,
      accessScopeFor(currentUser)
    );
    revalidateContractViews(contract.id, opportunityId);
    return { ok: true as const, contractId: contract.id };
  } catch (error) {
    if (error instanceof ContractNotFoundError) return NOT_FOUND;
    throw error;
  }
}

/** 页面读取接缝：从会话构造权限范围并交给合同服务收窄。 */
export async function listContractsForCurrentUser(
  pagination: { skip?: number; take?: number } = {}
) {
  const currentUser = await requireCurrentUser();
  return listContracts(accessScopeFor(currentUser), pagination);
}

/** 合同分页计数：与列表共用权限口径。 */
export async function countContractsForCurrentUser() {
  const currentUser = await requireCurrentUser();
  return countContractsForPage(accessScopeFor(currentUser));
}

/** 详情读取接缝：越权与不存在由服务统一返回 null，页面按 notFound 处理。 */
export async function getContractForCurrentUser(id: string) {
  const currentUser = await requireCurrentUser();
  return getContract(id, accessScopeFor(currentUser));
}

/**
 * 转为合同表单入口：`<form action>` 需要 (formData) => void 的签名，
 * 这里只做参数绑定与返回类型适配，转换逻辑仍在 convertQuotationToContract。
 */
export async function convertQuotationToContractFormAction(
  quotationId: string,
  opportunityId: string,
  _formData: FormData
): Promise<void> {
  await convertQuotationToContractAction(quotationId, opportunityId);
}
