import { describe, expect, it } from "vitest";
import {
  isSafeRedirectPath,
  normalizeSafeRedirectPath,
} from "./redirect";

describe("OAuth redirect path validation", () => {
  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/customer\u000anext",
    "customer",
    "",
  ])("rejects unsafe value %j", (value) => {
    expect(isSafeRedirectPath(value)).toBe(false);
    expect(normalizeSafeRedirectPath(value)).toBeNull();
  });

  it("accepts and normalizes a same-origin path", () => {
    expect(isSafeRedirectPath("/customers?q=1")).toBe(true);
    expect(normalizeSafeRedirectPath("/customers?q=1")).toBe(
      "/customers?q=1"
    );
  });
});
