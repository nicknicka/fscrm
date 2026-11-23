import * as lark from "@larksuiteoapi/node-sdk";
import { getFeishuClient, isFeishuConfigured } from "../client";

/**
 * 机器人发消息 / 刷新卡片的统一出口。
 *
 * 基于 SDK 的 `channel` 能力（`send` / `updateCard`），而不是各自的
 * `im.v1.message.create` 调用——前者对卡片更新、去重与错误归一化更完整。
 *
 * 这里做成**不抛异常**的接口：机器人处理消息时，发送失败只应记录日志，
 * 不能让一条通知失败把整条业务动作回滚掉。
 */

export interface SendCardResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

function toChannel() {
  const client = getFeishuClient();
  return new lark.LarkChannel({
    appId: client.appId,
    appSecret: client.appSecret,
    domain: process.env.FEISHU_APP_DOMAIN?.includes("larksuite")
      ? lark.Domain.Lark
      : lark.Domain.Feishu,
    loggerLevel: lark.LoggerLevel.warn,
  });
}

/**
 * 发送一张卡片。
 *
 * @param receiveId chat_id（群/单聊）或 open_id（个人）
 */
export async function sendCard(
  receiveId: string,
  card: object
): Promise<SendCardResult> {
  if (!isFeishuConfigured()) {
    return { ok: false, error: "飞书凭证未配置" };
  }
  try {
    const channel = toChannel();
    const result = await channel.send(receiveId, { card });
    return { ok: true, messageId: result.messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[feishu:bot] 发送卡片失败 receiveId=${receiveId}`, message);
    return { ok: false, error: message };
  }
}

/** 发送纯文本（用于极简回复或错误提示）。 */
export async function sendText(
  receiveId: string,
  text: string
): Promise<SendCardResult> {
  if (!isFeishuConfigured()) {
    return { ok: false, error: "飞书凭证未配置" };
  }
  try {
    const channel = toChannel();
    const result = await channel.send(receiveId, { text });
    return { ok: true, messageId: result.messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[feishu:bot] 发送文本失败 receiveId=${receiveId}`, message);
    return { ok: false, error: message };
  }
}

/**
 * 原地刷新一张已发送的卡片。
 *
 * 这是「点了按钮，卡片自己变」的实现基础：认领成功后把按钮换掉、
 * 阶段推进后更新标题与下一步按钮，都走这里。
 */
export async function updateCard(
  messageId: string,
  card: object
): Promise<SendCardResult> {
  if (!isFeishuConfigured()) {
    return { ok: false, error: "飞书凭证未配置" };
  }
  try {
    const channel = toChannel();
    await channel.updateCard(messageId, card);
    return { ok: true, messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[feishu:bot] 更新卡片失败 messageId=${messageId}`, message);
    return { ok: false, error: message };
  }
}
