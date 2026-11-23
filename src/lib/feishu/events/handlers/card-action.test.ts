import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/feishu/bot/card-actions", () => ({
  handleCardAction: vi.fn(),
}));
vi.mock("@/lib/feishu/bot/sender", () => ({
  updateCard: vi.fn(async () => ({ ok: true })),
}));

import {
  extractCardAction,
  handleCardActionEvent,
  normalizeActionValue,
} from "./card-action";
import { handleCardAction } from "@/lib/feishu/bot/card-actions";
import { updateCard } from "@/lib/feishu/bot/sender";

function makeEvent(value: unknown) {
  return {
    operator: { open_id: "ou_op" },
    action: { value, tag: "button" },
    context: { open_message_id: "om_card", open_chat_id: "oc_chat" },
  };
}

describe("normalizeActionValue", () => {
  it("解析 JSON 字符串形式的 value", () => {
    expect(
      normalizeActionValue('{"action":"claim_customer","targetId":"c1"}')
    ).toEqual({ action: "claim_customer", targetId: "c1" });
  });

  it("非 JSON 字符串返回空对象", () => {
    expect(normalizeActionValue("not-json")).toEqual({});
  });

  it("数字转成字符串，嵌套对象丢弃", () => {
    expect(normalizeActionValue({ n: 1, nested: { a: 1 } })).toEqual({
      n: "1",
    });
  });
});

describe("extractCardAction", () => {
  it("提取动作、目标与操作人", () => {
    const event = extractCardAction(
      makeEvent({ action: "claim_customer", targetId: "c1" })
    );
    expect(event).toMatchObject({
      operatorOpenId: "ou_op",
      action: "claim_customer",
      targetId: "c1",
      messageId: "om_card",
      chatId: "oc_chat",
    });
  });

  it("缺少 action 或 targetId 时返回 null", () => {
    expect(extractCardAction(makeEvent({ targetId: "c1" }))).toBeNull();
    expect(
      extractCardAction(makeEvent({ action: "claim_customer" }))
    ).toBeNull();
  });

  it("缺少操作人时返回 null", () => {
    expect(
      extractCardAction({ action: { value: { action: "a", targetId: "x" } } })
    ).toBeNull();
  });
});

describe("handleCardActionEvent", () => {
  it("业务处理成功后原地刷新那张卡片", async () => {
    vi.mocked(handleCardAction).mockResolvedValue({
      status: "handled",
      card: { title: "new" },
      summary: "ok",
    });
    await handleCardActionEvent({
      key: "card.action.trigger",
      data: makeEvent({ action: "claim_customer", targetId: "c1" }),
    });
    expect(updateCard).toHaveBeenCalledWith("om_card", { title: "new" });
  });

  it("纯跳转按钮（无返回卡片）不刷新卡片", async () => {
    vi.mocked(updateCard).mockClear();
    vi.mocked(handleCardAction).mockResolvedValue({
      status: "handled",
      summary: "open_link",
    });
    await handleCardActionEvent({
      key: "card.action.trigger",
      data: makeEvent({ action: "open_customer", targetId: "c1" }),
    });
    expect(updateCard).not.toHaveBeenCalled();
  });

  it("未绑定账号时把卡片换成引导卡", async () => {
    vi.mocked(updateCard).mockClear();
    vi.mocked(handleCardAction).mockResolvedValue({ status: "unbound_user" });
    await handleCardActionEvent({
      key: "card.action.trigger",
      data: makeEvent({ action: "claim_customer", targetId: "c1" }),
    });
    expect(updateCard).toHaveBeenCalledTimes(1);
    const [, card] = vi.mocked(updateCard).mock.calls[0];
    expect(JSON.stringify(card)).toContain("账号未绑定");
  });

  it("未知动作直接忽略，不打扰用户", async () => {
    vi.mocked(updateCard).mockClear();
    vi.mocked(handleCardAction).mockResolvedValue({ status: "unknown_action" });
    await handleCardActionEvent({
      key: "card.action.trigger",
      data: makeEvent({ action: "whatever", targetId: "c1" }),
    });
    expect(updateCard).not.toHaveBeenCalled();
  });
});
