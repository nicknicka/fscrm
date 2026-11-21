import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runContactSync: vi.fn(),
}));

vi.mock("@/lib/services/contact-sync", () => ({
  runContactSync: mocks.runContactSync,
}));

import { POST } from "./route";

const ENDPOINT = "https://crm.example.com/api/cron/sync-contacts";
const SECRET = "cron-secret-for-tests-only";

function cronRequest(headers: Record<string, string> = {}) {
  return new NextRequest(ENDPOINT, { method: "POST", headers });
}

function bearer(secret: string) {
  return { authorization: `Bearer ${secret}` };
}

function successOutcome() {
  return {
    ok: true,
    result: { departmentCount: 3, personCount: 7 },
    totals: { departments: 3, users: 7 },
    startedAt: "2026-01-01T02:00:00.000Z",
    durationMs: 42,
  };
}

describe("POST /api/cron/sync-contacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", SECRET);
    mocks.runContactSync.mockResolvedValue(successOutcome());
  });

  it("rejects a request with no secret header", async () => {
    const response = await POST(cronRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ ok: false, error: "unauthorized" })
    );
    expect(mocks.runContactSync).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong secret", async () => {
    const response = await POST(cronRequest(bearer("not-the-secret")));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ ok: false, error: "unauthorized" })
    );
    expect(mocks.runContactSync).not.toHaveBeenCalled();
  });

  it("rejects a bearer token that only prefixes the real secret", async () => {
    const response = await POST(cronRequest(bearer(`${SECRET}-extra`)));

    expect(response.status).toBe(401);
    expect(mocks.runContactSync).not.toHaveBeenCalled();
  });

  it.each([
    ["an empty CRON_SECRET", ""],
    ["a CRON_SECRET that is only whitespace", "   "],
  ])("fails closed when %s is configured", async (_label, value) => {
    vi.stubEnv("CRON_SECRET", value);
    const response = await POST(cronRequest(bearer(value)));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ ok: false, error: "cron_secret_missing" })
    );
    expect(mocks.runContactSync).not.toHaveBeenCalled();
  });

  it("fails closed when CRON_SECRET is not configured at all", async () => {
    vi.stubEnv("CRON_SECRET", undefined as unknown as string);
    const response = await POST(cronRequest(bearer("anything")));

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ ok: false, error: "cron_secret_missing" }));
    expect(mocks.runContactSync).not.toHaveBeenCalled();
  });

  it("runs the shared sync service and returns a summary for the correct secret", async () => {
    const response = await POST(cronRequest(bearer(SECRET)));

    expect(response.status).toBe(200);
    expect(mocks.runContactSync).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      ranAt: expect.any(String),
      durationMs: 42,
      summary: {
        departments: 3,
        persons: 7,
        totals: { departments: 3, users: 7 },
      },
    });
  });

  it("returns a diagnostic non-2xx response when the sync fails", async () => {
    mocks.runContactSync.mockResolvedValue({
      ok: false,
      error: "飞书凭证未配置，请检查 .env.local",
      startedAt: "2026-01-01T02:00:00.000Z",
      durationMs: 5,
    });

    const response = await POST(cronRequest(bearer(SECRET)));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.ok).toBe(false);
    const body = await response.json();
    expect(body).toEqual(
      expect.objectContaining({
        ok: false,
        error: "sync_failed",
        message: "飞书凭证未配置，请检查 .env.local",
      })
    );
  });

  it("never echoes the configured secret back to the caller", async () => {
    const wrong = await POST(cronRequest(bearer("not-the-secret")));
    const missing = await POST(cronRequest());
    const ok = await POST(cronRequest(bearer(SECRET)));

    for (const response of [wrong, missing, ok]) {
      const text = JSON.stringify(await response.json());
      expect(text).not.toContain(SECRET);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });
});
