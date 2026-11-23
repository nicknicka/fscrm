"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, requireAdmin } from "@/lib/auth/session";
import { listUsers } from "@/lib/db/repositories/user";
import { notifyUser } from "@/lib/feishu/message/notify";
import { auditWrite } from "@/lib/db/repositories/audit-log";
import {
  listDiscountApprovals,
  requestDiscountApproval,
  reviewDiscountApproval,
} from "@/lib/db/repositories/discount-approval";

/** 发起折扣审批：通知管理员；通知失败不影响申请落库。 */
export async function requestDiscountApprovalAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;

  const opportunityId = formData.get("opportunityId");
  const rate = Number(formData.get("discountRate"));
  const reason = String(formData.get("reason") ?? "").trim();
  if (typeof opportunityId !== "string" || !opportunityId) return;

  try {
    const created = await requestDiscountApproval(
      opportunityId,
      { discountRate: rate, reason },
      user
    );
    await auditWrite(
      user,
      "CREATE",
      "DiscountApproval",
      created.id,
      `发起折扣申请：折扣率 ${rate}，原因：${reason}`
    );
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_INPUT") return;
    throw error;
  }

  // 通知所有已绑定飞书的管理员
  const admins = (await listUsers()).filter((u) => u.role === "ADMIN");
  await Promise.all(
    admins.map((admin) =>
      notifyUser(admin, "approval_notification", {
        approvalName: `商机折扣申请（申请人 ${user.name}）`,
      })
    )
  );
  revalidatePath("/approvals");
}

/** 管理员审批：通过/驳回，审批后通知申请人；通知失败不影响审批结果。 */
export async function reviewDiscountApprovalAction(formData: FormData) {
  const admin = await requireAdmin();
  const approvalId = formData.get("approvalId");
  const decision = formData.get("decision");
  const note = String(formData.get("note") ?? "").trim();
  if (
    typeof approvalId !== "string" ||
    !approvalId ||
    (decision !== "APPROVED" && decision !== "REJECTED")
  ) {
    return;
  }

  const reviewed = await reviewDiscountApproval(
    approvalId,
    decision,
    note || null,
    admin.id
  );

  await auditWrite(
    admin,
    "APPROVE",
    "DiscountApproval",
    approvalId,
    `折扣审批${decision === "APPROVED" ? "通过" : "驳回"}`
  );

  // 通知申请人审批结果（失败静默）
  const applicant = (await listUsers()).find(
    (u) => u.id === reviewed.requestedBy
  );
  if (applicant) {
    await notifyUser(applicant, "approval_notification", {
      approvalName: `你的折扣申请已${decision === "APPROVED" ? "通过" : "驳回"}`,
    });
  }
  revalidatePath("/approvals");
  revalidatePath("/opportunities");
}

/** 审批列表读取（负责人只看本人相关）。 */
export async function listDiscountApprovalsForCurrentUser() {
  const user = await getCurrentUser();
  if (!user) return [];
  return listDiscountApprovals(user);
}
