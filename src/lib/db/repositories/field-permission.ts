import { prisma } from "@/lib/db/client";
import { UserRole } from "@/generated/prisma/enums";

/**
 * 字段级权限服务（#75）：角色 × 对象 × 字段的可见性（先覆盖客户敏感字段）。
 * 不可见字段在服务端返回 null，不向客户端泄露真实值。
 */

/** 客户可配置的敏感字段目录。 */
export const CUSTOMER_SENSITIVE_FIELDS = ["phone", "email", "address"] as const;
export type CustomerSensitiveField = (typeof CUSTOMER_SENSITIVE_FIELDS)[number];

/** 读取字段权限矩阵；返回 role -> field -> visible。 */
export async function listFieldPermissions() {
  const rows = await prisma.fieldPermission.findMany({
    where: { entity: "Customer" },
  });
  return rows.map((row) => ({
    role: row.role,
    field: row.field,
    visible: row.visible,
  }));
}

/** 管理员保存某角色的字段可见性（整体覆盖 Customer + 该角色）。 */
export async function saveFieldPermissions(
  role: UserRole,
  visibleFields: string[]
) {
  await prisma.$transaction([
    prisma.fieldPermission.deleteMany({ where: { entity: "Customer", role } }),
    ...CUSTOMER_SENSITIVE_FIELDS.map((field) =>
      prisma.fieldPermission.create({
        data: {
          role,
          entity: "Customer",
          field,
          visible: visibleFields.includes(field),
        },
      })
    ),
  ]);
}

/** 取指定角色对客户敏感字段的可见集合。没有配置时默认全部可见；管理员始终可见。 */
export async function visibleCustomerFields(
  role: UserRole
): Promise<Set<CustomerSensitiveField>> {
  if (role === UserRole.ADMIN) return new Set(CUSTOMER_SENSITIVE_FIELDS);
  const rows = await prisma.fieldPermission.findMany({
    where: { entity: "Customer", role },
  });
  if (rows.length === 0) return new Set(CUSTOMER_SENSITIVE_FIELDS);
  return new Set(
    rows
      .filter((row) => row.visible)
      .map((row) => row.field as CustomerSensitiveField)
  );
}

/** 遮蔽客户对象上的不可见字段（返回浅拷贝，不改原对象）。 */
export function maskCustomerFields<T extends Record<string, unknown>>(
  customer: T,
  visible: Set<CustomerSensitiveField>
): T {
  const masked = { ...customer } as Record<string, unknown>;
  for (const field of CUSTOMER_SENSITIVE_FIELDS) {
    if (!visible.has(field)) masked[field] = null;
  }
  return masked as T;
}
