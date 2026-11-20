import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearSession: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  clearSession: mocks.clearSession,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

import { logout } from "./actions";

describe("logout control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clearSession.mockResolvedValue(undefined);
    mocks.redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  it("clears the session and sends the user to the login entry", async () => {
    await expect(logout()).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.clearSession).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });
});
