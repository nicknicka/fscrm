import { describe, expect, it } from "vitest";
import { ONBOARDING_STEPS } from "./guide-steps";

describe("操作引导步骤", () => {
  it("每一步都有唯一 id、标题与说明", () => {
    const ids = new Set<string>();
    for (const step of ONBOARDING_STEPS) {
      expect(step.id).toBeTruthy();
      expect(step.title).toBeTruthy();
      expect(step.body).toBeTruthy();
      expect(ids.has(step.id)).toBe(false);
      ids.add(step.id);
    }
  });

  it("覆盖从录入客户到收款的完整链路", () => {
    const ids = ONBOARDING_STEPS.map((s) => s.id);
    expect(ids).toContain("create-customer");
    expect(ids).toContain("followup-form");
    expect(ids).toContain("create-opportunity");
    expect(ids).toContain("nav-funnel");
    expect(ids).toContain("nav-orders");

    const first = ONBOARDING_STEPS[0];
    const last = ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1];
    expect(first.path).toBe("/");
    expect(last.id).toBe("nav-orders");
  });

  it("至少包含一个跨页步骤，用于指引用户切换模块", () => {
    const crossPage = ONBOARDING_STEPS.filter((s) => Boolean(s.path));
    expect(crossPage.length).toBeGreaterThan(0);
  });
});
