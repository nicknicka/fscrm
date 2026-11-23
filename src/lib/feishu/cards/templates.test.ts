import { describe, expect, it } from "vitest";
import {
  clarificationCard,
  followUpCreatedCard,
  opportunityStageCard,
  publicPoolCard,
  unboundUserCard,
} from "./templates";
import { nextStageOf, STAGE_LABEL } from "@/lib/feishu/bot/actions";

/** 把卡片 JSON 拍平成字符串，便于断言内容。 */
function text(card: object): string {
  return JSON.stringify(card);
}

/** 取出卡片里所有按钮的 value。 */
function buttons(
  card: unknown
): { text: string; value: Record<string, string> }[] {
  const elements =
    (card as { elements?: { tag: string; actions?: unknown[] }[] }).elements ??
    [];
  const action = elements.find((e) => e.tag === "action");
  return (
    (action?.actions ?? []) as {
      text: { content: string };
      value: Record<string, string>;
    }[]
  ).map((a) => ({ text: a.text.content, value: a.value }));
}

describe("followUpCreatedCard", () => {
  it("展示结构化字段并带可点的按钮", () => {
    const card = followUpCreatedCard({
      customerId: "c1",
      customerName: "杭州云启科技",
      opportunityName: "年度采购",
      mode: "CALL",
      content: "客户表示预算 80 万，要求下周提交方案",
      nextFollowUpAt: new Date("2026-11-25T09:00:00+08:00"),
      amount: 800000,
      engine: "model",
    });
    const body = text(card);
    expect(body).toContain("杭州云启科技");
    expect(body).toContain("电话");
    expect(body).toContain("11/25");
    expect(body).toContain("800,000");
    const acts = buttons(card);
    expect(acts.map((a) => a.value.action)).toContain(
      "create_followup_for_customer"
    );
  });

  it("模型引擎与规则引擎的脚注不同，让用户知道要不要核对", () => {
    const model = text(
      followUpCreatedCard({
        customerId: "c1",
        customerName: "A",
        opportunityName: null,
        mode: "CALL",
        content: "x",
        nextFollowUpAt: null,
        amount: null,
        engine: "model",
      })
    );
    const rules = text(
      followUpCreatedCard({
        customerId: "c1",
        customerName: "A",
        opportunityName: null,
        mode: "CALL",
        content: "x",
        nextFollowUpAt: null,
        amount: null,
        engine: "rules",
      })
    );
    expect(model).toContain("由模型解析");
    expect(rules).toContain("关键词识别");
  });
});

describe("clarificationCard", () => {
  it("有候选客户时把候选做成按钮", () => {
    const card = clarificationCard({
      reason: "没找到客户「云启」",
      text: "云启电话聊了",
      candidates: [
        { id: "c1", name: "杭州云启科技" },
        { id: "c2", name: "云启信息" },
      ],
    });
    const acts = buttons(card);
    expect(acts).toHaveLength(2);
    expect(acts[0].value.action).toBe("create_followup_for_customer");
    // 原始文本随按钮带回，点选后据此落库
    expect(acts[0].value.originalText).toContain("云启电话聊了");
  });

  it("没有候选时给出示例句，教用户怎么说", () => {
    const body = text(
      clarificationCard({
        reason: "没听出客户",
        text: "聊了聊",
        candidates: [],
      })
    );
    expect(body).toContain("可以这样再说一次");
  });
});

describe("publicPoolCard", () => {
  it("未认领时带认领按钮", () => {
    const card = publicPoolCard({
      customerId: "c1",
      customerName: "宁波海创",
      level: "HIGH",
      industry: "制造",
    });
    expect(buttons(card)[0].value.action).toBe("claim_customer");
    expect(text(card)).toContain("待认领");
  });

  it("已认领时不再出现认领按钮，避免重复点击", () => {
    const card = publicPoolCard({
      customerId: "c1",
      customerName: "宁波海创",
      level: "HIGH",
      industry: "制造",
      assignedTo: "张三",
    });
    const acts = buttons(card);
    expect(acts.map((a) => a.value.action)).not.toContain("claim_customer");
    expect(text(card)).toContain("张三");
  });
});

describe("opportunityStageCard", () => {
  it("带下一阶段的推进按钮，目标阶段写进 value", () => {
    const card = opportunityStageCard({
      opportunityId: "o1",
      opportunityName: "年度采购",
      customerName: "云启",
      stage: "QUOTE",
      stageLabel: "报价",
      amount: 500000,
      nextStage: { value: "NEGOTIATE", label: "谈判" },
    });
    const acts = buttons(card);
    expect(acts[0].value).toEqual(
      expect.objectContaining({
        action: "advance_opportunity_stage",
        targetId: "o1",
        stage: "NEGOTIATE",
      })
    );
    expect(acts[0].text).toContain("谈判");
  });

  it("已赢单时没有推进按钮", () => {
    const card = opportunityStageCard({
      opportunityId: "o1",
      opportunityName: "年度采购",
      customerName: "云启",
      stage: "WON",
      stageLabel: "赢单",
      amount: null,
      nextStage: null,
    });
    expect(buttons(card).map((a) => a.value.action)).not.toContain(
      "advance_opportunity_stage"
    );
  });
});

describe("unboundUserCard", () => {
  it("把 open_id 交给用户转给管理员", () => {
    const body = text(unboundUserCard("ou_abc"));
    expect(body).toContain("ou_abc");
    expect(body).toContain("账号未绑定");
  });
});

describe("nextStageOf", () => {
  it("按销售阶段顺序给出下一步", () => {
    expect(nextStageOf("CONTACT")?.value).toBe("NEED_CONFIRM");
    expect(nextStageOf("NEGOTIATE")?.value).toBe("WON");
  });

  it("赢单/输单/未知阶段没有下一阶段", () => {
    expect(nextStageOf("WON")).toBeNull();
    expect(nextStageOf("LOST")).toBeNull();
    expect(nextStageOf("WHATEVER")).toBeNull();
  });

  it("阶段标签齐全", () => {
    for (const stage of [
      "CONTACT",
      "NEED_CONFIRM",
      "QUOTE",
      "NEGOTIATE",
      "WON",
      "LOST",
    ]) {
      expect(STAGE_LABEL[stage]).toBeTruthy();
    }
  });
});
