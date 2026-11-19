import { sendCardMessage, sendTextMessage } from "./sender";
import type { FeishuNotification, FeishuNotificationScenario } from "./types";

/**
 * 飞书通知服务。
 *
 * 按通知场景选择消息模板与消息类型，填充变量后发送，
 * 让业务方只需声明「发什么通知、给谁」，不必关心消息构造细节。
 */

/** 通知模板：标题与正文模板，正文支持 `{{变量名}}` 占位。 */
interface NotificationTemplate {
  /** 使用的接收者 ID 类型（场景默认值）。 */
  receiveIdType: "open_id" | "user_id" | "union_id" | "email" | "chat_id";
  /** 消息类型。 */
  kind: "text" | "card";
  /** 卡片标题模板（仅 card 类型使用）。 */
  title: string;
  /** 正文模板，支持 `{{变量名}}` 占位。 */
  body: string;
}

/** 各通知场景的默认模板。 */
const TEMPLATES: Record<FeishuNotificationScenario, NotificationTemplate> = {
  follow_up_reminder: {
    receiveIdType: "open_id",
    kind: "card",
    title: "跟进提醒",
    body: "请及时跟进客户：{{customerName}}，当前商机：{{opportunityName}}。",
  },
  approval_notification: {
    receiveIdType: "open_id",
    kind: "card",
    title: "审批通知",
    body: "有新的审批待处理：{{approvalName}}，请尽快处理。",
  },
};

/** 将 `{{变量名}}` 占位替换为实际值，未提供的变量保留原占位。 */
function fillTemplate(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return key in variables ? variables[key] : match;
  });
}

/**
 * 发送通知。
 *
 * 根据场景选择模板，填充变量后按模板的消息类型发送。
 *
 * @param notification 通知场景、接收者与变量
 * @returns 发送结果
 */
export async function sendNotification(notification: FeishuNotification) {
  const template = TEMPLATES[notification.scenario];
  const body = fillTemplate(template.body, notification.variables ?? {});

  if (template.kind === "text") {
    return sendTextMessage({
      receiveId: notification.receiveId,
      receiveIdType: notification.receiveIdType,
      text: body,
    });
  }

  return sendCardMessage({
    receiveId: notification.receiveId,
    receiveIdType: notification.receiveIdType,
    title: fillTemplate(template.title, notification.variables ?? {}),
    content: body,
  });
}

/** 获取指定场景的模板（供测试或自定义发送复用）。 */
export function getNotificationTemplate(
  scenario: FeishuNotificationScenario
): NotificationTemplate {
  return TEMPLATES[scenario];
}

/** 将 `{{变量名}}` 替换为实际值的占位填充函数（导出以便测试）。 */
export { fillTemplate };
