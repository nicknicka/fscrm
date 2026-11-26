import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/session";
import {
  CUSTOMER_SENSITIVE_FIELDS,
  listFieldPermissions,
} from "@/lib/db/repositories/field-permission";
import { UserRole } from "@/generated/prisma/enums";
import { saveFieldPermissionsAction } from "./actions";

/** 字段级权限配置页：控制负责人可见的客户敏感字段。 */
export default async function FieldPermissionsPage() {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") notFound();
  const permissions = await listFieldPermissions();
  const ownerVisible = new Set(
    permissions
      .filter((p) => p.role === UserRole.OWNER && p.visible)
      .map((p) => p.field)
  );
  const labels: Record<string, string> = {
    phone: "电话",
    email: "邮箱",
    address: "地址",
  };

  return (
    <div>
      <Link href="/settings" className="text-sm text-brass-600 hover:underline">
        ← 返回设置
      </Link>
      <div className="mt-4">
        <PageHeader
          title="字段级权限"
          description="控制负责人可见的客户敏感字段；不可见字段在服务端返回空值，不泄露真实数据"
        />
      </div>

      <form
        action={saveFieldPermissionsAction}
        className="rounded-xl border border-line bg-paper-raised p-6"
      >
        <h2 className="mb-4 text-base font-semibold">负责人可见字段</h2>
        <div className="space-y-3">
          {CUSTOMER_SENSITIVE_FIELDS.map((field) => (
            <label
              key={field}
              className="flex items-center gap-2 text-sm text-ink"
            >
              <input
                type="checkbox"
                name={`field_${field}`}
                defaultChecked={
                  ownerVisible.size === 0 || ownerVisible.has(field)
                }
                className="rounded border-line-strong"
              />
              {labels[field]}
            </label>
          ))}
        </div>
        <p className="mt-4 text-xs text-ink-faint">
          管理员始终可见全部字段。取消勾选后，负责人在客户列表与详情中看到的该字段为空。
        </p>
        <button type="submit" className="mt-4 btn btn-primary">
          保存
        </button>
      </form>
    </div>
  );
}
