import { describe, expect, it } from "vitest";
import {
  extractJsonObject,
  matchCustomer,
  normalizeName,
  parseRelativeDate,
  ruleBasedParse,
  type CustomerCandidate,
} from "./followup-parser";

const candidates: CustomerCandidate[] = [
  {
    id: "c1",
    name: "杭州云启科技有限公司",
    opportunities: [{ id: "o1", name: "云启 2026 年度采购", stage: "QUOTE" }],
  },
  {
    id: "c2",
    name: "云启信息",
    opportunities: [],
  },
  {
    id: "c3",
    name: "宁波海创",
    opportunities: [],
  },
];

describe("normalizeName", () => {
  it("去掉公司后缀、括号说明与空白", () => {
    expect(normalizeName(" 杭州云启科技有限公司 ")).toBe("杭州云启科技");
    expect(normalizeName("宁波海创（集团）")).toBe("宁波海创");
    expect(normalizeName("A B  C")).toBe("abc");
  });
});

describe("matchCustomer", () => {
  it("归一化后完全相等视为命中", () => {
    const result = matchCustomer("杭州云启科技", candidates);
    expect(result.kind).toBe("matched");
    if (result.kind === "matched") {
      expect(result.candidate.id).toBe("c1");
    }
  });

  it("包含关系且唯一命中时视为命中", () => {
    const result = matchCustomer("宁波海创", candidates);
    expect(result.kind).toBe("matched");
    if (result.kind === "matched") {
      expect(result.candidate.id).toBe("c3");
    }
  });

  it("命中多个客户时返回歧义候选，交给用户选择", () => {
    // 「云启」同时包含在 c1 与 c2 里
    const result = matchCustomer("云启", candidates);
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.options.map((o) => o.id).sort()).toEqual(["c1", "c2"]);
    }
  });

  it("没有任何关联时返回 none", () => {
    const result = matchCustomer("深圳未知公司", candidates);
    expect(result.kind).toBe("none");
  });

  it("空名字不匹配", () => {
    expect(matchCustomer("   ", candidates).kind).toBe("none");
  });
});

describe("parseRelativeDate", () => {
  // 2026-11-22 是周日
  const now = new Date("2026-11-22T10:00:00+08:00");

  it("识别今天/明天/后天", () => {
    expect(parseRelativeDate("今天", now)?.getDate()).toBe(22);
    expect(parseRelativeDate("明天", now)?.getDate()).toBe(23);
    expect(parseRelativeDate("后天", now)?.getDate()).toBe(24);
  });

  it("识别下周三", () => {
    // 2026-11-22 是周日，本周三已过，因此「下周三」= 11-25
    const date = parseRelativeDate("下周三", now);
    expect(date?.getMonth()).toBe(10);
    expect(date?.getDate()).toBe(25);
  });

  it("识别 N 天后", () => {
    expect(parseRelativeDate("3天后", now)?.getDate()).toBe(25);
  });

  it("识别 12月5日", () => {
    const date = parseRelativeDate("12月5日", now);
    expect(date?.getMonth()).toBe(11);
    expect(date?.getDate()).toBe(5);
  });

  it("直接给 ISO 日期时原样使用", () => {
    const date = parseRelativeDate("2026-12-01", now);
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(11);
    expect(date?.getDate()).toBe(1);
  });

  it("无法识别时返回 null，不做猜测", () => {
    expect(parseRelativeDate("有空再说", now)).toBeNull();
    expect(parseRelativeDate("", now)).toBeNull();
  });
});

describe("ruleBasedParse", () => {
  it("从消息里找到客户并按关键词判断跟进方式", () => {
    const result = ruleBasedParse(
      "杭州云启科技今天电话聊了，预算80万，下周三要方案",
      candidates
    );
    expect(result.kind).toBe("ready");
    if (result.kind === "ready") {
      expect(result.customerId).toBe("c1");
      expect(result.mode).toBe("CALL");
      expect(result.engine).toBe("rules");
      expect(result.amount).toBe(800000);
      expect(result.nextFollowUpAt).not.toBeNull();
      // 有商机时自动带上
      expect(result.opportunityId).toBe("o1");
    }
  });

  it("没认出客户时要求澄清，不硬写", () => {
    const result = ruleBasedParse("今天跟一个客户聊了很久", candidates);
    expect(result.kind).toBe("needs_clarification");
  });

  it("同时提到多个客户时要求澄清并给出候选", () => {
    const result = ruleBasedParse(
      "宁波海创和杭州云启科技都打过电话了",
      candidates
    );
    expect(result.kind).toBe("needs_clarification");
    if (result.kind === "needs_clarification") {
      expect(result.candidates.length).toBeGreaterThan(1);
    }
  });

  it("识别见面场景", () => {
    const result = ruleBasedParse("下午去宁波海创拜访", candidates);
    expect(result.kind).toBe("ready");
    if (result.kind === "ready") {
      expect(result.mode).toBe("MEETING");
    }
  });

  it("消息过短时不当作跟进", () => {
    expect(ruleBasedParse("嗯", candidates).kind).toBe("not_a_followup");
  });
});

describe("extractJsonObject", () => {
  it("解析纯 JSON", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it("跳过 ```json 代码围栏", () => {
    expect(extractJsonObject('```json\n{"is_followup": true}\n```')).toEqual({
      is_followup: true,
    });
  });

  it("忽略前后多余文字", () => {
    expect(extractJsonObject('好的，结果是 {"b":2} 以上')).toEqual({ b: 2 });
  });

  it("没有 JSON 时抛错，由上层退回规则解析", () => {
    expect(() => extractJsonObject("我不会")).toThrow();
  });
});
