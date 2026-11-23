"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { UserRole } from "@/generated/prisma/enums";
import {
  CUSTOMER_SENSITIVE_FIELDS,
  saveFieldPermissions,
} from "@/lib/db/repositories/field-permission";
import { auditWrite } from "@/lib/db/repositories/audit-log";

/** 管理员保存负责人对客户敏感字段的可见性。 */
export async function saveFieldPermissionsAction(formData: FormData) {
  const admin = await requireAdmin();
  const visible = CUSTOMER_SENSITIVE_FIELDS.filter(
    (field) => formData.get(`field_${field}`) === "on"
  );
  await saveFieldPermissions(UserRole.OWNER, visible);
  await auditWrite(
    admin,
    "UPDATE",
    "FieldPermission",
    "Customer:OWNER",
    "更新负责人客户敏感字段可见性"
  );
  revalidatePath("/settings/field-permissions");
  revalidatePath("/customers");
}
