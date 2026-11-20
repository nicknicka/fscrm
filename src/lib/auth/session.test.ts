import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
}));

let session: typeof import("./session");

const owner = {
  id: "user_1",
  name: "张三",
  role: "OWNER" as const,
};

beforeAll(async () => {
  session = await import("./session");
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

describe("server session", () => {
  it("signs a session and verifies its owner and role", async () => {
    const token = await session.signSession(owner);

    expect(token).not.toContain(owner.name);
    expect(await session.verifySession(token)).toEqual(owner);
  });

  it("rejects a tampered session", async () => {
    const token = await session.signSession(owner);
    const [, , signature] = token.split(".");
    const changedPayload = Buffer.from(
      JSON.stringify({ ...owner, role: "ADMIN" })
    )
      .toString("base64url")
      .replace(/=+$/, "");
    const tampered = [`header`, changedPayload, signature].join(".");

    expect(await session.verifySession(tampered)).toBeNull();
  });

  it("uses the dedicated session secret, not a generic application secret", async () => {
    vi.stubEnv("SESSION_SECRET", "a-dedicated-secret-at-least-32-bytes-long");
    vi.stubEnv("APP_SECRET", "another-secret-that-is-also-at-least-32-bytes");
    const token = await session.signSession(owner);

    vi.stubEnv("SESSION_SECRET", "a-different-secret-at-least-32-bytes-long");
    expect(await session.verifySession(token)).toBeNull();
  });

  it("writes an HttpOnly SameSite=Lax session cookie", async () => {
    await session.createSession(owner);

    expect(cookieStore.set).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "fscrm_session",
        value: expect.any(String),
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: false,
      })
    );
  });

  it("marks the session cookie Secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await session.createSession(owner);

    expect(cookieStore.set).toHaveBeenCalledWith(
      expect.objectContaining({ secure: true })
    );
  });

  it("clears the session cookie on logout", async () => {
    await session.clearSession();

    expect(cookieStore.delete).toHaveBeenCalledWith("fscrm_session");
  });

  it("reads the current owner and role from a valid session cookie", async () => {
    const token = await session.signSession(owner);
    cookieStore.get.mockReturnValue({ name: "fscrm_session", value: token });

    expect(await session.getCurrentUser()).toEqual(owner);
    expect(cookieStore.get).toHaveBeenCalledWith("fscrm_session");
  });

  it("returns an explicit unauthenticated result when no valid session is present", async () => {
    cookieStore.get.mockReturnValue(undefined);
    expect(await session.getCurrentUser()).toBeNull();

    cookieStore.get.mockReturnValue({
      name: "fscrm_session",
      value: "not-a-valid-session",
    });
    expect(await session.getCurrentUser()).toBeNull();
  });
});
