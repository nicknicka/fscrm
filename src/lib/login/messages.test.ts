import { describe, expect, it } from "vitest";

import { loginErrorMessage, loginMessages } from "./messages";

describe("登录页错误提示", () => {
  // 每个错误码都是回调路由会带回来的取值，提示必须是用户看得懂的完整说明。
  it.each([
    ["unbound", "尚未绑定 CRM 负责人", "请联系管理员完成绑定"],
    ["denied", "未通过飞书授权", "请在授权页同意所需权限"],
    ["cancelled", "已取消飞书授权", "可以重新发起授权"],
    ["invalid_state", "授权状态校验失败", "本次授权链接已失效"],
    ["auth_failed", "飞书授权或登录失败", "请联系管理员"],
    ["config_missing", "飞书应用或会话配置缺失", "回调地址"],
  ])("错误码 %s 给出标题与可操作的说明", (code, title, detailFragment) => {
    const message = loginErrorMessage(code);

    expect(message?.title).toBe(title);
    expect(message?.detail).toContain(detailFragment);
  });

  it("每个错误码的提示都与错误码逐条对应，不串内容", () => {
    const declared = Object.keys(loginMessages);
    const distinctTitles = new Set(
      Object.values(loginMessages).map((m) => m.title)
    );

    expect(declared).toEqual([
      "unbound",
      "denied",
      "cancelled",
      "invalid_state",
      "auth_failed",
      "config_missing",
    ]);
    expect(distinctTitles.size).toBe(declared.length);
  });

  it("没有 error 参数时不提示", () => {
    expect(loginErrorMessage(undefined)).toBeNull();
    expect(loginErrorMessage("")).toBeNull();
  });

  it("重复的 error 参数按首个处理", () => {
    expect(loginErrorMessage(["denied", "unbound"])?.title).toBe(
      "未通过飞书授权"
    );
  });

  it("未知错误码不泄露内部错误名", () => {
    expect(loginErrorMessage("unknown_code")).toBeNull();
    expect(loginErrorMessage("constructor")).toBeNull();
    expect(loginErrorMessage("toString")).toBeNull();
  });
});
