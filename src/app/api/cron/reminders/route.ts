import { guardCronRequest, noStoreJson } from "@/lib/cron/auth";
import { dispatchReminders } from "@/lib/reminders/dispatch";

/**
 * 待办提醒定时推送端点：`POST /api/cron/reminders`。
 *
 * 供云端调度器每天调用一次。扫描「跟进超期 / 客户沉默 / 待回款」，
 * 按负责人聚合成卡片推到飞书。
 *
 * 认证与 `/api/cron/sync-contacts` 一致（`Authorization: Bearer <CRON_SECRET>`），
 * 未配置密钥时一律拒绝，不做任何推送。
 */

export async function POST(request: Request) {
  const rejected = guardCronRequest(request);
  if (rejected) return rejected;

  try {
    const result = await dispatchReminders();
    return noStoreJson({ ok: true, ...result }, 200);
  } catch (error) {
    console.error("[cron:reminders] 推送提醒失败", error);
    return noStoreJson(
      {
        ok: false,
        error: "dispatch_failed",
        message:
          error instanceof Error
            ? error.message
            : "未知错误，请查看服务端日志。",
      },
      502
    );
  }
}
