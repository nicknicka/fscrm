"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { createApiKey, revokeApiKey } from "@/lib/api-key";

/** 创建 API Key：返回明文 key（仅此一次），关联当前用户权限。 */
export async function createApiKeyAction(
  _prevState: { plainKey: string; label: string } | null,
  formData: FormData
): Promise<{ plainKey: string; label: string } | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const label = String(formData.get("label") ?? "").trim();
  const result = await createApiKey(label || "未命名 API Key", user.id);
  revalidatePath("/settings/api-keys");
  return { plainKey: result.plainKey, label: result.label };
}

/** 吊销 API Key（表单 void 入口）。 */
export async function revokeApiKeyFormAction(id: string, _formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  await revokeApiKey(id, user);
  revalidatePath("/settings/api-keys");
}
