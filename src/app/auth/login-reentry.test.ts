import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
}));

let session: typeof import("@/lib/auth/session");

beforeAll(async () => {
  session = await import("@/lib/auth/session");
});

beforeEach(() => {
  cookieStore.get.mockReset();
  cookieStore.set.mockReset();
  cookieStore.delete.mockReset();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv(
    "SESSION_SECRET",
    "test-session-secret-that-is-at-least-thirty-two-bytes"
  );
});

describe("logout and login re-entry", () => {
  it("invalidates a previously issued session after the cookie is cleared", async () => {
    const owner = {
      id: "user_1",
      name: "张三",
      role: "OWNER" as const,
    };
    const token = await session.signSession(owner);

    cookieStore.get.mockReturnValue({ name: "fscrm_session", value: token });
    expect(await session.getCurrentUser()).toEqual(owner);

    await session.clearSession();
    expect(cookieStore.delete).toHaveBeenCalledWith("fscrm_session");

    cookieStore.get.mockReturnValue(undefined);
    expect(await session.getCurrentUser()).toBeNull();
  });
});
