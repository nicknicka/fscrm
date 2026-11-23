"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/session";
import { accessScopeFor } from "@/lib/auth/scope";
import { auditWrite } from "@/lib/db/repositories/audit-log";
import {
  createQuotation,
  listQuotations,
  updateQuotation,
  QuotationNotFoundError,
  type QuotationItemInput,
} from "@/lib/db/repositories/quotation";
import { QuotationStatus } from "@/generated/prisma/enums";

/**
 * 报价 Server Actions（#34）。
 *
 * 每个入口从签名会话构造权限范围；越权由仓储层统一拒绝并映射为 NOT_FOUND，
 * 只有成功写入后才刷新商机详情页。
 */

const NOT_FOUND = { ok: false, error: "NOT_FOUND" } as const;
const INVALID_INPUT = { ok: false, error: "INVALID_INPUT" } as const;

function parseStatus(value: FormDataEntryValue | null): QuotationStatus | null {
  const raw = String(value ?? "").trim() || QuotationStatus.DRAFT;
  const values = Object.values(QuotationStatus) as string[];
  return values.includes(raw) ? (raw as QuotationStatus) : null;
}

/** 串行读取条目三个字段；全空表示没有条目，任一不完整或非法都视为无效输入。 */
function parseItems(formData: FormData): QuotationItemInput[] | null {
  const names = formData.getAll("itemName[]");
  const quantities = formData.getAll("itemQuantity[]");
  const prices = formData.getAll("itemUnitPrice[]");
  if (names.length !== quantities.length || names.length !== prices.length) {
    return null;
  }
  if (names.length === 0) return null;

  const items: QuotationItemInput[] = [];
  for (let index = 0; index < names.length; index += 1) {
    const name = String(names[index]).trim();
    const quantityRaw = String(quantities[index]).trim();
    const priceRaw = String(prices[index]).trim();
    if (!name || !quantityRaw || !priceRaw) return null;

    const quantity = Number(quantityRaw);
    const unitPrice = Number(priceRaw);
    if (
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(unitPrice) ||
      unitPrice < 0
    ) {
      return null;
    }
    items.push({ name, quantity, unitPrice });
  }
  return items;
}

/** 成功后刷新商机详情；失败不刷新，避免泄露或展示未变更的数据。 */
function revalidateOpportunity(opportunityId: string): void {
  revalidatePath(`/opportunities/${opportunityId}`);
}

/** 新建报价。客户 ID 由仓储层从商机解析，表单不能指定归属。 */
export async function createQuotationAction(
  opportunityId: string,
  formData: FormData
) {
  const currentUser = await requireCurrentUser();
  const status = parseStatus(formData.get("status"));
  const items = parseItems(formData);
  if (!status || !items) return INVALID_INPUT;

  try {
    const quotation = await createQuotation(
      { opportunityId, status, items },
      accessScopeFor(currentUser)
    );
    await auditWrite(
      currentUser,
      "CREATE",
      "Quotation",
      quotation.id,
      `新建报价（商机 ${opportunityId}）`
    );
    revalidateOpportunity(opportunityId);
    return { ok: true as const, quotationId: quotation.id };
  } catch (error) {
    if (error instanceof QuotationNotFoundError) return NOT_FOUND;
    throw error;
  }
}

/** 编辑报价条目与状态；opportunityId 只用于刷新，不参与写入。 */
export async function updateQuotationAction(
  quotationId: string,
  opportunityId: string,
  formData: FormData
) {
  const currentUser = await requireCurrentUser();
  const status = parseStatus(formData.get("status"));
  const items = parseItems(formData);
  if (!status || !items) return INVALID_INPUT;

  try {
    const quotation = await updateQuotation(
      quotationId,
      { status, items },
      accessScopeFor(currentUser)
    );
    await auditWrite(
      currentUser,
      "UPDATE",
      "Quotation",
      quotation.id,
      `更新报价（商机 ${opportunityId}）`
    );
    revalidateOpportunity(opportunityId);
    return { ok: true as const, quotationId: quotation.id };
  } catch (error) {
    if (error instanceof QuotationNotFoundError) return NOT_FOUND;
    throw error;
  }
}

/** 页面读取接缝：从会话构造权限范围并交给仓储收窄。 */
export async function listQuotationsForCurrentUser(opportunityId: string) {
  const currentUser = await requireCurrentUser();
  return listQuotations(accessScopeFor(currentUser), opportunityId);
}

// ---------------------------------------------------------------------------
// 表单入口：`<form action>` 只接受 (formData) => void 的 Server Action，
// 因此把需要额外参数的调用封装成只用 bind 传参的薄包装，不改变业务逻辑。
// ---------------------------------------------------------------------------

/** 新增报价表单入口。 */
export async function createQuotationFormAction(
  opportunityId: string,
  formData: FormData
): Promise<void> {
  await createQuotationAction(opportunityId, formData);
}

/** 编辑报价表单入口。 */
export async function updateQuotationFormAction(
  quotationId: string,
  opportunityId: string,
  formData: FormData
): Promise<void> {
  await updateQuotationAction(quotationId, opportunityId, formData);
}
