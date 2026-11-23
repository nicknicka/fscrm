"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import {
  saveModelConfigAction,
  testModelConfigAction,
  type SaveModelConfigState,
} from "./actions";
import type { ModelConfigView } from "@/lib/ai/model-config";

/**
 * 模型服务配置表单（OpenAI 兼容接口）。
 *
 * 交互刻意模仿常见的「自定义 API」配置页：填 Base URL、模型 ID、API Key，
 * 保存后立刻测一次连通性，结果原地展示。API Key 输入框留空表示沿用已保存的 Key，
 * 因此修改模型名不必重新输入密钥。
 */

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500";

/** 常见服务商的预填项，降低「不知道填什么」的门槛。 */
const PRESETS = [
  {
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
  },
  {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  {
    label: "通义千问",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
  },
  {
    label: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-flash",
  },
];

function ResultBanner({
  ok,
  children,
}: {
  ok: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
        ok
          ? "border-green-200 bg-green-50 text-green-800"
          : "border-red-200 bg-red-50 text-red-800"
      }`}
    >
      {children}
    </div>
  );
}

export function ModelConfigForm({
  current,
}: {
  current: ModelConfigView | null;
}) {
  const [state, formAction, pending] = useActionState<
    SaveModelConfigState | null,
    FormData
  >(saveModelConfigAction, null);

  const [testing, startTest] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    latencyMs: number;
  } | null>(null);

  return (
    <div>
      {current ? (
        <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-zinc-600">
            <span>
              当前生效：
              <strong className="text-zinc-900">{current.label}</strong>
            </span>
            <span>
              模型{" "}
              <code className="rounded bg-white px-1">{current.model}</code>
            </span>
            <span>
              Key{" "}
              <code className="rounded bg-white px-1">
                {current.apiKeyMasked}
              </code>
            </span>
            <span
              className={
                current.lastTestOk
                  ? "text-green-700"
                  : current.lastTestOk === false
                    ? "text-red-700"
                    : "text-zinc-500"
              }
            >
              {current.lastTestOk === null
                ? "尚未测试连通性"
                : current.lastTestOk
                  ? "最近一次测试：正常"
                  : "最近一次测试：失败"}
            </span>
          </div>
          {current.lastTestMessage && current.lastTestOk === false && (
            <p className="mt-2 text-xs text-red-700">
              {current.lastTestMessage}
            </p>
          )}
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          还没有配置模型服务。机器人收到消息时会退回到关键词识别，无法理解自然语言。
        </div>
      )}

      <form
        ref={formRef}
        data-model-form
        action={formAction}
        className="space-y-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">
              服务商名称
            </span>
            <input
              name="label"
              defaultValue={current?.label ?? ""}
              placeholder="如 DeepSeek"
              className={inputClass}
              required
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">
              模型 ID
            </span>
            <input
              name="model"
              defaultValue={current?.model ?? ""}
              placeholder="如 deepseek-chat"
              className={inputClass}
              required
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">
            Base URL（OpenAI 兼容接口根地址）
          </span>
          <input
            name="baseUrl"
            defaultValue={current?.baseUrl ?? ""}
            placeholder="https://api.deepseek.com/v1"
            className={inputClass}
            required
          />
          <span className="mt-1 block text-xs text-zinc-500">
            填到 <code>/v1</code> 即可，系统会自动补
            <code>/chat/completions</code>；也可以直接填完整端点。
          </span>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">
            API Key
            {current && (
              <span className="ml-2 font-normal text-zinc-500">
                留空则沿用已保存的 Key
              </span>
            )}
          </span>
          <input
            name="apiKey"
            type="password"
            autoComplete="off"
            placeholder={current ? current.apiKeyMasked : "sk-..."}
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Key 加密后存储在数据库，页面与接口都不会返回明文。
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "保存并测试中…" : "保存并测试"}
          </button>
          <button
            type="button"
            disabled={!current || testing}
            onClick={() =>
              startTest(async () => {
                setTestResult(await testModelConfigAction());
              })
            }
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
          >
            {testing ? "测试中…" : "只测试当前配置"}
          </button>

          <span className="text-xs text-zinc-500">
            快速填充：
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="ml-2 text-blue-600 underline-offset-2 hover:underline"
                onClick={() => {
                  const form = formRef.current;
                  if (!form) return;
                  (form.elements.namedItem("label") as HTMLInputElement).value =
                    preset.label;
                  (
                    form.elements.namedItem("baseUrl") as HTMLInputElement
                  ).value = preset.baseUrl;
                  (form.elements.namedItem("model") as HTMLInputElement).value =
                    preset.model;
                }}
              >
                {preset.label}
              </button>
            ))}
          </span>
        </div>
      </form>

      {state && (
        <ResultBanner ok={state.ok}>
          <p>{state.ok ? `✅ ${state.message}` : `❌ ${state.message}`}</p>
          {state.test && (
            <p className="mt-1">
              {state.test.ok ? "连通性正常" : "连通性失败"} ·{" "}
              {state.test.latencyMs}
              ms · {state.test.message}
            </p>
          )}
        </ResultBanner>
      )}

      {testResult && !state && (
        <ResultBanner ok={testResult.ok}>
          <p>
            {testResult.ok ? "✅ 连通性正常" : "❌ 连通性失败"} ·{" "}
            {testResult.latencyMs}ms
          </p>
          <p className="mt-1 break-all">{testResult.message}</p>
        </ResultBanner>
      )}
    </div>
  );
}
