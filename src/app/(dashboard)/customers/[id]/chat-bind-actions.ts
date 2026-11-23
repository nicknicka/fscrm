"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/session";
import { accessScopeFor } from "@/lib/auth/scope";
import { prisma } from "@/lib/db/client";
import { getCustomer } from "@/lib/db/repositories/customer";

/**
 * 群绑定：把飞书群关联到客户。
 *
 * 用途：在群里 @机器人 记跟进时，客户上下文能自动带出来，销售不用每次念公司名。
 *
 * 权限：只能给「自己可见」的客户绑定（复用 `getCustomer` 的作用域校验），
 * 绑定本身不授予任何数据访问权——它只是一条记忆，不是权限凭据。
 */

export interface BindChatResult {
  ok: boolean;
  message: string;
}

/** 绑定：写入或更新 chatId → customerId 的映射。 */
export async function bindChatToCustomerAction(
  customerId: string,
  formData: FormData
): Promise<BindChatResult> {
  const user = await requireCurrentUser();
  const chatId = String(formData.get("chatId") ?? "").trim();

  if (!chatId) {
    return { ok: false, message: "请填写飞书群 ID。" };
  }
  // 飞书的群 ID 以 oc_ 开头；这里做基本格式校验，避免把单聊 ID 误填进来
  if (!/^oc_[A-Za-z0-9_-]+$/.test(chatId)) {
    return {
      ok: false,
      message:
        "群 ID 格式不对：飞书群 ID 以 oc_ 开头，可从群设置或事件日志里取到。",
    };
  }

  const customer = await getCustomer(customerId, accessScopeFor(user));
  if (!customer) {
    return { ok: false, message: "未找到该客户，或它不是由你负责的。" };
  }

  await prisma.chatBinding.upsert({
    where: { chatId },
    create: { chatId, customerId: customer.id, boundByUserId: user.id },
    update: { customerId: customer.id, boundByUserId: user.id },
  });

  revalidatePath(`/customers/${customerId}`);
  return {
    ok: true,
    message: `已绑定，之后在群里 @机器人 记跟进会自动带出「${customer.name}」。`,
  };
}

/** 解绑。 */
export async function unbindChatAction(
  customerId: string,
  chatId: string
): Promise<BindChatResult> {
  const user = await requireCurrentUser();
  const customer = await getCustomer(customerId, accessScopeFor(user));
  if (!customer) {
    return { ok: false, message: "未找到该客户。" };
  }
  await prisma.chatBinding.deleteMany({ where: { chatId, customerId } });
  revalidatePath(`/customers/${customerId}`);
  return { ok: true, message: "已解绑。" };
}
