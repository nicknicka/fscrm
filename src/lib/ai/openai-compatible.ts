/**
 * OpenAI 兼容接口的最小客户端。
 *
 * 只依赖 `fetch`，不引入 SDK：需要的能力仅有两个——
 * 1. `chat/completions` 一次性对话（用于解析跟进内容）；
 * 2. 列出模型（设置页连通性测试用，很多兼容服务并不实现，失败不算致命）。
 *
 * 所有调用都带超时；超时或非 2xx 时抛出带可读原因的 `AiRequestError`，
 * 由上层决定回退策略（解析失败时机器人会追问，而不是瞎写一条记录）。
 */

/** 一次对话请求的参数。 */
export interface ChatRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 系统提示词。 */
  system: string;
  /** 用户输入。 */
  user: string;
  /** 要求返回 JSON 对象（json_object）。不支持的兼容服务由上层降级重试。 */
  jsonMode?: boolean;
  signal?: AbortSignal;
}

/** 对话响应：正文与用量。 */
export interface ChatResult {
  text: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/** 模型服务调用失败。`status` 为 HTTP 状态码，网络层失败时缺失。 */
export class AiRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string
  ) {
    super(message);
    this.name = "AiRequestError";
  }
}

const DEFAULT_TIMEOUT_MS = 20_000;

/** 归一化接口根地址：去掉尾部斜杠，并补上 /v1（若用户只填了域名）。 */
export function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  return trimmed;
}

/**
 * 解析 completions 端点。
 *
 * 用户可能填 `https://api.deepseek.com`、`https://api.deepseek.com/v1`
 * 或完整端点，这里统一收口到 `<root>/chat/completions`。
 */
export function completionsEndpoint(baseUrl: string): string {
  const root = normalizeBaseUrl(baseUrl);
  if (/\/chat\/completions$/.test(root)) return root;
  if (/\/v\d+$/.test(root)) return `${root}/chat/completions`;
  return `${root}/v1/chat/completions`;
}

/** 从响应体里抽出可读的错误说明。 */
function describeErrorBody(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string } | string;
      message?: string;
    };
    if (typeof parsed.error === "string") return parsed.error;
    if (parsed.error?.message) return parsed.error.message;
    if (parsed.message) return parsed.message;
  } catch {
    // 非 JSON，直接用原文
  }
  return body.slice(0, 300);
}

async function postJson(
  url: string,
  apiKey: string,
  body: unknown,
  signal?: AbortSignal
): Promise<Response> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new AiRequestError(`无法连接模型服务：${reason}`);
  }
}

/**
 * 发起一次对话补全。
 *
 * @throws AiRequestError 网络失败、超时、非 2xx 或响应结构不符
 */
export async function chatCompletion(
  request: ChatRequest
): Promise<ChatResult> {
  const url = completionsEndpoint(request.baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const signal = request.signal ?? controller.signal;

  try {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
      temperature: 0.1,
    };
    if (request.jsonMode) {
      body.response_format = { type: "json_object" };
    }

    let response = await postJson(url, request.apiKey, body, signal);

    // 部分兼容服务不支持 response_format，退回普通模式再试一次。
    if (!response.ok && request.jsonMode && response.status === 400) {
      delete body.response_format;
      response = await postJson(url, request.apiKey, body, signal);
    }

    const text = await response.text();
    if (!response.ok) {
      throw new AiRequestError(
        `模型服务返回 ${response.status}：${describeErrorBody(text)}`,
        response.status,
        text
      );
    }

    const parsed = JSON.parse(text) as {
      choices?: { message?: { content?: string } }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };
    const content = parsed.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      throw new AiRequestError("模型返回内容为空。", response.status, text);
    }
    return {
      text: content,
      usage: parsed.usage
        ? {
            promptTokens: parsed.usage.prompt_tokens,
            completionTokens: parsed.usage.completion_tokens,
            totalTokens: parsed.usage.total_tokens,
          }
        : undefined,
    };
  } catch (error) {
    if (error instanceof AiRequestError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiRequestError(
        `模型服务请求超时（${DEFAULT_TIMEOUT_MS / 1000} 秒）。`
      );
    }
    throw new AiRequestError(
      error instanceof Error ? error.message : String(error)
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 连通性测试：发一次极小请求，确认地址、Key、模型三者都对得上。
 *
 * 返回可读结论，不抛异常——设置页需要把失败原因直接展示给管理员。
 */
export async function testConnection(config: {
  baseUrl: string;
  apiKey: string;
  model: string;
}): Promise<{ ok: boolean; message: string; latencyMs: number }> {
  const startedAt = Date.now();
  try {
    await chatCompletion({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      system: "你是连通性测试助手，只回复 ok。",
      user: "ping",
    });
    return {
      ok: true,
      message: "连接正常：模型响应成功。",
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message,
      latencyMs: Date.now() - startedAt,
    };
  }
}
