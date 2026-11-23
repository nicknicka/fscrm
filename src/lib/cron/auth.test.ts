import { afterEach, describe, expect, it } from "vitest";
import {
  guardCronRequest,
  readBearerToken,
  readCronSecret,
  secretsMatch,
} from "./auth";

const ORIGINAL = process.env.CRON_SECRET;

afterEach(() => {
  process.env.CRON_SECRET = ORIGINAL;
});

function req(authorization?: string) {
  return new Request("http://localhost/api/cron/reminders", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });
}

describe("readBearerToken", () => {
  it("取出 Bearer 令牌（大小写不敏感）", () => {
    expect(readBearerToken(req("Bearer abc")!)).toBe("abc");
    expect(readBearerToken(req("bearer  abc ")!)).toBe("abc");
  });

  it("格式不符返回 null", () => {
    expect(readBearerToken(req("Basic abc")!)).toBeNull();
    expect(readBearerToken(req()!)).toBeNull();
  });
});

describe("readCronSecret", () => {
  it("未配置或空白时返回 null", () => {
    process.env.CRON_SECRET = "";
    expect(readCronSecret()).toBeNull();
    process.env.CRON_SECRET = "   ";
    expect(readCronSecret()).toBeNull();
  });

  it("配置后返回去空格的值", () => {
    process.env.CRON_SECRET = "  s3cret  ";
    expect(readCronSecret()).toBe("s3cret");
  });
});

describe("secretsMatch", () => {
  it("长度不同直接不匹配", () => {
    expect(secretsMatch("a", "ab")).toBe(false);
  });

  it("相同内容匹配", () => {
    expect(secretsMatch("abc", "abc")).toBe(true);
  });
});

describe("guardCronRequest", () => {
  it("未配置 CRON_SECRET 时 fail closed（503）", () => {
    process.env.CRON_SECRET = "";
    const response = guardCronRequest(req("Bearer x"));
    expect(response?.status).toBe(503);
  });

  it("密钥不匹配时 401", () => {
    process.env.CRON_SECRET = "expected";
    const response = guardCronRequest(req("Bearer wrong"));
    expect(response?.status).toBe(401);
  });

  it("缺少 Authorization 头时 401", () => {
    process.env.CRON_SECRET = "expected";
    expect(guardCronRequest(req())?.status).toBe(401);
  });

  it("通过时返回 null，交由调用方继续", () => {
    process.env.CRON_SECRET = "expected";
    expect(guardCronRequest(req("Bearer expected"))).toBeNull();
  });

  it("响应体不回显密钥", async () => {
    process.env.CRON_SECRET = "super-secret-value";
    const response = guardCronRequest(req("Bearer wrong"));
    const body = await response!.text();
    expect(body).not.toContain("super-secret-value");
  });
});
