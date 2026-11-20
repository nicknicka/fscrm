import { isFeishuConfigured } from "../client";
import { sendNotification } from "./notification";
import type { FeishuNotificationScenario } from "./types";

/**
 * 业务通知封装。
 *
 * 把「给某 CRM 用户发通知」的复杂度收敛在一处：按用户的飞书 open_id 发送，
 * 凭证未配置或飞书接口报错时记录日志并**静默跳过**，绝不阻断业务写入。
 *
 * 这样即使飞书机器人能力/权限尚未在后台发布，客户、商机的创建仍能正常工作。
 */

/** 通知目标用户。 */
export interface NotifyTarget {
  /** CRM 用户名称，用于日志。 */
  name: string;
  /** 飞书 open_id；为空表示未绑定飞书，无法通知。 */
  feishuOpenId: string | null;
}

/** 通知结果，便于调用方了解发生了什么。 */
export interface NotifyResult {
  /** 是否实际发送了通知。 */
  sent: boolean;
  /** 跳过或失败的原因。 */
  reason?: string;
}

/**
 * 给指定 CRM 用户发送业务通知。
 *
 * @param target 目标用户（含飞书 open_id）
 * @param scenario 通知场景
 * @param variables 模板变量
 * @returns 通知结果；任何异常都被吞掉并转为 sent:false
 */
export async function notifyUser(
  target: NotifyTarget | null | undefined,
  scenario: FeishuNotificationScenario,
  variables: Record<string, string> = {}
): Promise<NotifyResult> {
  if (!target) {
    return { sent: false, reason: "无负责人" };
  }
  if (!target.feishuOpenId) {
    return { sent: false, reason: "负责人未绑定飞书" };
  }
  if (!isFeishuConfigured()) {
    return { sent: false, reason: "飞书凭证未配置" };
  }

  try {
    const result = await sendNotification({
      scenario,
      receiveId: target.feishuOpenId,
      receiveIdType: "open_id",
      variables,
    });
    if (result.code === 0) {
      return { sent: true };
    }
    return {
      sent: false,
      reason: `飞书返回码 ${result.code}: ${result.msg ?? ""}`,
    };
  } catch (error) {
    // 通知失败不影响业务：仅记录，不抛出
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[feishu:notify] 通知 ${target.name} 失败（已忽略）:`,
      message
    );
    return { sent: false, reason: message };
  }
}
