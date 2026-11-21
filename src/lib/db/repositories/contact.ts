import { prisma } from "../client";
import { ownerWhere, type AccessScope } from "../../auth/scope";

/**
 * 联系人数据访问层（#31）。
 *
 * 联系人没有独立的权限模型：任何写入都先按「所属客户」校验当前
 * 负责人/管理员的访问范围，普通负责人只能维护自己负责客户的联系人，
 * 管理员可以维护全部。越权与对象不存在返回同一个 NOT_FOUND 结果，
 * 避免泄露客户或联系人是否存在。
 */

/** 统一拒绝结果：不区分对象不存在与无权限。 */
export const CONTACT_NOT_FOUND = {
  ok: false,
  error: "NOT_FOUND",
} as const;

/** 联系人可写字段。 */
export interface ContactInput {
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  remark: string | null;
}

/**
 * 确认当前范围可以访问该客户；返回 null 表示拒绝。
 *
 * 不使用独立的联系人权限，只复用客户的 ownerWhere 范围。
 */
async function canAccessCustomer(
  customerId: string,
  scope: AccessScope
): Promise<boolean> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, ...ownerWhere(scope) },
    select: { id: true },
  });
  return customer !== null;
}

/** 新建联系人：成功结果带上 customerId，供 Server Action 精确刷新详情页。 */
export async function createContact(
  customerId: string,
  data: ContactInput,
  scope: AccessScope
) {
  if (!(await canAccessCustomer(customerId, scope))) {
    return CONTACT_NOT_FOUND;
  }
  const contact = await prisma.contact.create({
    data: { ...data, customer: { connect: { id: customerId } } },
  });
  return { ok: true as const, customerId, contact };
}

/**
 * 更新联系人：先按联系人所属客户校验范围。
 * 成功结果带上 customerId，供 Server Action 精确刷新详情页。
 */
export async function updateContact(
  contactId: string,
  data: ContactInput,
  scope: AccessScope
) {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { customerId: true },
  });
  if (!contact || !(await canAccessCustomer(contact.customerId, scope))) {
    return CONTACT_NOT_FOUND;
  }
  const updated = await prisma.contact.update({
    where: { id: contactId },
    data,
  });
  return { ok: true as const, customerId: contact.customerId, contact: updated };
}

/**
 * 删除联系人：先按联系人所属客户校验范围。
 * 成功结果带上 customerId，供 Server Action 精确刷新详情页。
 */
export async function deleteContact(contactId: string, scope: AccessScope) {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { customerId: true },
  });
  if (!contact || !(await canAccessCustomer(contact.customerId, scope))) {
    return CONTACT_NOT_FOUND;
  }
  await prisma.contact.delete({ where: { id: contactId } });
  return { ok: true as const, customerId: contact.customerId };
}
