import { describe, expect, it } from "vitest";
import { matchUser, resolveUser } from "./binding";
import type { PersonLookup } from "./binding";
import type { FeishuUserProfile } from "./types";

function profile(openId: string): FeishuUserProfile {
  return { openId, name: "张三" };
}

describe("matchUser", () => {
  const lookup: PersonLookup = {
    findByOpenId: (openId) =>
      openId === "ou_1" ? { id: "p_1", name: "张三" } : null,
  };

  it("开放 ID 匹配到 CRM 人员时返回该人员", () => {
    const person = matchUser(profile("ou_1"), lookup);
    expect(person).toEqual({ id: "p_1", name: "张三" });
  });

  it("未匹配时返回 null", () => {
    expect(matchUser(profile("ou_999"), lookup)).toBeNull();
  });

  it("缺少开放 ID 时返回 null", () => {
    expect(matchUser({ openId: "" }, lookup)).toBeNull();
  });
});

describe("resolveUser", () => {
  const lookup: PersonLookup = {
    findByOpenId: (openId) => (openId === "ou_1" ? { id: "p_1" } : null),
  };

  it("匹配到时状态为 matched", () => {
    const result = resolveUser(profile("ou_1"), lookup);
    expect(result.status).toBe("matched");
    expect(result.person?.id).toBe("p_1");
    expect(result.profile.openId).toBe("ou_1");
  });

  it("未匹配时状态为 unmatched 且人员为 null", () => {
    const result = resolveUser(profile("ou_999"), lookup);
    expect(result.status).toBe("unmatched");
    expect(result.person).toBeNull();
  });
});
