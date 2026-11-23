import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * 定时任务端点的公共鉴权。
 *
 * 与 `/api/cron/sync-contacts` 使用同一套规则：`Authorization: Bearer <CRON_SECRET>`，
 * 失败一律关闭（未配置密钥时拒绝执行），且响应从不回显密钥。
 * 抽出来是因为现在有两个 cron 端点，重复实现容易在某一处漏掉 fail-closed。
 */

/** 从 `Authorization` 头取出 Bearer 令牌；格式不符返回 `null`。 */
export function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/** 常量时间比较，避免通过响应时间猜测密钥。 */
export function secretsMatch(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** 读取并规整 `CRON_SECRET`；未配置时返回 `null`。 */
export function readCronSecret(): string | null {
  const secret = process.env.CRON_SECRET?.trim();
  return secret ? secret : null;
}

/** 不带缓存的 JSON 响应。 */
export function noStoreJson(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

/**
 * 校验定时任务请求。
 *
 * @returns 通过时返回 `null`；否则返回应直接返回的响应。
 */
export function guardCronRequest(request: Request): NextResponse | null {
  const expected = readCronSecret();
  if (!expected) {
    return noStoreJson(
      {
        ok: false,
        error: "cron_secret_missing",
        message: "服务端未配置 CRON_SECRET，端点已拒绝执行。",
      },
      503
    );
  }
  const token = readBearerToken(request);
  if (!token || !secretsMatch(token, expected)) {
    return noStoreJson(
      {
        ok: false,
        error: "unauthorized",
        message: "缺少或无效的 CRON_SECRET。",
      },
      401
    );
  }
  return null;
}
