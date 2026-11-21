import { describe, expect, it } from "vitest";
import { fillTemplate, getNotificationTemplate } from "./notification";

describe("fillTemplate", () => {
  it("将占位替换为提供的变量值", () => {
    const result = fillTemplate("跟进 {{customerName}}", {
      customerName: "Acme",
    });
    expect(result).toBe("跟进 Acme");
  });

  it("未提供的变量保留原占位", () => {
    const result = fillTemplate("跟进 {{customerName}} {{opportunityName}}", {
      customerName: "Acme",
    });
    expect(result).toBe("跟进 Acme {{opportunityName}}");
  });

  it("无变量时原样返回", () => {
    expect(fillTemplate("纯文本", {})).toBe("纯文本");
  });
});

describe("getNotificationTemplate", () => {
  it("跟进提醒使用卡片模板", () => {
    const template = getNotificationTemplate("follow_up_reminder");
    expect(template.kind).toBe("card");
    expect(template.title).toContain("跟进提醒");
    expect(template.body).toContain("{{customerName}}");
  });

  it("审批通知使用卡片模板", () => {
    const template = getNotificationTemplate("approval_notification");
    expect(template.kind).toBe("card");
    expect(template.title).toContain("审批通知");
  });

  it("客户认领使用独立的卡片模板，不复用新客户创建的措辞", () => {
    const claimed = getNotificationTemplate("customer_claimed");
    const created = getNotificationTemplate("customer_created");

    expect(claimed.kind).toBe("card");
    expect(claimed.title).toBe("客户认领");
    expect(claimed.body).toBe("您已认领客户「{{customerName}}」，请及时跟进。");
    expect(claimed.title).not.toBe(created.title);
    expect(claimed.body).not.toBe(created.body);
    expect(
      fillTemplate(claimed.body, { customerName: "Acme" })
    ).toBe("您已认领客户「Acme」，请及时跟进。");
  });
});
