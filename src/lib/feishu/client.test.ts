import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { isFeishuConfigured, getFeishuClient } from "./client";

describe("feishu client", () => {
  beforeEach(() => {
    // 清除环境变量，模拟凭证未配置的场景
    vi.stubEnv("FEISHU_APP_ID", "");
    vi.stubEnv("FEISHU_APP_SECRET", "");
    vi.stubEnv("FEISHU_APP_DOMAIN", "https://open.feishu.cn");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("凭证未配置时 isFeishuConfigured 为 false", () => {
    expect(isFeishuConfigured()).toBe(false);
  });

  it("凭证未配置时 getFeishuClient 抛出明确错误", () => {
    expect(() => getFeishuClient()).toThrowError(/飞书凭证未配置/);
  });

  it("凭证配置完整时 isFeishuConfigured 为 true", () => {
    vi.stubEnv("FEISHU_APP_ID", "cli_test_id");
    vi.stubEnv("FEISHU_APP_SECRET", "test_secret");
    expect(isFeishuConfigured()).toBe(true);
  });
});
