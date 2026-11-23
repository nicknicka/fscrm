"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { saveModelConfig, testActiveModelConfig } from "@/lib/ai/model-config";
import { auditWrite } from "@/lib/db/repositories/audit-log";

/**
 * 模型服务配置的 Server Action。
 *
 * 只有管理员能改：模型 Key 属于全局基础设施，普通负责人不应看到或改动。
 * 守卫放在 action 内部（`requireAdmin`），不依赖页面是否显示表单——
 * Server Action 可以被直接 POST 调用。
 */

/** 保存结果，供表单展示。 */
export interface SaveModelConfigState {
  ok: boolean;
  message: string;
  /** 保存成功后自动跑一次连通性测试，把结论一并带回。 */
  test?: { ok: boolean; message: string; latencyMs: number };
}

/** 读取并校验表单字段，返回错误信息或清洗后的入参。 */
function readForm(formData: FormData):
  | { error: string }
  | {
      value: { label: string; baseUrl: string; model: string; apiKey: string };
    } {
  const label = String(formData.get("label") ?? "").trim();
  const baseUrl = String(formData.get("baseUrl") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();
  const apiKey = String(formData.get("apiKey") ?? "").trim();

  if (!label) return { error: "请填写服务商名称。" };
  if (!baseUrl) return { error: "请填写接口地址。" };
  if (!/^https?:\/\//.test(baseUrl)) {
    return { error: "接口地址必须以 http:// 或 https:// 开头。" };
  }
  if (!model) return { error: "请填写模型 ID。" };
  return { value: { label, baseUrl, model, apiKey } };
}

/** 保存配置。 */
export async function saveModelConfigAction(
  _prev: SaveModelConfigState | null,
  formData: FormData
): Promise<SaveModelConfigState> {
  const admin = await requireAdmin();
  const parsed = readForm(formData);
  if ("error" in parsed) {
    return { ok: false, message: parsed.error };
  }

  try {
    const config = await saveModelConfig({
      label: parsed.value.label,
      baseUrl: parsed.value.baseUrl,
      model: parsed.value.model,
      apiKey: parsed.value.apiKey || undefined,
    });
    await auditWrite(
      admin,
      "UPDATE",
      "ModelConfig",
      config.id,
      "更新模型服务配置"
    );
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "保存失败，请稍后重试。",
    };
  }

  // 保存即测试：让「填完不知道能不能用」这个最常见的坑一次暴露出来
  const test = await testActiveModelConfig();
  revalidatePath("/settings");
  return {
    ok: true,
    message: "已保存并设为生效。",
    test: {
      ok: test.ok,
      message: test.message,
      latencyMs: test.latencyMs,
    },
  };
}

/** 只测试、不改配置。 */
export async function testModelConfigAction(): Promise<{
  ok: boolean;
  message: string;
  latencyMs: number;
}> {
  await requireAdmin();
  const result = await testActiveModelConfig();
  revalidatePath("/settings");
  return result;
}
