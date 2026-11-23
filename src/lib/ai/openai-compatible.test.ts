import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AiRequestError,
  chatCompletion,
  completionsEndpoint,
  testConnection,
} from "./openai-compatible";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("completionsEndpoint", () => {
  it("只给域名时补 /v1/chat/completions", () => {
    expect(completionsEndpoint("https://api.deepseek.com")).toBe(
      "https://api.deepseek.com/v1/chat/completions"
    );
  });

  it("已带 /v1 时不重复补", () => {
    expect(completionsEndpoint("https://api.deepseek.com/v1")).toBe(
      "https://api.deepseek.com/v1/chat/completions"
    );
  });

  it("直接给完整端点时保持原样", () => {
    expect(completionsEndpoint("https://x.com/v1/chat/completions")).toBe(
      "https://x.com/v1/chat/completions"
    );
  });

  it("去掉尾部斜杠", () => {
    expect(completionsEndpoint("https://x.com/v2/")).toBe(
      "https://x.com/v2/chat/completions"
    );
  });
});

function okResponse(content = '{"ok":true}') {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

describe("chatCompletion", () => {
  const base = {
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-x",
    model: "m1",
    system: "sys",
    user: "hi",
  };

  it("正常返回正文与用量", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okResponse())
    );
    const result = await chatCompletion({ ...base, jsonMode: true });
    expect(result.text).toBe('{"ok":true}');
    expect(result.usage?.totalTokens).toBe(15);
  });

  it("请求头带 Bearer 鉴权，且 jsonMode 传了 response_format", async () => {
    const calls: { headers: Record<string, string>; body: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push({
          headers: init.headers as Record<string, string>,
          body: String(init.body),
        });
        return okResponse();
      })
    );
    await chatCompletion({ ...base, jsonMode: true });
    expect(calls[0].headers.authorization).toBe("Bearer sk-x");
    expect(JSON.parse(calls[0].body).response_format).toEqual({
      type: "json_object",
    });
  });

  it("服务端不支持 response_format（400）时自动降级重试一次", async () => {
    const bodies: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      if (bodies.length === 1) {
        return new Response(
          JSON.stringify({ error: { message: "unsupported" } }),
          { status: 400 }
        );
      }
      return okResponse("plain");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await chatCompletion({ ...base, jsonMode: true });
    expect(result.text).toBe("plain");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(bodies[1]).response_format).toBeUndefined();
  });

  it("非 2xx 抛 AiRequestError 并带上服务商给出的原因", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: "invalid key" } }), {
            status: 401,
          })
      )
    );
    await expect(chatCompletion(base)).rejects.toMatchObject({
      name: "AiRequestError",
      status: 401,
      message: expect.stringContaining("invalid key"),
    });
  });

  it("网络异常转成可读错误", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      })
    );
    await expect(chatCompletion(base)).rejects.toBeInstanceOf(AiRequestError);
  });

  it("返回内容为空时抛错", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ choices: [{ message: {} }] }), {
            status: 200,
          })
      )
    );
    await expect(chatCompletion(base)).rejects.toThrow(/为空/);
  });
});

describe("testConnection", () => {
  it("成功时返回 ok 与耗时", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okResponse("ok"))
    );
    const result = await testConnection({
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-x",
      model: "m",
    });
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("失败时不抛异常，把原因交给界面展示", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: "model not found" }), {
            status: 404,
          })
      )
    );
    const result = await testConnection({
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-x",
      model: "bad",
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("model not found");
  });
});
