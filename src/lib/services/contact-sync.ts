import { DbContactStore } from "@/lib/db/contact-store";
import { syncContacts } from "@/lib/feishu/contact/sync";
import type { ContactSyncResult } from "@/lib/feishu/contact/types";
import {
  listAllDepartments,
  listUsersByDepartment,
} from "@/lib/feishu/contact/client";
import { isFeishuConfigured } from "@/lib/feishu/client";

/**
 * 飞书通讯录同步服务。
 *
 * 把「校验凭证 → 拉取 → 映射 → 落库」封装成一处，供管理页 Server Action
 * 与定时任务脚本共同调用，保证两条路径行为一致。
 */

/** 同步运行结果，便于展示给使用者。 */
export interface RunContactSyncResult {
  /** 是否成功。 */
  ok: boolean;
  /** 同步统计（成功时）。 */
  result?: ContactSyncResult;
  /** 数据库中的当前部门/用户数。 */
  totals?: { departments: number; users: number };
  /** 失败原因。 */
  error?: string;
  /** 运行开始时间。 */
  startedAt: string;
  /** 运行时长（毫秒）。 */
  durationMs: number;
}

/**
 * 执行一次通讯录同步。
 *
 * 不抛异常：任何失败都转为 `ok:false` 的结果对象，便于 UI 与脚本统一处理。
 */
export async function runContactSync(): Promise<RunContactSyncResult> {
  const startedAt = new Date().toISOString();
  const start = Date.now();

  if (!isFeishuConfigured()) {
    return {
      ok: false,
      error: "飞书凭证未配置，请检查 .env.local",
      startedAt,
      durationMs: Date.now() - start,
    };
  }

  try {
    const store = new DbContactStore();
    const result = await syncContacts(store, {
      listAllDepartments,
      listUsersByDepartment,
    });
    const { prisma } = await import("@/lib/db/client");
    const [departments, users] = await Promise.all([
      prisma.department.count(),
      prisma.user.count(),
    ]);
    return {
      ok: true,
      result,
      totals: { departments, users },
      startedAt,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: message,
      startedAt,
      durationMs: Date.now() - start,
    };
  }
}
