"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { saveStageConfigs } from "@/lib/db/repositories/stage-config";

/** 管理员保存销售阶段配置；非管理员拒绝。 */
export async function saveStageConfigsAction(formData: FormData) {
  await requireAdmin();

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
  revalidatePath("/settings/stages");
  revalidatePath("/opportunities");
  revalidatePath("/funnel");
  revalidatePath("/analytics");
}
