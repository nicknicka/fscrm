import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runContactSync } from "@/lib/services/contact-sync";

/**
 * 通讯录同步定时触发端点：`POST /api/cron/sync-contacts`。
 *
 * 供云端调度器（如 Vercel Cron、GitHub Actions、k8s CronJob）按计划调用。
 * 复用 `runContactSync()`，与「设置」页的「立即同步通讯录」及命令行脚本
 * 共用同一套同步服务，不重复实现同步逻辑。
 *
 * 认证：`Authorization: Bearer <CRON_SECRET>`（Vercel Cron 会自动带上该头）。
 * 失败时一律关闭（fail closed）：
 * - 未配置 `CRON_SECRET`（缺失或空白）→ 503，且不执行同步；
 * - 密钥缺失或不匹配 → 401，且不执行同步；
 * - 同步本身失败 → 502，返回可诊断信息。
 * 任何响应都不会回显密钥。
 */

/** 同步失败（已在服务内部转为 `ok:false`）时返回的状态码。 */
const SYNC_FAILED_STATUS = 502;

/** 从 `Authorization` 头取出 Bearer 令牌；格式不符则返回 `null`。 */
function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) {
    return null;
  }
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/** 常量时间比较，避免通过响应时间猜测密钥。 */
function secretsMatch(candidate: string, expected: string): boolean {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  if (candidateBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(candidateBuffer, expectedBuffer);
}

function noStoreJson(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

/** 读取并规整 `CRON_SECRET`；未配置时返回 `null`。 */
function readCronSecret(): string | null {
  const secret = process.env.CRON_SECRET?.trim();
  return secret ? secret : null;
}

/**
 * 处理定时同步请求。
 */
export async function POST(request: Request) {
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
      { ok: false, error: "unauthorized", message: "缺少或无效的 CRON_SECRET。" },
      401
    );
  }

  const outcome = await runContactSync();

  if (!outcome.ok) {
    return noStoreJson(
      {
        ok: false,
        error: "sync_failed",
        message: outcome.error ?? "通讯录同步失败。",
        ranAt: outcome.startedAt,
        durationMs: outcome.durationMs,
      },
      SYNC_FAILED_STATUS
    );
  }

  return noStoreJson(
    {
      ok: true,
      ranAt: outcome.startedAt,
      durationMs: outcome.durationMs,
      summary: {
        departments: outcome.result?.departmentCount ?? 0,
        persons: outcome.result?.personCount ?? 0,
        totals: outcome.totals ?? { departments: 0, users: 0 },
      },
    },
    200
  );
}
