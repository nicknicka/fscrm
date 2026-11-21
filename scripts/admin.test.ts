import { describe, expect, it } from "vitest";
import { parseAdminArgs } from "./admin";

describe("管理员命令行参数解析", () => {
  it("接受 grant/revoke 与 --id", () => {
    expect(parseAdminArgs(["grant", "--id", "user_1"])).toEqual({
      action: "grant",
      ref: { id: "user_1" },
    });
    expect(parseAdminArgs(["revoke", "--id", "user_1"])).toEqual({
      action: "revoke",
      ref: { id: "user_1" },
    });
  });

  it("接受 grant/revoke 与 --open-id", () => {
    expect(parseAdminArgs(["grant", "--open-id", "ou_1"])).toEqual({
      action: "grant",
      ref: { openId: "ou_1" },
    });
    expect(parseAdminArgs(["revoke", "--open-id", "ou_1"])).toEqual({
      action: "revoke",
      ref: { openId: "ou_1" },
    });
  });

  it("错误用法抛清晰错误", () => {
    expect(() => parseAdminArgs([])).toThrow(/用法/);
    expect(() => parseAdminArgs(["grant"])).toThrow(/定位条件/);
    expect(() => parseAdminArgs(["promote", "--id", "u"])).toThrow(
      /grant|revoke/
    );
    expect(() =>
      parseAdminArgs(["grant", "--id", "u", "--open-id", "ou"])
    ).toThrow(/只能提供/);
  });
});
