import * as lark from "@larksuiteoapi/node-sdk";
import { getFeishuClient, isFeishuConfigured } from "../client";
import type {
  FeishuCardMessage,
  FeishuReceiveIdType,
  FeishuSendResult,
  FeishuTextMessage,
} from "./types";

/**
 * 飞书消息发送封装。
 *
 * 统一包装 `client.im.v1.message.create`，提供发送文本消息与消息卡片两个方法，
 * 并把 SDK 返回归一化为 `FeishuSendResult`。
 */

/** 从 SDK 响应中提取统一结果。 */
function toSendResult(response: {
  code?: number;
  msg?: string;
  data?: { message_id?: string };
}): FeishuSendResult {
  return {
    code: response.code ?? -1,
    msg: response.msg,
    messageId: response.data?.message_id,
  };
}

/** 发送文本消息。 */
export async function sendTextMessage(
  message: FeishuTextMessage
): Promise<FeishuSendResult> {
  const client = getFeishuClient();
  const response = await client.im.v1.message.create({
    data: {
      receive_id: message.receiveId,
      msg_type: "text",
      content: JSON.stringify({ text: message.text }),
    },
    params: { receive_id_type: message.receiveIdType },
  });
  return toSendResult(response);
}

/** 发送消息卡片（交互式）。 */
export async function sendCardMessage(
  message: FeishuCardMessage
): Promise<FeishuSendResult> {
  const client = getFeishuClient();
  const content = lark.messageCard.defaultCard({
    title: message.title,
    content: message.content,
  });
  const response = await client.im.v1.message.create({
    data: {
      receive_id: message.receiveId,
      msg_type: "interactive",
      content,
    },
    params: { receive_id_type: message.receiveIdType },
  });
  return toSendResult(response);
}

/**
 * 通用发送请求的可辨识联合：`kind` 决定 `content` 的形状，
 * 使 TypeScript 能在分支中正确收窄类型。
 */
export type SendMessageRequest =
  | {
      kind: "text";
      receiveId: string;
      receiveIdType: FeishuReceiveIdType;
      content: { text: string };
    }
  | {
      kind: "card";
      receiveId: string;
      receiveIdType: FeishuReceiveIdType;
      content: { title: string; content: string };
    };

/**
 * 通用发送：按请求的 `kind` 选择文本或卡片。
 *
 * @param request 发送请求，`kind` 与 `content` 形状对应
 * @returns 发送结果
 */
export async function sendMessage(
  request: SendMessageRequest
): Promise<FeishuSendResult> {
  if (!isFeishuConfigured()) {
    return { code: -1, msg: "飞书凭证未配置" };
  }
  if (request.kind === "text") {
    return sendTextMessage({
      receiveId: request.receiveId,
      receiveIdType: request.receiveIdType,
      text: request.content.text,
    });
  }
  return sendCardMessage({
    receiveId: request.receiveId,
    receiveIdType: request.receiveIdType,
    title: request.content.title,
    content: request.content.content,
  });
}
