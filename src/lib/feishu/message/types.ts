/**
 * 飞书消息发送相关的类型定义。
 */

/** 消息接收者的 ID 类型，对应飞书 `receive_id_type`。 */
export type FeishuReceiveIdType =
  "open_id" | "user_id" | "union_id" | "email" | "chat_id";

/** 发送文本消息的入参。 */
export interface FeishuTextMessage {
  /** 接收者 ID。 */
  receiveId: string;
  /** 接收者 ID 类型。 */
  receiveIdType: FeishuReceiveIdType;
  /** 文本内容。 */
  text: string;
}

/** 发送消息卡片的入参。 */
export interface FeishuCardMessage {
  /** 接收者 ID。 */
  receiveId: string;
  /** 接收者 ID 类型。 */
  receiveIdType: FeishuReceiveIdType;
  /** 卡片标题。 */
  title: string;
  /** 卡片正文（支持飞书 Markdown）。 */
  content: string;
}

/** 飞书发送消息的返回结果。 */
export interface FeishuSendResult {
  /** 飞书返回码，0 表示成功。 */
  code: number;
  /** 返回描述。 */
  msg?: string;
  /** 发送成功后返回的消息 ID。 */
  messageId?: string;
}

/**
 * 通知场景。
 *
 * 每个场景对应一种业务通知的模板与默认接收方式，
 * 由通知服务据此选择消息类型与内容。
 */
export type FeishuNotificationScenario =
  | "follow_up_reminder" // 跟进提醒
  | "approval_notification" // 审批通知
  | "customer_created" // 客户新建
  | "customer_claimed" // 公海客户被认领
  | "opportunity_created"; // 商机新建

/** 通知入参：场景 + 接收者 + 可选变量。 */
export interface FeishuNotification {
  /** 通知场景。 */
  scenario: FeishuNotificationScenario;
  /** 接收者 ID。 */
  receiveId: string;
  /** 接收者 ID 类型。 */
  receiveIdType: FeishuReceiveIdType;
  /** 填充到模板中的变量，如客户名、商机名。 */
  variables?: Record<string, string>;
}
