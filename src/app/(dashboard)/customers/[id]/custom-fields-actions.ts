"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { accessScopeFor } from "@/lib/auth/scope";
import { saveCustomerCustomFields } from "@/lib/db/repositories/customer";
import {
  CUSTOMER_FIELD_DEFINITIONS,
  normalizeCustomFields,
} from "@/lib/custom-fields";

/** 保存客户自定义字段：只接受目录内 key，其余忽略。 */
export async function saveCustomerCustomFieldsAction(
  id: string,
  formData: FormData
) {
  const user = await getCurrentUser();
  if (!user) return;

  const raw: Record<string, string> = {};
  for (const def of CUSTOMER_FIELD_DEFINITIONS) {
    const value = String(formData.get(`cf_${def.key}`) ?? "").trim();
    if (value) raw[def.key] = value;
  }
  await saveCustomerCustomFields(
    id,
    normalizeCustomFields(raw),
    accessScopeFor(user)
  );
  revalidatePath(`/customers/${id}`);
}
