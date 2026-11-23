"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { saveStageConfigs } from "@/lib/db/repositories/stage-config";
import { auditWrite } from "@/lib/db/repositories/audit-log";

/** 管理员保存销售阶段配置；非管理员拒绝。 */
export async function saveStageConfigsAction(formData: FormData) {
  const admin = await requireAdmin();

  const stages = formData.getAll("stage");
  const configs = stages
    .filter((value): value is string => typeof value === "string")
    .map((stage, index) => ({
      stage,
      label: String(formData.get(`label_${stage}`) ?? stage),
      position: Number(formData.get(`position_${stage}`) ?? index),
      isActive: formData.get(`active_${stage}`) === "on",
      tone: String(formData.get(`tone_${stage}`) ?? "blue"),
    }));

  await saveStageConfigs(configs);
  await auditWrite(
    admin,
    "UPDATE",
    "StageConfig",
    "GLOBAL",
    "更新销售阶段配置"
  );
  revalidatePath("/settings/stages");
  revalidatePath("/opportunities");
  revalidatePath("/funnel");
  revalidatePath("/analytics");
}
