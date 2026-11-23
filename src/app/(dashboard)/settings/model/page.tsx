import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireCurrentUser } from "@/lib/auth/session";
import { getActiveModelConfigView } from "@/lib/ai/model-config";
import { ModelConfigForm } from "./model-config-form";

/**
 * 「设置 → 模型服务」页。
 *
 * 只有管理员能进入（与保存动作的 `requireAdmin` 双重保障：页面不渲染表单，
 * 接口也会拒绝）。普通负责人看到的是说明页而非配置项。
 */
export default async function ModelSettingsPage() {
  const currentUser = await requireCurrentUser();
  const current = await getActiveModelConfigView();

  return (
    <div>
      <Link href="/settings" className="text-sm text-blue-600 hover:underline">
        ← 返回设置
      </Link>
      <div className="mt-4">
        <PageHeader
          title="模型服务"
          description="用于解析飞书消息中的跟进内容，支持任意 OpenAI 兼容接口"
        />
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-base font-semibold">连接配置</h2>
        <p className="mt-2 mb-6 text-sm leading-6 text-zinc-600">
          销售在飞书里 @机器人 说「今天电话聊了，预算 80 万，下周三要方案」，
          模型负责把这句话拆成结构化字段：客户、跟进方式、摘要、下一步时间。
          模型只做理解，客户匹配与写入规则仍由代码控制，因此模型出错最坏只是
          「没记上并追问你」，不会写脏数据。
        </p>

        {currentUser.role === "ADMIN" ? (
          <ModelConfigForm current={current} />
        ) : (
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
            只有管理员可以查看与修改模型配置。当前
            {current
              ? `已配置：${current.label} / ${current.model}`
              : "尚未配置"}
            。
          </p>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-base font-semibold">没有模型也能用</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          未配置模型或调用失败时，机器人会退回关键词识别：从消息里找出现有客户名称、
          按「电话 / 见面 / 邮件 / 微信」判断跟进方式、识别「明天 / 下周三 / 3
          天后」
          这类时间。能记录，但理解力有限，卡片底部会标注「按关键词识别」，提醒你核对。
        </p>
      </section>
    </div>
  );
}
