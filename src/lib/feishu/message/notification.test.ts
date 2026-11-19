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
});
