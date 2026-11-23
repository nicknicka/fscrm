import { prisma } from "@/lib/db/client";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/ai/secret-box";
import {
  chatCompletion,
  testConnection,
  type ChatRequest,
} from "@/lib/ai/openai-compatible";

/**
 * 模型配置数据访问层（OpenAI 兼容接口）。
 *
 * 约定：
 * - 同一时刻只有一条 `isActive` 记录，保存时在同一事务里先全部置为不启用；
 * - `apiKey` 只以密文入库；`getActiveModelConfig()` 是唯一会解密的位置，
 *   供服务端调用模型使用，绝不把明文传给页面；
 * - 页面读到的都是 `ModelConfigView`，其中只有掩码。
 */

/** 供设置页展示的配置视图：不含明文 Key。 */
export interface ModelConfigView {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  apiKeyMasked: string;
  isActive: boolean;
  lastTestedAt: Date | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
  updatedAt: Date;
}

/** 已解密、可直接用于调用模型的配置。 */
export interface ResolvedModelConfig {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

/** 保存配置的入参；`apiKey` 留空表示沿用原 Key。 */
export interface SaveModelConfigInput {
  label: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
}

/** 配置不存在或不可用时的错误代码。 */
export const MODEL_CONFIG_MISSING = "MODEL_CONFIG_MISSING";

function toView(row: {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  apiKeyCipher: string;
  isActive: boolean;
  lastTestedAt: Date | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
  updatedAt: Date;
}): ModelConfigView {
  let masked = "（无法解密）";
  try {
    masked = maskSecret(decryptSecret(row.apiKeyCipher));
  } catch {
    // 密钥变更导致无法解密时，界面明确显示异常，提示管理员重新填写。
  }
  return {
    id: row.id,
    label: row.label,
    baseUrl: row.baseUrl,
    model: row.model,
    apiKeyMasked: masked,
    isActive: row.isActive,
    lastTestedAt: row.lastTestedAt,
    lastTestOk: row.lastTestOk,
    lastTestMessage: row.lastTestMessage,
    updatedAt: row.updatedAt,
  };
}

/** 读取当前生效配置（供设置页展示）。 */
export async function getActiveModelConfigView(): Promise<ModelConfigView | null> {
  const row = await prisma.modelConfig.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
  });
  return row ? toView(row) : null;
}

/**
 * 读取并解密当前生效配置，用于真正调用模型。
 *
 * 明文只在这里出现，返回给服务端调用方后不应再返回给客户端。
 */
export async function getActiveModelConfig(): Promise<ResolvedModelConfig | null> {
  const row = await prisma.modelConfig.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!row) return null;
  try {
    return {
      id: row.id,
      label: row.label,
      baseUrl: row.baseUrl,
      model: row.model,
      apiKey: decryptSecret(row.apiKeyCipher),
    };
  } catch (error) {
    console.error("[ai] 模型配置的 API Key 无法解密", error);
    return null;
  }
}

/**
 * 保存配置并设为生效。
 *
 * 只保留一条记录：若已存在配置则原地更新（`apiKey` 留空则沿用原密文），
 * 否则新建。整个过程在一个事务里完成，避免出现两条同时生效的配置。
 */
export async function saveModelConfig(
  input: SaveModelConfigInput
): Promise<ModelConfigView> {
  const label = input.label.trim();
  const baseUrl = input.baseUrl.trim();
  const model = input.model.trim();
  const apiKey = input.apiKey?.trim();

  if (!label || !baseUrl || !model) {
    throw new Error("服务商名称、接口地址与模型 ID 都不能为空。");
  }
  if (!/^https?:\/\//.test(baseUrl)) {
    throw new Error("接口地址必须以 http:// 或 https:// 开头。");
  }

  const existing = await prisma.modelConfig.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
  });

  if (!existing && !apiKey) {
    throw new Error("首次配置必须填写 API Key。");
  }

  const row = await prisma.$transaction(async (tx) => {
    await tx.modelConfig.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    if (existing) {
      return tx.modelConfig.update({
        where: { id: existing.id },
        data: {
          label,
          baseUrl,
          model,
          isActive: true,
          ...(apiKey ? { apiKeyCipher: encryptSecret(apiKey) } : {}),
        },
      });
    }

    return tx.modelConfig.create({
      data: {
        label,
        baseUrl,
        model,
        isActive: true,
        apiKeyCipher: encryptSecret(apiKey as string),
      },
    });
  });

  return toView(row);
}

/**
 * 测试已保存配置的连通性，并把结果写回配置。
 *
 * 使用库里的密文解密后实测；可选传入新 Key，便于「保存前先测」。
 */
export async function testActiveModelConfig(override?: {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}): Promise<{ ok: boolean; message: string; latencyMs: number }> {
  const row = await prisma.modelConfig.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!row) {
    return {
      ok: false,
      message: "尚未配置模型服务。",
      latencyMs: 0,
    };
  }

  let apiKey = "";
  try {
    apiKey = override?.apiKey?.trim() || decryptSecret(row.apiKeyCipher);
  } catch {
    const message = "已保存的 API Key 无法解密，请重新填写。";
    await markTestResult(row.id, false, message);
    return { ok: false, message, latencyMs: 0 };
  }

  const result = await testConnection({
    baseUrl: override?.baseUrl?.trim() || row.baseUrl,
    model: override?.model?.trim() || row.model,
    apiKey,
  });
  await markTestResult(row.id, result.ok, result.message);
  return result;
}

async function markTestResult(
  id: string,
  ok: boolean,
  message: string
): Promise<void> {
  await prisma.modelConfig.update({
    where: { id },
    data: {
      lastTestedAt: new Date(),
      lastTestOk: ok,
      lastTestMessage: message,
    },
  });
}

/** 模型是否已配置且可解密，用于机器人回复「还没配模型」的引导。 */
export async function isModelConfigured(): Promise<boolean> {
  return (await getActiveModelConfig()) !== null;
}

/**
 * 用当前生效配置发起一次对话。
 *
 * @throws Error 未配置模型时（消息面向管理员，提示去设置页配置）
 */
export async function completeWithActiveModel(
  request: Omit<ChatRequest, "baseUrl" | "apiKey" | "model">
): Promise<{ text: string; model: string }> {
  const config = await getActiveModelConfig();
  if (!config) {
    throw new Error(
      `${MODEL_CONFIG_MISSING}: 尚未配置模型服务，请管理员在「设置 → 模型服务」中完成配置。`
    );
  }
  const result = await chatCompletion({
    ...request,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
  });
  return { text: result.text, model: config.model };
}
