import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, maskSecret } from "./secret-box";

const ORIGINAL_SECRET = process.env.SESSION_SECRET;

beforeEach(() => {
  process.env.SESSION_SECRET = "a".repeat(32);
});

afterEach(() => {
  process.env.SESSION_SECRET = ORIGINAL_SECRET;
});

describe("encryptSecret / decryptSecret", () => {
  it("加密后能原样解回", () => {
    const plain = "sk-test-1234567890abcdef";
    const cipher = encryptSecret(plain);
    expect(cipher).not.toContain(plain);
    expect(decryptSecret(cipher)).toBe(plain);
  });

  it("同一明文两次加密结果不同（随机 IV）", () => {
    const plain = "sk-same";
    expect(encryptSecret(plain)).not.toBe(encryptSecret(plain));
  });

  it("密文被篡改时解密失败，而不是返回乱码", () => {
    const cipher = encryptSecret("sk-secret");
    const parts = cipher.split(".");
    parts[3] = parts[3].slice(0, -4) + "AAAA";
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });

  it("SESSION_SECRET 变更后旧密文无法解密", () => {
    const cipher = encryptSecret("sk-secret");
    process.env.SESSION_SECRET = "b".repeat(32);
    expect(() => decryptSecret(cipher)).toThrow();
  });

  it("SESSION_SECRET 缺失或过短时拒绝加密", () => {
    process.env.SESSION_SECRET = "short";
    expect(() => encryptSecret("x")).toThrow(/SESSION_SECRET/);
  });

  it("格式不认识时抛错", () => {
    expect(() => decryptSecret("garbage")).toThrow(/格式/);
  });
});

describe("maskSecret", () => {
  it("保留头尾便于辨认", () => {
    expect(maskSecret("sk-1234567890abcd")).toBe("sk-…abcd");
  });

  it("过短时全掩码", () => {
    expect(maskSecret("sk-1")).toBe("****");
  });
});
