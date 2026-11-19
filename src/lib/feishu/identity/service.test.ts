import { describe, expect, it, vi, beforeEach } from "vitest";

// 模拟 OAuth 与用户身份获取，避免真实网络调用
const { exchangeCodeForTokenMock, fetchUserProfileMock } = vi.hoisted(() => ({
  exchangeCodeForTokenMock: vi.fn(async () => ({
    accessToken: "utok_1",
    refreshToken: "rtok_1",
  })),
  fetchUserProfileMock: vi.fn(async () => ({
    openId: "ou_1",
    name: "张三",
  })),
}));

vi.mock("./oauth", () => ({
  exchangeCodeForToken: exchangeCodeForTokenMock,
  fetchUserProfile: fetchUserProfileMock,
}));

import { authenticateWithCode } from "./service";
import type { PersonLookup } from "./binding";

describe("authenticateWithCode", () => {
  beforeEach(() => {
    exchangeCodeForTokenMock.mockClear();
    fetchUserProfileMock.mockClear();
  });

  it("完成认证并匹配到 CRM 用户", async () => {
    const lookup: PersonLookup = {
      findByOpenId: (openId) => (openId === "ou_1" ? { id: "p_1" } : null),
    };

    const result = await authenticateWithCode("code_abc", lookup);

    expect(exchangeCodeForTokenMock).toHaveBeenCalledWith("code_abc");
    expect(fetchUserProfileMock).toHaveBeenCalledWith("utok_1");

    expect(result.auth.token.accessToken).toBe("utok_1");
    expect(result.auth.user.openId).toBe("ou_1");
    expect(result.match.status).toBe("matched");
    expect(result.match.person?.id).toBe("p_1");
  });

  it("未匹配到 CRM 用户时状态为 unmatched", async () => {
    const lookup: PersonLookup = {
      findByOpenId: () => null,
    };

    const result = await authenticateWithCode("code_abc", lookup);

    expect(result.auth.user.openId).toBe("ou_1");
    expect(result.match.status).toBe("unmatched");
    expect(result.match.person).toBeNull();
  });
});
